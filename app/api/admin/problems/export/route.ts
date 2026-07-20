/**
 * /api/admin/problems/export - 题库导出（管理员）
 *
 * 支持两种导出模式：
 *   1. 默认（无 format 参数）：导出 CSV 报表（原行为）
 *   2. format=dsoj：导出 DSOJ 标准题包 ZIP
 *
 * 查询参数：
 *   - source：来源过滤（all / MANUAL_CREATED / AI_ASSISTED / AI_GENERATED），CSV 模式用
 *   - format：导出格式（dsoj 触发题包 ZIP 导出）
 *   - ids：题目 ID 列表（逗号分隔，dsoj 模式用，与 source 二选一）
 *   - includeStdCode：是否包含标程（true/false，默认 true，dsoj 模式用）
 *   - includeTestCases：是否包含测试用例（true/false，默认 true，dsoj 模式用）
 */
import { withApi, throw400 } from '@/lib/api/withApi'
import { listProblemsForExport } from '@/lib/problem/service'
import { exportDsojPack } from '@/lib/problem/export/dsoj-exporter'

export const GET = withApi.admin(async (req, _ctx) => {
  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source') || 'all'
  const format = searchParams.get('format') || ''

  // DSOJ 标准题包导出
  if (format === 'dsoj') {
    const idsParam = searchParams.get('ids') || ''
    const problemIds = idsParam
      ? idsParam.split(',').map(s => s.trim()).filter(Boolean)
      : undefined

    // 来源映射：URL 参数 → 数据库 aiStatus
    let sourceFilter: 'all' | 'MANUAL_CREATED' | 'AI_ASSISTED' | 'AI_GENERATED' = 'all'
    if (!problemIds && source !== 'all') {
      if (source === 'MANUAL_CREATED' || source === 'AI_ASSISTED' || source === 'AI_GENERATED') {
        sourceFilter = source
      } else {
        throw400('INVALID_SOURCE', `无效的来源: ${source}`)
      }
    }

    const includeStdCode = searchParams.get('includeStdCode') !== 'false'
    const includeTestCases = searchParams.get('includeTestCases') !== 'false'

    const zipBuffer = await exportDsojPack({
      problemIds,
      source: sourceFilter,
      includeStdCode,
      includeTestCases,
      packSource: 'DSOJ Admin Export',
    })

    const dateStr = new Date().toISOString().split('T')[0]
    // 用 Blob 包装 ZIP 字节流，避免 TS BodyInit 类型不兼容 Buffer/Uint8Array 的问题
    const zipBlob = new Blob([new Uint8Array(zipBuffer)], { type: 'application/zip' })
    return new Response(zipBlob, {
      headers: {
        'Content-Disposition': `attachment; filename="dsoj-pack-${dateStr}.zip"`,
      },
    })
  }

  // 默认：CSV 报表导出（保持原行为）
  const problems = await listProblemsForExport(source)

  // Generate CSV
  const headers = ['ID', 'Title', 'Source', 'Created At', 'Updated At', 'Submissions', 'Accepted']
  const rows = problems.map((p: any) => [
    p.id,
    p.title,
    p.aiStatus,
    p.createdAt.toISOString(),
    p.updatedAt.toISOString(),
    p.totalSubmit,
    p.totalAccepted,
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map((r: any) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  // Return as download
  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="problems_report_${source}_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
})
