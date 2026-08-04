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
  assertClassOwner,
  buildClassAssignmentDetail,
  deleteClassAssignment,
  getCurrentClassMember,
  updateClassAssignment,
} from '@/lib/class/service'

export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id, assignmentId } = ctx.params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }
  const member = await getCurrentClassMember(id, user.id)
  if (!member) throw403('只有班级成员可以查看作业')
  const memberRole = member!.role
  const memberPermissions = (member as { permissions?: Record<string, boolean> }).permissions || {}

  const detail = await buildClassAssignmentDetail(id, assignmentId, user.id, memberRole, memberPermissions)
  if (!detail) throw404('作业不存在')
  return ok(detail)
})

export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { id, assignmentId } = ctx.params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }
  const { getClassMembership, hasClassPermission } = await import('@/lib/class/auth')
  const membership = await getClassMembership(id, user.id)
  if (!membership || !hasClassPermission(membership, 'canManageAssignments')) {
    throw403('当前账号无管理作业权限')
  }
  const body = await readJson<{
    title?: string
    description?: string
    startTime?: string | Date
    endTime?: string | Date
    problemIds?: string[]
    allowLateSubmission?: boolean
  }>(req)
  return ok(await updateClassAssignment(id, assignmentId, body))
})

export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id, assignmentId } = ctx.params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }
  await assertClassOwner(id, user.id, '只有班级创建者可以删除作业')
  return ok(await deleteClassAssignment(id, assignmentId, user.id))
})
