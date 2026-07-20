/**
 * lib/class/join-request.ts
 * 班级加入申请
 */

import { prisma } from '@/lib/prisma'
import { createNotifications } from '@/lib/notification/service'
import { isClassAdminRole } from '@/lib/class/roles'
import { ApiError } from '@/lib/api/withApi'

/* ============================================================================
 * 加入申请
 * ========================================================================== */

export type CreateJoinRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string; code: number }

export async function createOrReuseJoinRequest(
  classId: string,
  userId: string,
  message?: string | null
): Promise<CreateJoinRequestResult> {
  const classData = await prisma.class.findUnique({ where: { id: classId } })
  if (!classData) return { ok: false, error: '班级不存在', code: 404 }

  const existingMember = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (existingMember) return { ok: false, error: '您已是班级成员', code: 400 }

  const existingRequest = await prisma.classJoinRequest.findUnique({
    where: { classId_userId: { classId, userId } },
  })

  if (existingRequest) {
    if (existingRequest.status === 'pending') {
      return { ok: false, error: '您已提交过申请，请等待审批', code: 400 }
    }
    // 已被处理（approved/rejected）：更新为新申请
    const updated = await prisma.classJoinRequest.update({
      where: { id: existingRequest.id },
      data: {
        status: 'pending',
        message: message || null,
        reviewerId: null,
        reviewedAt: null,
        createdAt: new Date(),
      },
    })
    return { ok: true, requestId: updated.id }
  }

  const created = await prisma.classJoinRequest.create({
    data: {
      classId,
      userId,
      status: 'pending',
      message: message || null,
    },
  })
  return { ok: true, requestId: created.id }
}

/** 通知班级创建人和管理员有新申请 */
export async function notifyAdminsAboutJoinRequest(
  classId: string,
  applicant: { nickname: string | null; username: string } | null | undefined,
  className: string
) {
  const adminMembers = await prisma.classMember.findMany({
    where: { classId, role: { in: ['owner', 'admin', 'assistant'] } },
  })
  const notifications = adminMembers.map((member: any) => ({
    userId: member.userId,
    type: 'class_join_request',
    title: '班级加入申请',
    content: `${applicant?.nickname || applicant?.username} 申请加入班级 "${className}"`,
    link: `/classes/${classId}/requests`,
  }))
  if (notifications.length > 0) {
    await createNotifications(notifications)
  }
}

export async function listClassJoinRequestsDetailed(classId: string) {
  const requests = await prisma.classJoinRequest.findMany({
    where: { classId },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, username: true, nickname: true, avatar: true } },
      reviewer: { select: { id: true, username: true, nickname: true, avatar: true } },
    },
  })
  return requests.map((r: any) => ({
    id: r.id,
    classId: r.classId,
    applicant: {
      id: r.user.id,
      username: r.user.username,
      nickname: r.user.nickname,
      avatar: r.user.avatar,
    },
    reviewer: r.reviewer
      ? {
          id: r.reviewer.id,
          username: r.reviewer.username,
          nickname: r.reviewer.nickname,
          avatar: r.reviewer.avatar,
        }
      : null,
    status: r.status,
    message: r.message,
    reviewedAt: r.reviewedAt?.toISOString() || null,
    createdAt: r.createdAt.toISOString(),
  }))
}

/* ============================================================================
 * 班级加入申请处理：批准 / 拒绝（原 /api/classes/[id]/requests/[requestId]）
 * ========================================================================== */

export interface DecideJoinRequestInput {
  classId: string
  requestId: string
  action: 'approve' | 'reject'
  operatorUserId: string
  operatorRole: string
}

/**
 * 校验班级加入申请：班级存在性、申请存在性、操作者权限（owner / admin）
 */
export async function decideClassJoinRequest(input: DecideJoinRequestInput) {
  const classRecord = await prisma.class.findUnique({ where: { id: input.classId } })
  if (!classRecord) throw new ApiError('NOT_FOUND', '班级不存在', 404)

  if (!isClassAdminRole(input.operatorRole)) {
    throw new ApiError('FORBIDDEN', '无权处理加入申请', 403)
  }

  const request = await prisma.classJoinRequest.findUnique({
    where: { id: input.requestId },
  })
  if (!request) throw new ApiError('NOT_FOUND', '申请不存在', 404)
  if (request.classId !== input.classId) {
    throw new ApiError('BAD_REQUEST', '申请与班级不匹配', 400)
  }
  if (request.status !== 'pending') {
    throw new ApiError('ALREADY_PROCESSED', `该申请已被${request.status === 'approved' ? '批准' : '拒绝'}`, 400)
  }
  if (input.action === 'approve') {
    // 检查是否已存在成员
    const existing = await prisma.classMember.findUnique({
      where: { classId_userId: { classId: input.classId, userId: request.userId } },
    })
    if (existing) {
      // 已经存在成员，仅更新申请状态
      await prisma.classJoinRequest.update({
        where: { id: input.requestId },
        data: { status: 'approved' },
      })
      return { message: '该用户已是班级成员' }
    }
    // 创建成员 + 更新申请（事务内重新检查容量，避免并发下超额）
    await prisma.$transaction(async (tx) => {
      if (classRecord.maxMembers > 0) {
        const currentCount = await tx.classMember.count({ where: { classId: input.classId } })
        if (currentCount >= classRecord.maxMembers) {
          throw new ApiError('CLASS_FULL', '班级已满员', 400)
        }
      }
      await tx.classMember.create({
        data: { classId: input.classId, userId: request.userId, role: 'student' },
      })
      await tx.classJoinRequest.update({
        where: { id: input.requestId },
        data: { status: 'approved' },
      })
    })
    return { message: '已批准加入申请' }
  }

  // 拒绝
  await prisma.classJoinRequest.update({
    where: { id: input.requestId },
    data: { status: 'rejected' },
  })
  return { message: '已拒绝加入申请' }
}

/**
 * 申请者撤销自己提交的加入申请
 */
export async function cancelClassJoinRequest(
  classId: string,
  requestId: string,
  userId: string
) {
  const request = await prisma.classJoinRequest.findUnique({ where: { id: requestId } })
  if (!request) throw new ApiError('NOT_FOUND', '申请不存在', 404)
  if (request.classId !== classId) {
    throw new ApiError('BAD_REQUEST', '申请与班级不匹配', 400)
  }
  if (request.userId !== userId) {
    throw new ApiError('FORBIDDEN', '只能撤销自己的申请', 403)
  }
  if (request.status !== 'pending') {
    throw new ApiError('ALREADY_PROCESSED', '该申请已处理，无法撤销', 400)
  }
  await prisma.classJoinRequest.delete({ where: { id: requestId } })
  return { message: '已撤销申请' }
}
