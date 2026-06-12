/**
 * /api/submissions/[id] - 提交详情
 *
 * 优先查 Submission，找不到回退到 ClassAssignmentSubmission
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { getSubmissionDetailOrClassAssignment } from '@/lib/submission/service'
import { isObjectId } from '@/lib/api/validation'

export const GET = withApi.public(async (_req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的提交ID')
  const data = await getSubmissionDetailOrClassAssignment(id)
  if (!data) throw404('提交记录不存在')
  return ok(data)
})
