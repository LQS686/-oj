/**
 * DELETE /api/users/avatar/history/[id] - 删除一条头像历史记录
 *
 * 删除数据库记录，并同步删除上传的图片文件（主图 + 缩略图）。
 * 安全：
 *  - 仅本人可删除自己的头像历史（service 内部校验 userId 归属）
 *  - 拒绝删除当前正在使用的头像（service 内部校验 user.avatar !== history.url）
 */
import { withApi, ok } from '@/lib/api/withApi'
import { deleteAvatarHistory } from '@/lib/user/service'
import { validateObjectId } from '@/lib/api/validation'

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const id = validateObjectId(ctx.params.id, 'avatarHistoryId')
  await deleteAvatarHistory(user.id, id)
  return ok({ id, deleted: true })
})
