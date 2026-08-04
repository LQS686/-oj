/**
 * lib/class/member-activity.ts
 * 班级成员 / 权限 / 活动
 */

import { prisma } from '@/lib/prisma'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'
import { SubmissionStatus } from '@/lib/constants/submission-status'
import type { ClassPermissionFlags } from './permission-flags'

/* ============================================================================
 * 班级成员 / 权限 / 活动
 * ========================================================================== */

/** 列出班级成员（带可搜索的 user 信息） */
export async function listClassMembersWithUser(classId: string) {
  return prisma.classMember.findMany({
    where: { classId },
    include: {
      user: { select: { username: true, nickname: true, avatar: true } },
    },
  })
}

/** 读取班级成员（带目标 userId） */
export async function getClassMemberByUserId(classId: string, userId: string) {
  return prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
}

/** 更新成员备注（角色变更必须走 updateClassMemberRole） */
export async function patchClassMember(
  classId: string,
  userId: string,
  data: { remark?: string }
) {
  const update: { remark?: string } = {}
  if (data.remark !== undefined) update.remark = data.remark

  const updated = await prisma.classMember.update({
    where: { classId_userId: { classId, userId } },
    data: update,
  })

  // 班级角色与系统角色彻底解耦：班级角色变更不再同步修改 User.role
  return updated
}

/** 合法权限位白名单 */
const ALLOWED_PERMISSION_KEYS = [
  'canSubmit',
  'canViewNotes',
  'canCreateNotes',
  'canManageAssignments',
  'canInviteMembers',
  'canManageMembers',
  'canViewStats',
] as const

/** 合并成员权限位 */
export async function mergeClassMemberPermissions(
  classId: string,
  userId: string,
  permissions: ClassPermissionFlags
) {
  const current = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (!current) return null
  // 仅允许白名单内的权限位写入，并丢弃历史废弃位（如 canViewProblems）
  const filtered: ClassPermissionFlags = {}
  for (const key of ALLOWED_PERMISSION_KEYS) {
    if (key in permissions) {
      filtered[key] = Boolean(permissions[key])
    }
  }
  const base = (current.permissions as ClassPermissionFlags | null) || {}
  const merged: ClassPermissionFlags = {}
  for (const key of ALLOWED_PERMISSION_KEYS) {
    if (key in filtered) merged[key] = filtered[key]
    else if (key in base) merged[key] = Boolean(base[key])
  }
  return prisma.classMember.update({
    where: { classId_userId: { classId, userId } },
    data: { permissions: merged },
  })
}

/** 获取成员活动概况（提交 / 笔记） */
export async function getClassMemberActivity(classId: string, memberId: string) {
  const target = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId: memberId } },
    include: {
      user: { select: { username: true, nickname: true, avatar: true } },
    },
  })
  if (!target) return null

  const [submissions, notes] = await Promise.all([
    prisma.classAssignmentSubmission.findMany({
      where: {
        assignment: { classId },
        userId: memberId,
        status: { not: SubmissionStatus.REMOVED },
      },
      orderBy: { submittedAt: 'desc' },
      take: 50,
      include: { assignment: { select: { title: true } } },
    }),
    prisma.classNote.findMany({
      where: { classId, authorId: memberId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  const [totalSubmissions, acCount, totalNotes] = await Promise.all([
    prisma.classAssignmentSubmission.count({
      where: {
        assignment: { classId },
        userId: memberId,
        status: { not: SubmissionStatus.REMOVED },
      },
    }),
    prisma.classAssignmentSubmission.count({
      where: {
        assignment: { classId },
        userId: memberId,
        status: SubmissionStatus.ACCEPTED,
      },
    }),
    prisma.classNote.count({ where: { classId, authorId: memberId } }),
  ])

  const recentActivities = [
    ...submissions.map((s) => ({
      type: 'submission' as const,
      title: `提交了作业 "${s.assignment.title}"`,
      status: s.status,
      score: s.score,
      createdAt: s.submittedAt,
    })),
    ...notes.map((n) => ({
      type: 'note' as const,
      title: `发布了笔记 "${n.title}"`,
      status: 'published',
      createdAt: n.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20)

  return {
    member: {
      id: target.userId,
      username: target.user.username,
      nickname: target.user.nickname,
      avatar: sanitizeAvatarUrl(target.user.avatar),
      role: target.role,
      joinedAt: target.joinedAt,
    },
    stats: {
      totalSubmissions,
      acCount,
      totalNotes,
    },
    recentActivities,
  }
}
