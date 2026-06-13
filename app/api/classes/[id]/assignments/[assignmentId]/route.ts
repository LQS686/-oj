/**
 * 班级作业详情 / 更新 / 删除
 * - GET    /api/classes/[id]/assignments/[assignmentId]
 * - PUT    /api/classes/[id]/assignments/[assignmentId]
 * - DELETE /api/classes/[id]/assignments/[assignmentId]
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
  assertClassAdmin,
  buildClassAssignmentDetail,
  deleteClassAssignment,
  getCurrentClassMember,
  updateClassAssignment,
} from '@/lib/class/service'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id, assignmentId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }
  const member = await getCurrentClassMember(id, user.id)
  if (!member) throw403('只有班级成员可以查看作业')
  const memberRole = member!.role

  const detail = await buildClassAssignmentDetail(id, assignmentId, user.id, memberRole)
  if (!detail) throw404('作业不存在')
  return ok(detail)
})

export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { id, assignmentId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }
  const body = await readJson<{
    title?: string
    description?: string
    startTime?: string | Date
    endTime?: string | Date
    deadline?: string | Date
    problemIds?: string[]
  }>(req)
  await assertClassAdmin(id, user.id, '只有管理员可以更新作业')
  return ok(await updateClassAssignment(id, assignmentId, body))
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id, assignmentId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }
  await assertClassAdmin(id, user.id, '只有管理员可以删除作业')
  return ok(await deleteClassAssignment(id, assignmentId))
})
