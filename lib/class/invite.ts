/**
 * lib/class/invite.ts
 * 班级邀请 / 申请
 */

import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase()
}

/* ============================================================
 * 邀请码
 * ============================================================ */

export async function createClassInviteCode(
  classId: string,
  createdBy: string,
  options: { maxUses?: number; expiresAt?: Date | null } = {}
) {
  return prisma.classInvite.create({
    data: {
      classId,
      code: generateInviteCode(),
      createdBy,
      maxUses: options.maxUses ?? 1,
      expiresAt: options.expiresAt ?? null,
    },
  })
}

export async function getClassInviteByCode(code: string) {
  return prisma.classInvite.findUnique({ where: { code } })
}

export async function consumeClassInviteCode(code: string) {
  const invite = await prisma.classInvite.findUnique({ where: { code } })
  if (!invite) return null
  if (invite.expiresAt && invite.expiresAt < new Date()) return invite
  if (invite.maxUses !== -1 && invite.usedCount >= invite.maxUses) return invite
  await prisma.classInvite.update({
    where: { id: invite.id },
    data: { usedCount: { increment: 1 } },
  })
  return invite
}

/* ============================================================
 * 直接邀请（按用户名）
 * ============================================================ */

export interface CreateClassDirectInviteInput {
  classId: string
  inviterId: string
  inviteeId: string
  message?: string
  expiresAt?: Date | null
}

export async function createClassDirectInvite(input: CreateClassDirectInviteInput) {
  return prisma.classDirectInvite.create({
    data: {
      classId: input.classId,
      inviterId: input.inviterId,
      inviteeId: input.inviteeId,
      message: input.message,
      expiresAt: input.expiresAt ?? null,
    },
  })
}

export async function listClassDirectInvites(
  classId: string,
  options: { status?: string } = {}
) {
  const where: any = { classId }
  if (options.status) where.status = options.status
  return prisma.classDirectInvite.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })
}

export async function listMyClassInvites(
  userId: string,
  options: { status?: string } = {}
) {
  const where: any = { inviteeId: userId }
  if (options.status) where.status = options.status
  return prisma.classDirectInvite.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })
}

export async function respondClassDirectInvite(
  inviteId: string,
  userId: string,
  action: 'accept' | 'reject'
) {
  const invite = await prisma.classDirectInvite.findUnique({ where: { id: inviteId } })
  if (!invite) return null
  if (invite.inviteeId !== userId) return null
  if (invite.status !== 'pending') return invite
  if (invite.expiresAt && invite.expiresAt < new Date()) return invite

  const status = action === 'accept' ? 'accepted' : 'rejected'
  return prisma.classDirectInvite.update({
    where: { id: inviteId },
    data: { status, respondedAt: new Date() },
  })
}

/* ============================================================
 * 加入申请
 * ============================================================ */

export interface CreateClassJoinRequestInput {
  classId: string
  userId: string
  message?: string
}

export async function createClassJoinRequest(input: CreateClassJoinRequestInput) {
  return prisma.classJoinRequest.create({
    data: {
      classId: input.classId,
      userId: input.userId,
      message: input.message,
    },
  })
}

export async function listClassJoinRequests(
  classId: string,
  options: { status?: string } = {}
) {
  const where: any = { classId }
  if (options.status) where.status = options.status
  return prisma.classJoinRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })
}

export async function reviewClassJoinRequest(
  requestId: string,
  reviewerId: string,
  action: 'approve' | 'reject'
) {
  const status = action === 'approve' ? 'approved' : 'rejected'
  return prisma.classJoinRequest.update({
    where: { id: requestId },
    data: {
      status,
      reviewerId,
      reviewedAt: new Date(),
    },
  })
}
