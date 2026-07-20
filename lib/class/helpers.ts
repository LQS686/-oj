/**
 * lib/class/helpers.ts
 * 共享查找 / 校验 helper（业务层使用）
 */

import { prisma } from '@/lib/prisma'
import { canManageContent } from '@/lib/permissions'
import {
  normalizeClassRoleToApi,
  isClassAdminApiRole,
  isClassAdminRole,
} from '@/lib/class/roles'
import { ApiError } from '@/lib/api/withApi'

/** 读某用户在某班级中的成员记录（无则返回 null） */
export async function getCurrentClassMember(classId: string, userId: string) {
  return prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
}

/** 按 id 读取班级（无则返回 null） */
export async function getClassById(classId: string) {
  return prisma.class.findUnique({ where: { id: classId } })
}

/** 按用户名读用户（无则返回 null） */
export async function findUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } })
}

/** 是否已是班级成员 */
export async function isUserClassMember(classId: string, userId: string) {
  const m = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
    select: { id: true },
  })
  return !!m
}

/** 校验当前用户是否是班级 owner/admin */
export async function assertClassAdmin(classId: string, userId: string, failMsg: string) {
  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (!member || !isClassAdminApiRole(member.role)) {
    throw new ApiError('FORBIDDEN', failMsg, 403)
  }
  return member
}

/** 按 id + classId 查题目（确保题目归属该班级） */
export async function findClassProblem(problemId: string, classId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId, classId },
  })
}

/** 按 id + classId 查作业（确保作业归属该班级） */
export async function findClassAssignment(assignmentId: string, classId: string) {
  return prisma.classAssignment.findUnique({
    where: { id: assignmentId, classId },
  })
}

/** 读当前用户是否有内容管理权限（SYSTEM_ADMIN / ADMIN / TEACHER） */
export async function getUserCanManageContent(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  })
  if (!u) return false
  return canManageContent(u)
}

/** 检查当前用户是否在指定题上获得满分（用于提交记录越权校验） */
export async function hasFullScoreOnProblem(
  userId: string,
  assignmentId: string,
  problemId: string
) {
  const submissions = await prisma.classAssignmentSubmission.findMany({
    where: { assignmentId, userId, problemId },
    select: { score: true },
  })
  if (submissions.length === 0) return false
  const maxScore = Math.max(...submissions.map((s: any) => s.score || 0))
  return maxScore === 100
}

/** 校验当前操作者是班级 owner/admin，否则 throw403 */
export async function requireClassAdminRole(classId: string, userId: string) {
  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (!member || !isClassAdminRole(member.role)) {
    throw new ApiError('FORBIDDEN', '您没有权限管理成员', 403)
  }
  return member
}

/** 校验目标成员存在 + 当前操作者可管理其角色 */
export async function requireManageableTarget(classId: string, memberId: string, operatorRole: string) {
  const target = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId: memberId } },
  })
  if (!target) {
    throw new ApiError('NOT_FOUND', '成员不存在', 404)
  }
  if (!canManageMember(operatorRole, target.role)) {
    throw new ApiError('FORBIDDEN', '没有权限管理该成员', 403)
  }
  return target
}

/** 读取当前用户的基础 profile（用于加入申请通知） */
export async function getUserProfile(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } })
}

/** 读直接邀请详情（含班级/邀请人/被邀请人） */
export async function getDirectInviteRaw(inviteId: string) {
  return prisma.classDirectInvite.findUnique({ where: { id: inviteId } })
}

/** 读班级笔记的最小信息（id/classId/title） */
export async function getClassNoteBasic(noteId: string, classId: string) {
  return prisma.classNote.findUnique({
    where: { id: noteId, classId },
  })
}

/** 查找同名班级（创建班级时校验重名） */
export async function findClassByName(name: string) {
  return prisma.class.findUnique({ where: { name } })
}

/** 校验作业内的所有题目是否都在公共题库中且公开 */
export async function validateAssignmentProblems(problemIds: string[]) {
  const problems = await prisma.problem.findMany({
    where: { id: { in: problemIds }, isPublic: true },
  })
  return problems.length === problemIds.length
}

/* ============================================================================
 * 权限检查 helper（业务层使用）
 * ========================================================================== */

/** 检查当前用户是否可管理目标成员（owner 可管所有；assistant 不能管 owner 和 assistant） */
export function canManageMember(
  operatorRole: string | null | undefined,
  targetRole: string | null | undefined
) {
  const op = normalizeClassRoleToApi(operatorRole)
  const tgt = normalizeClassRoleToApi(targetRole)
  if (op === 'owner') return tgt !== 'owner'
  if (op === 'assistant') return tgt === 'student'
  return false
}
