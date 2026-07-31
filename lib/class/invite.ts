/**
 * lib/class/invite.ts
 * 班级直接邀请（按用户名）
 */

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { createNotification } from '@/lib/notification/service'
import { ApiError } from '@/lib/api/errors'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'

/* ============================================================================
 * 班级直接邀请（按用户名）
 * ========================================================================== */

/** 创建一条直接邀请（含 upsert：未邀请过则新建，邀请过且非 pending 则重置） */
export async function createOrReactivateDirectInvite(input: {
  classId: string
  inviterId: string
  inviteeId: string
  message?: string | null
  expiresAt: Date
}): Promise<string> {
  const existingInvite = await findDirectInvite(input.classId, input.inviteeId)
  if (existingInvite) {
    if (existingInvite.status === 'pending') {
      throw new ApiError('PENDING_INVITE', '已向该用户发送过邀请，请等待对方响应', 400)
    }
    // 同一用户重发冷却 10 分钟，防止通知轰炸
    const cooldownMs = 10 * 60 * 1000
    const lastAt = existingInvite.respondedAt || existingInvite.createdAt
    const elapsed = Date.now() - new Date(lastAt).getTime()
    if (elapsed < cooldownMs) {
      const minutes = Math.ceil((cooldownMs - elapsed) / 60000)
      throw new ApiError(
        'INVITE_COOLDOWN',
        `对该用户的邀请冷却中，请 ${minutes} 分钟后再试`,
        429
      )
    }
    const updated = await updateDirectInvite(existingInvite.id, {
      inviterId: input.inviterId,
      status: 'pending',
      message: input.message || null,
      expiresAt: input.expiresAt,
      respondedAt: null,
      createdAt: new Date(),
    })
    return updated.id
  }
  const created = await prisma.classDirectInvite.create({
    data: {
      classId: input.classId,
      inviterId: input.inviterId,
      inviteeId: input.inviteeId,
      status: 'pending',
      message: input.message || null,
      expiresAt: input.expiresAt,
      respondedAt: null,
    },
  })
  return created.id
}

/** 邀请者本人信息（用于通知展示） */
export async function getInviterProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, nickname: true },
  })
}

export async function listClassDirectInvitesDetailed(classId: string) {
  return prisma.classDirectInvite.findMany({
    where: { classId },
    orderBy: { createdAt: 'desc' },
    include: {
      inviter: { select: { id: true, username: true, nickname: true, avatar: true } },
      invitee: { select: { id: true, username: true, nickname: true, avatar: true } },
    },
  })
}

export async function findDirectInvite(classId: string, inviteeId: string) {
  return prisma.classDirectInvite.findUnique({
    where: { classId_inviteeId: { classId, inviteeId } },
  })
}

export async function updateDirectInvite(
  inviteId: string,
  data: Prisma.ClassDirectInviteUncheckedUpdateInput
) {
  return prisma.classDirectInvite.update({ where: { id: inviteId }, data })
}

export async function sendClassDirectInviteNotification(
  inviteeId: string,
  inviter: { nickname: string | null; username: string } | null | undefined,
  className: string,
  inviteId: string
) {
  await createNotification({
    userId: inviteeId,
    type: 'class_invite',
    title: '班级邀请',
    content: `${inviter?.nickname || inviter?.username} 邀请您加入班级 "${className}"`,
    link: `/classes/invites/direct/${inviteId}`,
  })
}

/* ============================================================================
 * 直接邀请响应（GET / PUT 路由使用）
 * ========================================================================== */

export interface DirectInviteDetailResult {
  invite: {
    id: string
    classId: string
    status: string
    message: string | null
    expiresAt: string | null
    createdAt: string
  }
  class: {
    id: string
    name: string
    description: string | null
    avatar: string | null
  } | null
  inviter: {
    id: string
    username: string
    nickname: string | null
    avatar: string | null
  } | null
}

export async function getDirectInviteDetail(
  inviteId: string,
  currentUserId: string
): Promise<DirectInviteDetailResult | { error: string; code: number }> {
  const invite = await prisma.classDirectInvite.findUnique({
    where: { id: inviteId },
  })
  if (!invite) return { error: '邀请不存在', code: 404 }
  if (invite.inviteeId !== currentUserId) {
    return { error: '无权访问此邀请', code: 403 }
  }

  const [classData, inviter] = await Promise.all([
    prisma.class.findUnique({ where: { id: invite.classId } }),
    prisma.user.findUnique({
      where: { id: invite.inviterId },
      select: { id: true, username: true, nickname: true, avatar: true },
    }),
  ])

  return {
    invite: {
      id: invite.id,
      classId: invite.classId,
      status: invite.status,
      message: invite.message,
      expiresAt: invite.expiresAt?.toISOString() || null,
      createdAt: invite.createdAt.toISOString(),
    },
    class: classData
      ? {
          id: classData.id,
          name: classData.name,
          description: classData.description,
          avatar: classData.avatar,
        }
      : null,
    inviter: inviter
      ? {
          id: inviter.id,
          username: inviter.username,
          nickname: inviter.nickname,
          avatar: sanitizeAvatarUrl(inviter.avatar),
        }
      : null,
  }
}

