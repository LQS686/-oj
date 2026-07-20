/**
 * lib/class/assignment-manage.ts
 * 班级作业：详情视图 / 更新 / 删除（CRUD 管理）
 */

import { prisma } from '@/lib/prisma'
import { SubmissionStatus } from '@/lib/constants/submission-status'
import {
  normalizeClassRoleToApi,
  isClassAdminApiRole,
  isClassOwnerRole,
} from '@/lib/class/roles'
import { ApiError } from '@/lib/api/withApi'
import { getUserCanManageContent, validateAssignmentProblems } from './helpers'
import { getClassAssignmentDetail, getAssignmentStatus } from './assignment-stats'

/* ============================================================================
 * 班级作业详情视图 / 更新 / 删除（原 /api/classes/[id]/assignments/[assignmentId]）
 * ========================================================================== */

/** 班级作业详情视图：题目 + 成员完成进度 + 当前用户提交 + 题目统计 */
export async function buildClassAssignmentDetail(
  classId: string,
  assignmentId: string,
  viewerUserId: string,
  viewerRole: string
) {
  const detail = await getClassAssignmentDetail(classId, assignmentId)
  if (!detail) return null
  const { assignment, members, submissions } = detail

  const problemsRaw = await prisma.problem.findMany({
    where: { id: { in: assignment.problemIds } },
    select: {
      id: true,
      title: true,
      problemNumber: true,
      difficulty: true,
      tags: true,
      totalSubmit: true,
      totalAccepted: true,
    },
  })
  const problemById = new Map(problemsRaw.map((p) => [p.id, p]))
  const problems = assignment.problemIds
    .map((id) => problemById.get(id))
    .filter(Boolean) as typeof problemsRaw

  // 成员完成情况
  const memberProgress: any[] = members
    .map((m: any) => {
      const us = submissions.filter((s: any) => s.userId === m.userId)
      if (us.length === 0) return null
      const solved = new Set(us.filter((s: any) => s.status === 'AC').map((s: any) => s.problemId))
      return {
        userId: m.userId,
        username: m.user.username,
        nickname: m.user.nickname,
        avatar: m.user.avatar,
        role: normalizeClassRoleToApi(m.role),
        progress: {
          solved: solved.size,
          total: assignment.problemIds.length,
          percentage:
            assignment.problemIds.length > 0
              ? Math.round((solved.size / assignment.problemIds.length) * 100)
              : 0,
        },
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.progress.solved - a.progress.solved)

  const userSubmissions = submissions.filter((s: any) => s.userId === viewerUserId)
  const viewerIsClassAdmin = isClassAdminApiRole(viewerRole)
  const viewerCanManageContent = await getUserCanManageContent(viewerUserId)
  const canViewAllSubmissions = viewerIsClassAdmin || viewerCanManageContent
  const allSubmissions = canViewAllSubmissions
    ? submissions.map((s: any) => ({
        id: s.id,
        userId: s.userId,
        problemId: s.problemId,
        status: s.status,
        score: s.score || 0,
        submittedAt: s.submittedAt,
        // Phase 1：作业维度做题用时，用于完成情况统计表展示与排序
        timeElapsedMs: s.timeElapsedMs || 0,
      }))
    : []

  // 题目统计
  const problemStats: Record<
    string,
    { submitCount: number; acceptedCount: number; acceptedUsers: Set<string> }
  > = {}
  assignment.problemIds.forEach((problemId: string) => {
    const ps = submissions.filter((s: any) => s.problemId === problemId)
    const accepted: Set<string> = new Set(
      ps.filter((s: any) => s.status === 'AC').map((s: any) => s.userId as string)
    )
    problemStats[problemId] = {
      submitCount: ps.length,
      acceptedCount: accepted.size,
      acceptedUsers: accepted,
    }
  })

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      deadline: assignment.endTime,
      status: getAssignmentStatus(assignment.startTime, assignment.endTime),
      allowLateSubmission: assignment.allowLateSubmission,
      problems: problems.map((p: any) => ({
        id: p.id,
        title: p.title,
        problemNumber: p.problemNumber || '',
        difficulty: p.difficulty,
        totalSubmit: problemStats[p.id]?.submitCount || 0,
        totalAccepted: problemStats[p.id]?.acceptedCount || 0,
      })),
      classId: assignment.classId,
      memberProgress,
      createdAt: assignment.createdAt,
      createdBy: assignment.createdBy,
    },
    submissions: userSubmissions.map((s: any) => ({
      id: s.id,
      problemId: s.problemId,
      status: s.status,
      score: s.score || 0,
      submittedAt: s.submittedAt,
    })),
    allSubmissions,
  }
}

/**
 * 重新计算指定作业下所有提交的 isLate 标记。
 * 通常在作业 endTime 被修改后调用，以保证历史提交的逾期标记与新截止时间一致。
 */
export async function recalculateLateFlags(assignmentId: string): Promise<void> {
  const assignment = await prisma.classAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment || !assignment.endTime) return

  const deadline = new Date(assignment.endTime)
  const submissions = await prisma.classAssignmentSubmission.findMany({
    where: { assignmentId },
    select: { id: true, submittedAt: true, isLate: true },
  })

  for (const s of submissions) {
    const newIsLate = new Date(s.submittedAt) > deadline
    if (s.isLate !== newIsLate) {
      await prisma.classAssignmentSubmission.update({
        where: { id: s.id },
        data: { isLate: newIsLate },
      })
    }
  }
}

