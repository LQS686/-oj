/**
 * 笔记阅读记录
 * POST /api/classes/[id]/notes/[noteId]/read
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { getClassNoteBasic } from '@/lib/class/service'
import { markClassNoteRead } from '@/lib/class/note'

export const POST = withApi.auth(async (_req, ctx, { user }) => {
  const { id: classId, noteId } = (ctx as any).params
  if (!isObjectId(classId) || !isObjectId(noteId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const note = await getClassNoteBasic(noteId, classId)
  if (!note) throw404('笔记不存在')

  await markClassNoteRead(classId, noteId, user.id)

  return ok({ success: true })
})