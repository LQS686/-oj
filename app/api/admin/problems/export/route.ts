/**
 * /api/admin/problems/export - 题库导出（管理员）
 *
 * 支持两种导出模式：
 *   1. 默认（无 format 参数）：导出 CSV 报表（原行为）
 *   2. format=dsoj：导出 DSOJ 标准题包 ZIP / tar.xz
 *
 * 查询参数：
 *   - format：导出格式（dsoj 触发题包 ZIP/tar.xz 导出）
 *   - ids：题目 ID 列表（逗号分隔，dsoj 模式用）
 *   - archive：归档格式（zip | tar.xz，默认 zip）
 *     - zip：zlib level=1 速度优先，流式响应
 *     - tar.xz：LZMA preset=1 体积再降 20-35%，但压缩慢 5-10 倍
 *   - includeStdCode：是否包含标程（true/false，默认 true）
 *   - includeTestCases：是否包含测试用例（true/false，默认 true）
 *   - includeSolutions：是否包含题解（true/false，默认 true）
 *
 * dsoj 模式采用流式响应（DsojArchiveWriter → PassThrough → Web ReadableStream）：
 *   - 边查数据库边压缩边推流，首字节时间从"全量生成"降到"首题序列化"
 *   - 内存峰值从"全量数据"降到"单批 50 题"
 *   - 上限放开到 1000 题（原 200 题硬限制由 OOM 风险逼出，流式后已不必要）
 */
import { withApi } from '@/lib/api/withApi'
import {
  createDsojArchiveWriter,
  exportDsojPackStream,
  type DsojArchiveFormat,
} from '@/lib/problem/export/dsoj-exporter'
import { prisma } from '@/lib/prisma'
import { PassThrough } from 'node:stream'
import { Readable } from 'node:stream'
import { logger } from '@/lib/logger'

/** 单次题包导出上限（流式后可放开，仍设上限避免极端值拖垮服务器） */
const DSOJ_EXPORT_MAX_PROBLEMS = 1000

export const runtime = 'nodejs'
// 流式响应需要较长超时（按 1000 题最坏情况估算；tar.xz 更慢，留足余量）
export const maxDuration = 600

export const GET = withApi.admin(async (req, _ctx) => {
  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') || ''

  // DSOJ 标准题包导出：必须指定 ids，避免全库打包 OOM
  if (format === 'dsoj') {
    const idsParam = searchParams.get('ids') || ''
    const problemIds = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (problemIds.length === 0) {
      const { fail } = await import('@/lib/api/response')
      return fail('MISSING_IDS', '题包导出请通过 ids 指定题目（逗号分隔）', 400)
    }
    if (problemIds.length > DSOJ_EXPORT_MAX_PROBLEMS) {
      const { fail } = await import('@/lib/api/response')
      return fail(
        'TOO_MANY_IDS',
        `单次题包导出最多 ${DSOJ_EXPORT_MAX_PROBLEMS} 题`,
        400
      )
    }

    // 归档格式：zip（默认）/ tar.xz
    const archiveParam = (searchParams.get('archive') || 'zip').toLowerCase()
    const archiveFormat: DsojArchiveFormat =
      archiveParam === 'tar.xz' || archiveParam === 'txz' ? 'tar.xz' : 'zip'

    const includeStdCode = searchParams.get('includeStdCode') !== 'false'
    const includeTestCases = searchParams.get('includeTestCases') !== 'false'
    const includeSolutions = searchParams.get('includeSolutions') !== 'false'

    // 创建归档写入器
    //   - ZipArchiveWriter：archiver + zlib level=1
    //   - TarXzArchiveWriter：tar-stream + lzma-native preset=1
    // 两者均通过 DsojArchiveWriter 接口统一，输出 PassThrough 作为 Response body
    const writer = createDsojArchiveWriter(archiveFormat)
    const passthrough: PassThrough = writer.output

    // 异步触发流式导出（不 await，让响应头立即返回）
    //   - 导出完成后调用 writer.finalize() 关闭流（exportDsojPackStream 内部已调）
    //   - 任何异常通过 destroy 传播到 PassThrough，最终 controller.error
    void (async () => {
      try {
        await exportDsojPackStream(
          {
            problemIds,
            includeStdCode,
            includeTestCases,
            includeSolutions,
            packSource: 'DSOJ Admin Export',
          },
          writer
        )
        // exportDsojPackStream 内部已经调用了 writer.finalize()
      } catch (err) {
        logger.error('流式题包导出失败', {
          archiveFormat,
          error: err instanceof Error ? err.message : String(err),
        })
        // 通过 destroy 传播错误到下游 PassThrough
        passthrough.destroy(
          err instanceof Error ? err : new Error(String(err))
        )
      }
    })()

    // PassThrough → Web ReadableStream
    const webStream = Readable.toWeb(passthrough) as ReadableStream<Uint8Array>

    const dateStr = new Date().toISOString().split('T')[0]
    const ext = archiveFormat === 'tar.xz' ? 'tar.xz' : 'zip'
    const mimeType = archiveFormat === 'tar.xz' ? 'application/x-xz' : 'application/zip'

    return new Response(webStream, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="dsoj-pack-${dateStr}.${ext}"`,
        // 不设置 Content-Length：流式响应无法预知最终大小，浏览器按 chunked 接收
        'X-Content-Type-Options': 'nosniff',
        // 禁用 nginx/CDN 缓冲：让数据尽快推送到客户端
        'X-Accel-Buffering': 'no',
      },
    })
  }

  // 默认：CSV 报表导出（硬顶 5000，可用 ids / limit 收窄）
  const idsParam = searchParams.get('ids') || ''
  const idFilter = idsParam
    ? idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5000)
    : undefined
  const limitRaw = parseInt(searchParams.get('limit') || '5000', 10)
  const take = Math.min(5000, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 5000))

  const problems = await prisma.problem.findMany({
    where: idFilter && idFilter.length > 0 ? { id: { in: idFilter } } : undefined,
    select: {
      id: true,
      title: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      totalSubmit: true,
      totalAccepted: true,
    },
    orderBy: { createdAt: 'desc' },
    take,
  })

  // Generate CSV
  const headers = ['ID', 'Title', 'Source', 'Created At', 'Updated At', 'Submissions', 'Accepted']
  const rows = problems.map((p) => [
    p.id,
    p.title,
    p.source || '',
    p.createdAt.toISOString(),
    p.updatedAt.toISOString(),
    p.totalSubmit,
    p.totalAccepted,
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  // Return as download
  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="problems_report_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
})