/** 班级管理员更新作业：含校验、默认值补全、写入 */
export async function updateClassAssignment(
  classId: string,
  assignmentId: string,
  body: {
    title?: string
    description?: string
    startTime?: string | Date
    endTime?: string | Date
    deadline?: string | Date
    problemIds?: string[]
    allowLateSubmission?: boolean
  }
) {
  const finalEndTime = body.endTime || body.deadline
  if (!body.title || !body.problemIds || body.problemIds.length === 0) {
    throw new ApiError('MISSING_FIELDS', '请填写完整的作业信息', 400)
  }
  // 强化输入校验：长度 / 数量
  if (body.title.length > 200) {
    throw new ApiError('INVALID_TITLE', '作业标题不能超过 200 字符', 400)
  }
  if (body.description && body.description.length > 2000) {
    throw new ApiError('INVALID_DESCRIPTION', '作业描述不能超过 2000 字符', 400)
  }
  if (body.problemIds.length > 50) {
    throw new ApiError('INVALID_PROBLEMS', '作业题目数量不能超过 50 个', 400)
  }
  // 日期格式校验（Date.isValid）
  if (body.startTime) {
    const d = new Date(body.startTime)
    if (isNaN(d.getTime())) {
      throw new ApiError('INVALID_START_TIME', '开始时间格式无效', 400)
    }
  }
  if (finalEndTime) {
    const d = new Date(finalEndTime)
    if (isNaN(d.getTime())) {
      throw new ApiError('INVALID_END_TIME', '结束时间格式无效', 400)
    }
  }

  const existing = await prisma.classAssignment.findUnique({
    where: { id: assignmentId, classId },
  })
  if (!existing) {
    throw new ApiError('NOT_FOUND', '作业不存在', 404)
  }
  const valid = await validateAssignmentProblems(body.problemIds)
  if (!valid) {
    throw new ApiError('INVALID_PROBLEMS', '部分题目不存在或未公开', 400)
  }

  const finalStartTime = body.startTime
    ? new Date(body.startTime)
    : existing.startTime || undefined
  const finalEndDate = finalEndTime ? new Date(finalEndTime) : existing.endTime || undefined

  // startTime < endTime 校验（综合新旧值）
  if (finalStartTime && finalEndDate && finalStartTime.getTime() >= finalEndDate.getTime()) {
    throw new ApiError('INVALID_TIME_RANGE', '开始时间必须早于结束时间', 400)
  }

  // 状态校验：读取作业当前状态（基于现有 startTime/endTime）
  const status = getAssignmentStatus(existing.startTime, existing.endTime)
  // ended 状态下拒绝修改 problemIds
  if (
    status === 'ended' &&
    body.problemIds &&
    JSON.stringify(body.problemIds) !== JSON.stringify(existing.problemIds)
  ) {
    throw new ApiError(
      'ASSIGNMENT_ENDED_CANNOT_MODIFY_PROBLEMS',
      '作业已结束，不能修改题目列表',
      403
    )
  }

  const { updateClassAssignmentDirect } = await import('@/lib/mongodb-direct')
  await updateClassAssignmentDirect(assignmentId, {
    title: body.title,
    description: body.description || '',
    startTime: finalStartTime,
    endTime: finalEndDate,
    problemIds: body.problemIds,
    allowLateSubmission: typeof body.allowLateSubmission === 'boolean' ? body.allowLateSubmission : undefined,
  })

  // active 状态下修改 problemIds 时，对被移除的题目清理孤儿提交与计时进度
  if (status === 'active' && body.problemIds) {
    const removedProblemIds = existing.problemIds.filter(
      (id) => !body.problemIds!.includes(id)
    )
    if (removedProblemIds.length > 0) {
      // 标记孤儿提交为 REMOVED（终态，保留记录但不再参与统计/评测）
      await prisma.classAssignmentSubmission.updateMany({
        where: { assignmentId, problemId: { in: removedProblemIds } },
        data: { status: SubmissionStatus.REMOVED },
      })
      // 删除计时进度记录
      await prisma.classAssignmentProblemProgress.deleteMany({
        where: { assignmentId, problemId: { in: removedProblemIds } },
      })
    }
  }

  // 若 endTime 被修改，重新计算所有提交的 isLate 标记
  const oldEndTimeMs = existing.endTime ? existing.endTime.getTime() : null
  const newEndTimeMs = finalEndDate ? finalEndDate.getTime() : null
  if (oldEndTimeMs !== newEndTimeMs) {
    await recalculateLateFlags(assignmentId)
  }

  return { id: assignmentId }
}

/** 班级管理员删除作业：先校验存在 + 仅 owner 可删，再删除 */
export async function deleteClassAssignment(
  classId: string,
  assignmentId: string,
  userId: string
) {
  const assignment = await prisma.classAssignment.findUnique({
    where: { id: assignmentId, classId },
  })
  if (!assignment) {
    throw new ApiError('NOT_FOUND', '作业不存在', 404)
  }
  // 权限收紧：仅 owner 可删除作业（assertClassAdmin 允许 owner + assistant，这里再加一道 owner 检查）
  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
  if (!member || !isClassOwnerRole(member.role)) {
    throw new ApiError('FORBIDDEN', '只有班级创建者可以删除作业', 403)
  }
  const { deleteClassAssignmentDirect } = await import('@/lib/mongodb-direct')
  await deleteClassAssignmentDirect(assignmentId)
  return { message: '作业删除成功' }
}
