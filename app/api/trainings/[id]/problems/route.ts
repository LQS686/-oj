/**
 * /api/trainings/[id]/problems - 训练题目管理（PATCH add/remove/reorder/update）
 */
import { withApi, ok, readJson, throw400, throw403, throw404, ApiError } from '@/lib/api/withApi'
import {
  addTrainingProblems,
  removeTrainingProblems,
  reorderTrainingProblems,
  updateTrainingProblemItem,
} from '@/lib/training/service'
import type { TrainingProblemPatchInput } from '@/lib/training/types'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import { canManageContent, isAdmin } from '@/lib/permissions'

export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  if (!canManageContent(user)) throw throw403('无权限修改训练题目')

  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的训练计划ID')

  // 权限：作者或管理员
  const found = await prisma.training.findUnique({
    where: { id },
    select: { authorId: true },
  })
  if (!found) throw new ApiError('NOT_FOUND', '训练计划不存在', 404)
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } })
  if (!isAdmin(u) && found.authorId !== user.id) {
    throw403('只有作者或管理员可以修改题目')
  }

  const body = await readJson<TrainingProblemPatchInput>(req)
  if (!body || !body.action) throw400('VALIDATION', '缺少 action')

  let result: any
  switch (body.action) {
    case 'add':
      if (!body.problems || body.problems.length === 0) {
        throw400('VALIDATION', 'add 操作需要 problems 数组')
      }
      result = await addTrainingProblems(id, body.problems!)
      break
    case 'remove':
      if (!body.problemIds || body.problemIds.length === 0) {
        throw400('VALIDATION', 'remove 操作需要 problemIds 数组')
      }
      result = await removeTrainingProblems(id, body.problemIds!)
      break
    case 'reorder':
      if (!body.orderMap || body.orderMap.length === 0) {
        throw400('VALIDATION', 'reorder 操作需要 orderMap 数组')
      }
      result = await reorderTrainingProblems(id, body.orderMap!)
      break
    case 'update':
      if (!body.updates || body.updates.length === 0) {
        throw400('VALIDATION', 'update 操作需要 updates 数组')
      }
      result = await updateTrainingProblemItem(id, body.updates!)
      break
    default:
      throw400('VALIDATION', `未知 action: ${body.action}`)
  }
  return ok(result)
})
