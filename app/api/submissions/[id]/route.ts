/**
 * /api/submissions/[id] - 提交详情
 *
 * 优先查 Submission，找不到回退到 ClassAssignmentSubmission
 * 鉴权：必须登录；非提交者本人/非管理员仅返回元数据（不含 code 字段）
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { getSubmissionDetailOrClassAssignment } from '@/lib/submission/service'
import { isObjectId } from '@/lib/api/validation'
import { isSystemAdmin } from '@/lib/permissions'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的提交ID')
  const data = await getSubmissionDetailOrClassAssignment(id)
  if (!data) throw404('提交记录不存在')
  // 非提交者本人且非管理员：脱敏 code 字段
  if (data.userId !== user.id && !isSystemAdmin(user)) {
    const { code, ...rest } = data
    return ok(rest)
  }
  return ok(data)
})
