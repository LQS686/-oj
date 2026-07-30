/**
 * POST /api/admin/problems/recount-stats
 * 从 Submission 重算全部题目的 totalSubmit / totalAccepted（修复 AC 率计数口径）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { recountAllProblemSubmissionStats } from '@/lib/problem/stats'

export const POST = withApi.admin(async () => {
  const result = await recountAllProblemSubmissionStats()
  return ok(result)
})
