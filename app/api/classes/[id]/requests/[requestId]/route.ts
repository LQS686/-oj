/**
 * /api/classes/[id]/requests/[requestId] - 班级加入申请处理
 *
 * PUT     批准 / 拒绝（owner / admin）
 * DELETE  撤销自己提交的申请
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'
import {
  decideClassJoinRequest,
  cancelClassJoinRequest,
} from '@/lib/class/service'

async function getMember(classId: string, userId: string) {
  return prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
}

/**
 * PUT /api/classes/[id]/requests/[requestId]
 * body: { action: 'approve' | 'reject' }
 */
export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { id, requestId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(requestId)) {
    throw400('INVALID_ID', '无效的ID')
  }
  const body = await readJson<{ action?: 'approve' | 'reject' }>(req)
  if (!body.action || !['approve', 'reject'].includes(body.action)) {
    throw400('INVALID_ACTION', '无效的操作类型')
  }
  const member = await getMember(id, user.id)
  if (!member) throw403('只有班级成员可以操作')

  return ok(
    await decideClassJoinRequest({
      classId: id,
      requestId,
      action: body.action as 'approve' | 'reject',
      operatorUserId: user.id,
      operatorRole: member!.role,
    })
  )
})

/**
 * DELETE /api/classes/[id]/requests/[requestId] - 撤销自己提交的申请
 */
export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  const { id, requestId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(requestId)) {
    throw400('INVALID_ID', '无效的ID')
  }
  return ok(await cancelClassJoinRequest(id, requestId, user.id))
})
