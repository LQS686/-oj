/**
 * /api/admin/problems/export - 题库导出（管理员）
 *
 * 支持两种导出模式：
 *   1. 默认（无 format 参数）：导出 CSV 报表（原行为）
 *   2. format=dsoj：导出 DSOJ 标准题包 ZIP
 *
 * 查询参数：
 *   - format：导出格式（dsoj 触发题包 ZIP 导出）
 *   - ids：题目 ID 列表（逗号分隔，dsoj 模式用）
 *   - includeStdCode：是否包含标程（true/false，默认 true，dsoj 模式用）
 *   - includeTestCases：是否包含测试用例（true/false，默认 true，dsoj 模式用）
 *   - includeSolutions：是否包含题解（true/false，默认 true，dsoj 模式用）
 */
import { withApi } from '@/lib/api/withApi'
import { exportDsojPack } from '@/lib/problem/export/dsoj-exporter'
import { prisma } from '@/lib/prisma'

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
    if (problemIds.length > 200) {
      const { fail } = await import('@/lib/api/response')
      return fail('TOO_MANY_IDS', '单次题包导出最多 200 题', 400)
    }

    const includeStdCode = searchParams.get('includeStdCode') !== 'false'
    const includeTestCases = searchParams.get('includeTestCases') !== 'false'
    const includeSolutions = searchParams.get('includeSolutions') !== 'false'

    const zipBuffer = await exportDsojPack({
      problemIds,
      includeStdCode,
      includeTestCases,
      includeSolutions,
      packSource: 'DSOJ Admin Export',
    })

    const dateStr = new Date().toISOString().split('T')[0]
    const zipBlob = new Blob([new Uint8Array(zipBuffer)], { type: 'application/zip' })
    return new Response(zipBlob, {
      headers: {
        'Content-Disposition': `attachment; filename="dsoj-pack-${dateStr}.zip"`,
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
