/**
 * /api/posts - 帖子列表/创建
 *
 * GET  公开：分页查询帖子（带置顶/排序/DB 不可用兜底）
 * POST 鉴权：创建帖子（管理员可发公告）
 */
import { withApi, ok, readJson, readQuery, throw400 } from '@/lib/api/withApi'
import { listPostsAdvanced, createUserPost } from '@/lib/post/service'
import { toInt } from '@/lib/api/validation'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{
    page?: string
    limit?: string
    tag?: string
    categoryId?: string
    search?: string
    sort?: string
    type?: string
  }>(req)

  const page = toInt(q.page, 'page', 1)
  const limit = toInt(q.limit, 'limit', 20)
  const data = await listPostsAdvanced({
    page,
    limit,
    tag: q.tag,
    categoryId: q.categoryId,
    search: q.search,
    sort: (q.sort as 'latest' | 'hot' | 'views' | undefined) || 'latest',
    type: q.type,
  })
  return ok(data)
})

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{
    title: string
    content: string
    categoryId?: string
    tags?: string[]
    status?: string
    type?: string
  }>(req)

  if (!body.title || !body.content) {
    throw400('VALIDATION', '标题和内容不能为空')
  }

  // user.role 在 withApi.auth 中只暴露 AuthUser 字段，需从 DB 读取 isAdmin。
  // 这里用 user.role === 'admin' / 'super_admin' 判定，与 withApi.admin 一致。
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

  const post = await createUserPost(
    {
      title: body.title,
      content: body.content,
      categoryId: body.categoryId,
      tags: body.tags,
      status: body.status,
      type: body.type,
    },
    user.id,
    isAdmin
  )

  return ok(post, { status: 201 })
})
