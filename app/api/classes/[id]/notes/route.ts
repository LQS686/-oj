/**
 * 班级笔记管理
 * - GET  /api/classes/[id]/notes  笔记列表
 * - POST /api/classes/[id]/notes  创建笔记
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
import { listClassNotesPaged, createClassNoteSimple } from '@/lib/class/service'
import { prisma } from '@/lib/prisma'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const classData = await prisma.class.findUnique({ where: { id } })
  if (!classData) throw404('班级不存在')

  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  if (!classData!.isPublic && !member) throw403('无权访问该班级')

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

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的班级ID')

  const body = await readJson<{
    title?: string
    content?: string
    category?: string
    tags?: string[]
  }>(req)
  if (!body.title || !body.content) throw400('MISSING_FIELDS', '请提供标题和内容')

  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId: id, userId: user.id } },
  })
  if (!member) throw403('只有班级成员可以发布笔记')

  const permissions = (member!.permissions as any) || {}
  const isAdmin = member!.role === 'owner' || member!.role === 'admin'
  const canCreate = !!permissions.canCreateNotes
  if (!isAdmin && !canCreate) throw403('没有权限发布笔记')

  const created = await createClassNoteSimple(id, user.id, {
    title: body.title!,
    content: body.content!,
    category: body.category,
    tags: body.tags,
  })
  return ok({ id: created.id }, { status: 201 })
})
