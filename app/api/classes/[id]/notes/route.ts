/**
 * 班级笔记管理
 * - GET  /api/classes/[id]/notes  笔记列表
 * - POST /api/classes/[id]/notes  创建笔记
 *
 * GET：公开班任意登录用户可读；私有班需成员（classRole 全角色）。
 * POST：仅 owner / assistant。
 */
import {
  withApi,
  ok,
  readJson,
  readQuery,
  throw400,
  throw403,
  throw404,
} from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  getClassById,
  getCurrentClassMember,
  listClassNotesPaged,
  createClassNoteSimple,
} from '@/lib/class/service'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const classDataResult = await getClassById(id)
  if (!classDataResult) throw404('班级不存在')
  const classData = classDataResult!
  const classIsPublic = classData.isPublic

  const member = await getCurrentClassMember(id, user.id)
  if (!classIsPublic && !member) throw403('无权访问该班级')

  const q = readQuery<{ page?: string; pageSize?: string; category?: string; search?: string }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.max(1, parseInt(q.pageSize || '20') || 20)

  const result = await listClassNotesPaged(id, {
    page,
    pageSize,
    category: q.category,
    search: q.search,
  })
  return ok(result)
})

export const POST = withApi.classRole(['owner', 'assistant'], async (req, ctx, { user }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const body = await readJson<{
    title?: string
    content?: string
    category?: string
    tags?: string[]
  }>(req)
  if (!body.title || !body.content) throw400('MISSING_FIELDS', '请提供标题和内容')

  const created = await createClassNoteSimple(id, user.id, {
    title: body.title!,
    content: body.content!,
    category: body.category,
    tags: body.tags,
  })
  return ok({ id: created.id }, { status: 201 })
})