export type RespondDirectInviteResult =
  | { ok: true; status: 'accepted' | 'rejected' | 'expired'; classId: string }
  | { ok: false; error: string; code: number }

export async function respondDirectInvite(
  inviteId: string,
  currentUserId: string,
  action: 'accept' | 'reject'
): Promise<RespondDirectInviteResult> {
  const newStatus = action === 'accept' ? 'accepted' : 'rejected'

  // 过期检查与状态更新放在同一事务内，避免 TOCTOU
  try {
    if (action === 'accept') {
      await prisma.$transaction(async (tx) => {
        const invite = await tx.classDirectInvite.findUnique({ where: { id: inviteId } })
        if (!invite) throw new ApiError('NOT_FOUND', '邀请不存在', 404)
        if (invite.inviteeId !== currentUserId) {
          throw new ApiError('FORBIDDEN', '无权响应此邀请', 403)
        }
        if (invite.status !== 'pending') {
          throw new ApiError('ALREADY_PROCESSED', '该邀请已被处理', 400)
        }
        if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
          await tx.classDirectInvite.update({
            where: { id: inviteId },
            data: { status: 'expired', respondedAt: new Date() },
          })
          throw new ApiError('EXPIRED', '邀请已过期', 400)
        }

        await tx.classDirectInvite.update({
          where: { id: inviteId },
          data: { status: newStatus, respondedAt: new Date() },
        })
        const existingMember = await tx.classMember.findUnique({
          where: {
            classId_userId: { classId: invite.classId, userId: currentUserId },
          },
        })
        if (!existingMember) {
          const classRecord = await tx.class.findUnique({
            where: { id: invite.classId },
            select: { maxMembers: true },
          })
          if (classRecord && classRecord.maxMembers != null && classRecord.maxMembers > 0) {
            const currentCount = await tx.classMember.count({ where: { classId: invite.classId } })
            if (currentCount >= classRecord.maxMembers) {
              throw new ApiError('CLASS_FULL', '班级人数已达上限', 400)
            }
          }
          await tx.classMember.create({
            data: {
              classId: invite.classId,
              userId: currentUserId,
              role: 'student',
              permissions: {
                canSubmit: true,
                canViewNotes: true,
                canCreateNotes: false,
                canManageAssignments: false,
                canInviteMembers: false,
                canManageMembers: false,
                canViewStats: false,
              },
              joinedAt: new Date(),
              lastActiveAt: new Date(),
            },
          })
        }
      })
      const invite = await prisma.classDirectInvite.findUnique({ where: { id: inviteId } })
      return { ok: true, status: 'accepted', classId: invite!.classId }
    }

    const invite = await prisma.classDirectInvite.findUnique({ where: { id: inviteId } })
    if (!invite) return { ok: false, error: '邀请不存在', code: 404 }
    if (invite.inviteeId !== currentUserId) {
      return { ok: false, error: '无权响应此邀请', code: 403 }
    }
    if (invite.status !== 'pending') {
      return { ok: false, error: '该邀请已被处理', code: 400 }
    }
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      await prisma.classDirectInvite.update({
        where: { id: inviteId },
        data: { status: 'expired', respondedAt: new Date() },
      })
      return { ok: false, error: '邀请已过期', code: 400 }
    }
    await prisma.classDirectInvite.update({
      where: { id: inviteId },
      data: { status: newStatus, respondedAt: new Date() },
    })
    return { ok: true, status: 'rejected', classId: invite.classId }
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'EXPIRED') return { ok: false, error: e.message, code: 400 }
      return { ok: false, error: e.message, code: e.status }
    }
    throw e
  }
}

/** 通知邀请人（接受/拒绝结果） */
export async function notifyInviterForDirectInvite(
  inviterId: string,
  invitee: { nickname: string | null; username: string } | null | undefined,
  classData: { name: string } | null,
  classId: string,
  accepted: boolean
) {
  await createNotification({
    userId: inviterId,
    type: 'class_invite_result',
    title: accepted ? '邀请已接受' : '邀请被拒绝',
    content: accepted
      ? `${invitee?.nickname || invitee?.username} 已接受您的班级邀请并加入 "${classData?.name}"`
      : `${invitee?.nickname || invitee?.username} 拒绝了您的班级邀请`,
    link: accepted ? `/classes/${classId}` : null,
  })
}
