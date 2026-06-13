/**
 * /api/posts/[id]/comments - 帖子评论
 *
 * GET    公开：拉取帖子全部评论（带 DB 不可用兜底）
 * POST   鉴权：发表评论（支持 parentId 回复）
 * DELETE 鉴权：删除评论（评论 ID 通过 ?commentId=xxx 传入，作者或管理员）
 */
import { withApi, ok, readJson, readQuery, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { getPostComments, createUserComment, softDeleteUserComment } from '@/lib/post/service'
import { isObjectId } from '@/lib/api/validation'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的帖子ID')
  const comments = await getPostComments(id)
  return ok({ comments })
})

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的帖子ID')

  const body = await readJson<{ content: string; parentId?: string }>(req)
  if (!body.content) throw400('VALIDATION', '评论内容不能为空')

  try {
    const comment = await createUserComment({
      postId: id,
      content: body.content,
      parentId: body.parentId,
      authorId: user.id,
    })
    return ok(comment, { status: 201 })
  } catch (err: any) {
    if (err?.status === 404) throw404(err.message)
    throw err
  }
})

export const DELETE = withApi.auth(async (req, ctx, { user }) => {
  const { id: postId } = (ctx as any).params
  if (!isObjectId(postId)) throw400('INVALID_ID', '无效的帖子ID')

  const q = readQuery<{ commentId?: string }>(req)
  const commentId = q.commentId
  if (!commentId) throw400('VALIDATION', '缺少评论ID')
  if (!isObjectId(commentId!)) throw400('INVALID_ID', '无效的评论ID')

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
  try {
    await softDeleteUserComment(commentId!, postId, user.id, isAdmin)
  } catch (err: any) {
    if (err?.status === 404) throw404(err.message)
    if (err?.status === 400) throw400('VALIDATION', err.message)
    if (err?.status === 403) throw403(err.message)
    throw err
  }
  return ok({ message: '评论已删除' })
})
