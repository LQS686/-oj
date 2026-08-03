/**
 * 班级笔记管理
 * - GET  /api/classes/[id]/notes  笔记列表
 * - POST /api/classes/[id]/notes  创建笔记（staff 或具备 canCreateNotes 的学生）
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

  const { getClassMembership, hasClassPermission, isClassTeacher } = await import('@/lib/class/auth')
  const membership = member ? await getClassMembership(id, user.id) : null
  if (membership?.isStudent && !hasClassPermission(membership, 'canViewNotes')) {
    throw403('当前账号无查看笔记权限')
  }

  const q = readQuery<{ page?: string; pageSize?: string; category?: string; search?: string }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.max(1, parseInt(q.pageSize || '20') || 20)
  const isStaff = isClassTeacher(membership)

  const result = await listClassNotesPaged(id, {
    page,
    pageSize,
    category: q.category,
    search: q.search,
    viewerUserId: user.id,
    includePrivate: isStaff,
  })
  return ok(result)
})

export const POST = withApi.classRole(['owner', 'assistant', 'student'], async (req, ctx, { user, membership }) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const { hasClassPermission } = await import('@/lib/class/auth')
  if (!hasClassPermission(membership, 'canCreateNotes')) {
    throw403('当前账号无创建笔记权限')
  }

  const body = await readJson<{
    title?: string
    content?: string
    category?: string
    tags?: string[]
  }>(req)
  if (!body.title || !body.content) throw400('MISSING_FIELDS', '请提供标题和内容')
  // A-P2-4：长度上限（与公告/题解一致：标题 200、内容 50000）
  // 非空断言与下方 createClassNoteSimple 传参的既有写法一致（throw400 调用不触发类型收窄）
  if (body.title!.length > 200) throw400('TITLE_TOO_LONG', '笔记标题不能超过 200 字')
  if (body.content!.length > 50_000) throw400('CONTENT_TOO_LONG', '笔记内容不能超过 50000 字')

  const created = await createClassNoteSimple(id, user.id, {
    title: body.title!,
    content: body.content!,
    category: body.category,
    tags: body.tags,
  })
  return ok({ id: created.id }, { status: 201 })
})
