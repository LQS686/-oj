/**
 * 班级单个笔记管理
 * - GET    /api/classes/[id]/notes/[noteId]
 * - PUT    /api/classes/[id]/notes/[noteId]
 * - DELETE /api/classes/[id]/notes/[noteId]
 */
import {
  withApi,
  ok,
  readJson,
  throw400,
  throw403,
  throw404,
} from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  getClassById,
  getClassNoteSimple,
  getClassNoteWithAuthor,
  getCurrentClassMember,
  updateClassNoteFields,
  deleteClassNoteSimple,
} from '@/lib/class/service'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id, noteId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(noteId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const note = await getClassNoteWithAuthor(noteId)
  if (!note || note.classId !== id) throw404('笔记不存在')
  const safeNote = note!

  const classData = await getClassById(id)
  if (!classData) throw404('班级不存在')
  const classIsPublic = classData!.isPublic

  const member = await getCurrentClassMember(id, user.id)
  if (!classIsPublic && !member) throw403('无权访问该班级')

  return ok({
    id: safeNote.id,
    title: safeNote.title,
    content: safeNote.content,
    category: safeNote.category,
    tags: safeNote.tags || [],
    author: {
      id: safeNote.author.id,
      username: safeNote.author.username,
      nickname: safeNote.author.nickname,
      avatar: safeNote.author.avatar,
    },
    createdAt: safeNote.createdAt,
    updatedAt: safeNote.updatedAt,
  })
})

export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { id, noteId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(noteId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const body = await readJson<{
    title?: string
    content?: string
    category?: string
    tags?: string[]
  }>(req)

  const note = await getClassNoteSimple(id, noteId)
  if (!note) throw404('笔记不存在')
  const safeNote = note!

  const isAuthor = safeNote.authorId === user.id
  const member = await getCurrentClassMember(id, user.id)
  const isAdmin = !!(member && (member.role === 'owner' || member.role === 'admin'))
  if (!isAuthor && !isAdmin) throw403('只有作者或管理员可以编辑笔记')

  const updateData: { title?: string; content?: string; category?: string; tags?: string[] } = {}
  if (body.title !== undefined) updateData.title = body.title
  if (body.content !== undefined) updateData.content = body.content
  if (body.category !== undefined) updateData.category = body.category
  if (body.tags !== undefined) updateData.tags = body.tags

  await updateClassNoteFields(noteId, updateData)
  return ok({ id: noteId })
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id, noteId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(noteId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const note = await getClassNoteSimple(id, noteId)
  if (!note) throw404('笔记不存在')
  const safeNote = note!

  const isAuthor = safeNote.authorId === user.id
  const member = await getCurrentClassMember(id, user.id)
  const isAdmin = !!(member && (member.role === 'owner' || member.role === 'admin'))
  if (!isAuthor && !isAdmin) throw403('只有作者或管理员可以删除笔记')

  await deleteClassNoteSimple(noteId)
  return ok({ message: '笔记已删除' })
})
