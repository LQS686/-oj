/**
 * /api/classes/[id]/requests - 班级加入申请
 *
 * POST  创建/复用加入申请
 * GET   管理员获取申请列表
 */
import { withApi, ok, readJson, throw400, throw403, fail } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import {
  createOrReuseJoinRequest,
  getClassById,
  getCurrentClassMember,
  getUserProfile,
  isClassAdminRole,
  listClassJoinRequestsDetailed,
  notifyAdminsAboutJoinRequest,
} from '@/lib/class/service'

/** 创建加入申请 */
export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id: classId } = ctx.params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  const body = await readJson<{ message?: string }>(req)
  const { message } = body

  const result = await createOrReuseJoinRequest(classId, user.id, message)
  if (!result.ok) {
    return fail('ERR', result.error, result.code)
  }

  // 通知班级创建人和管理员
  const [classData, applicantUser] = await Promise.all([
    getClassById(classId),
    getUserProfile(user.id),
  ])
  if (classData) {
    await notifyAdminsAboutJoinRequest(classId, applicantUser, classData.name)
  }

  return ok({ requestId: result.requestId })
})

/** 获取加入申请列表 */
export const GET = withApi.auth(async (_req, ctx, { user }) => {
  const { id: classId } = ctx.params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  // 验证当前用户是否是班级管理员
  const currentMember = await getCurrentClassMember(classId, user.id)
  if (!currentMember) throw403('您不是班级成员')
  const currentMemberRole = currentMember!.role
  if (!isClassAdminRole(currentMemberRole)) throw403('只有管理员可以查看申请列表')

  const data = await listClassJoinRequestsDetailed(classId)
  return ok(data)
})
