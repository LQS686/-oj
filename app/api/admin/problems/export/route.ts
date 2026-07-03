/**
 * /api/admin/problems/export - 导出题库列表为 CSV（管理员）
 */
import { withApi } from '@/lib/api/withApi'
import { listProblemsForExport } from '@/lib/problem/service'

export const GET = withApi.admin(async (req, _ctx) => {
  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source') || 'all'

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
