/**
 * 笔记阅读记录（触发积分发放）
 * POST /api/classes/[id]/notes/[noteId]/read
 */
import { withApi, ok, throw400, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { getClassNoteBasic } from '@/lib/class/service'
import { awardNoteReadPoints } from '@/lib/points/award'
import { logger } from '@/lib/logger'

export const POST = withApi.auth(async (_req, ctx, { user }) => {
  const { id: classId, noteId } = (ctx as any).params
  if (!isObjectId(classId) || !isObjectId(noteId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  // 查询笔记信息
  const note = await getClassNoteBasic(noteId, classId)
  if (!note) throw404('笔记不存在')
  const noteTitle = note!.title

  // 发放积分（如果是首次阅读）
  const awardResult = await awardNoteReadPoints(
    classId,
    user.id,
    noteId,
    noteTitle
  )

  if (!awardResult.success) {
    // 即使发放失败也返回成功，不影响阅读体验
    logger.error('[API] 发放积分失败:', 'error' in awardResult ? awardResult.error : '未知错误')
  }

  return ok({
    success: true,
    pointsAwarded:
      awardResult.success && !('alreadyRead' in awardResult && awardResult.alreadyRead),
  })
})
