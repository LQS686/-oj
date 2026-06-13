/**
 * /api/posts/[id] - 帖子详情/更新/删除
 *
 * GET    公开：获取帖子详情 + 评论
 * PUT    鉴权：更新帖子（作者或管理员，置顶/锁定仅管理员）
 * DELETE 鉴权：逻辑删除（作者或管理员）
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { verifyToken } from '@/lib/auth'
import {
  getPostAuthor,
  getPostDetailWithComments,
  softDeleteUserPost,
  updateUserPost,
} from '@/lib/post/service'
import { isObjectId } from '@/lib/api/validation'

export const GET = withApi.public(async (req, ctx) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的帖子ID')

  // 可选的登录态用于显示 isLiked；未登录也允许
  const token = req.cookies.get('token')?.value
  const viewerId = token ? verifyToken(token)?.userId : undefined

  const result = await getPostDetailWithComments(id, viewerId)
  if (!result.found) throw404('帖子不存在或已删除')
  return ok({ post: result.post, comments: result.comments })
})

export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的帖子ID')

  const post = await getPostAuthor(id)
  if (!post) throw404('帖子不存在')
  const safePost = post!

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
  if (safePost.authorId !== user.id && !isAdmin) {
    throw403('无权修改此帖子')
  }

  const body = await readJson<{
    title?: string
    content?: string
    categoryId?: string
    tags?: string[]
    status?: string
    isPinned?: boolean
    isLocked?: boolean
  }>(req)

  await updateUserPost(id, {
    title: body.title,
    content: body.content,
    categoryId: body.categoryId,
    tags: body.tags,
    status: body.status,
    isPinned: isAdmin ? body.isPinned : undefined, // 仅管理员可置顶
    isLocked: isAdmin ? body.isLocked : undefined,
  })

  return ok({ message: '帖子更新成功' })
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的帖子ID')

  const post = await getPostAuthor(id)
  if (!post) throw404('帖子不存在')
  const safePost = post!

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
  if (safePost.authorId !== user.id && !isAdmin) {
    throw403('无权删除此帖子')
  }

  // 逻辑删除
  await softDeleteUserPost(id)
  return ok({ message: '帖子已删除' })
})
