/**
 * /api/solutions/check-permission - 题解查看权限预检
 */
import { withApi, ok, readQuery, throw400, throw404 } from '@/lib/api/withApi'
import { checkSolutionPermission, loadSolutionViewUser } from '@/lib/solution/service'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ problemId?: string; isAssignmentContext?: string }>(req)
  if (!q.problemId) throw400('VALIDATION', 'problemId 不能为空')

  const isAssignmentContext = q.isAssignmentContext === 'true'
  const viewer = await loadSolutionViewUser(req)

  try {
    const data = await checkSolutionPermission(q.problemId!, isAssignmentContext, viewer)
    return ok(data)
  } catch (err: any) {
    if (err?.status === 404) throw404(err.message)
    throw err
  }
})
