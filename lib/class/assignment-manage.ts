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
import { ApiError } from '@/lib/api/errors'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'
import { validateAssignmentObjectiveQuestions, validateAssignmentProblems } from './helpers'
import { getClassAssignmentDetail, getAssignmentStatus } from './assignment-stats'
import type {
  ObjectiveAnswer,
  ObjectiveQuestionOption,
  ObjectiveQuestionType,
  ObjectiveSubmissionDTO,
} from '@/lib/objective-question/types'

/* ============================================================================
 * 班级作业详情视图 / 更新 / 删除（原 /api/classes/[id]/assignments/[assignmentId]）
 * ========================================================================== */

/** 作业详情中的客观题条目（不含 answer/explanation，防止答案泄露） */
export interface AssignmentObjectiveQuestionItem {
  id: string
  questionNumber: string | null
  type: ObjectiveQuestionType
  title: string
  difficulty: string
  score: number
  options: ObjectiveQuestionOption[] | null
}

/** 作业详情中的客观题作答条目（同题仅保留最新作答，结构复用 ObjectiveSubmissionDTO） */
export type AssignmentObjectiveSubmissionItem = ObjectiveSubmissionDTO

/** 作业详情中的全员客观题作答条目（仅班级 admin / canViewStats 可见） */
export interface AssignmentAllObjectiveSubmissionItem
  extends ObjectiveSubmissionDTO {
  userId: string
}

/** 班级作业详情视图：题目 + 成员完成进度 + 当前用户提交 + 题目统计 */
export async function buildClassAssignmentDetail(
  classId: string,
  assignmentId: string,
  viewerUserId: string,
  viewerRole: string,
  viewerPermissions?: Record<string, boolean>
) {
  const detail = await getClassAssignmentDetail(classId, assignmentId)
  if (!detail) return null
  const { assignment, members, submissions, objectiveSubmissions } = detail

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

  // 客观题：select 明确排除 answer / explanation，防止答案泄露
  const objectiveQuestionIds = assignment.objectiveQuestionIds || []
  const objectiveQuestionsRaw = await prisma.objectiveQuestion.findMany({
    where: { id: { in: objectiveQuestionIds } },
    select: {
      id: true,
      questionNumber: true,
      type: true,
      title: true,
      difficulty: true,
      score: true,
      options: true,
    },
  })
  // findMany 不保证顺序，按 objectiveQuestionIds 顺序重排（与 problemIds 排序逻辑一致）
  const objectiveQuestionById = new Map(
    objectiveQuestionsRaw.map((q) => [q.id, q])
  )
  const objectiveQuestions = objectiveQuestionIds
    .map((id) => objectiveQuestionById.get(id))
    .filter(Boolean) as typeof objectiveQuestionsRaw

  // C-P2-23：按 userId 分组提交为 Map，成员循环 O(1) 查 Map，避免 O(成员×提交) 双重循环
  const submissionsByUser = new Map<string, typeof submissions>()
  for (const s of submissions) {
    const list = submissionsByUser.get(s.userId)
    if (list) list.push(s)
    else submissionsByUser.set(s.userId, [s])
  }

  // 客观题提交按 userId 分组（同题仅一条最新记录，直接判对计数）
  const objectiveSubmissionsByUser = new Map<string, typeof objectiveSubmissions>()
  for (const s of objectiveSubmissions) {
    const list = objectiveSubmissionsByUser.get(s.userId)
    if (list) list.push(s)
    else objectiveSubmissionsByUser.set(s.userId, [s])
  }

  // 成员完成情况（solved = AC 编程题数 + 判对客观题数；total = 编程题数 + 客观题数）
  type MemberProgressRow = {
    userId: string
    username: string
    nickname: string | null
    avatar: string | null
    role: string
    progress: { solved: number; total: number; percentage: number }
  }
  const totalQuestionCount = problems.length + objectiveQuestions.length
  const memberProgress = members
    .map((m) => {
      const us = submissionsByUser.get(m.userId) || []
      const solved = new Set(us.filter((s) => s.status === 'AC').map((s) => s.problemId))
      const objectiveSolved = (objectiveSubmissionsByUser.get(m.userId) || []).filter(
        (s) => s.isCorrect
      ).length
      const solvedCount = solved.size + objectiveSolved
      const row: MemberProgressRow = {
        userId: m.userId,
        username: m.user.username,
        nickname: m.user.nickname,
        avatar: sanitizeAvatarUrl(m.user.avatar),
        role: normalizeClassRoleToApi(m.role),
        progress: {
          solved: solvedCount,
          total: totalQuestionCount,
          percentage:
            totalQuestionCount > 0
              ? Math.round((solvedCount / totalQuestionCount) * 100)
              : 0,
        },
      }
      return row
    })
    .sort((a, b) => b.progress.solved - a.progress.solved)

  const userSubmissions = submissions.filter((s) => s.userId === viewerUserId)
  const viewerIsClassAdmin = isClassAdminApiRole(viewerRole)
  // 完成情况可见性：班级 admin 恒可见；被授予 canViewStats 权限位的成员也可见
  const canViewAllSubmissions =
    viewerIsClassAdmin || viewerPermissions?.canViewStats === true

  // 列表主键 = 主 Submission.id；assignmentSubmissionId 仅为作业记录元数据
  const assignmentSubmissionIds = submissions.map((s) => s.id)
  const linkedMainSubs =
    assignmentSubmissionIds.length > 0
      ? await prisma.submission.findMany({
          where: { assignmentSubmissionId: { in: assignmentSubmissionIds } },
          select: { id: true, assignmentSubmissionId: true },
        })
      : []
  const mainIdByAssignmentSubId = new Map(
    linkedMainSubs
      .filter((s) => s.assignmentSubmissionId)
      .map((s) => [s.assignmentSubmissionId as string, s.id])
  )

  const mapSubmissionRow = (s: (typeof submissions)[number]) => {
    const mainId = mainIdByAssignmentSubId.get(s.id)
    if (!mainId) {
      // 作业提交必须有关联主 Submission；无关联则丢弃（数据不完整，无法用主 id 推送）
      return null
    }
    return {
      id: mainId,
      assignmentSubmissionId: s.id,
      userId: s.userId,
      problemId: s.problemId,
      status: s.status,
      score: s.score || 0,
      submittedAt: s.submittedAt,
      language: s.language,
      time: s.time || 0,
      memory: s.memory || 0,
      passedTests: s.passedTests || 0,
      totalTests: s.totalTests || 0,
      message: s.message || null,
      code: s.code,
      isLate: s.isLate || false,
      timeElapsedMs: s.timeElapsedMs || 0,
    }
  }

  const allSubmissions = canViewAllSubmissions
    ? submissions.map(mapSubmissionRow).filter(Boolean)
    : []

  // 客观题作答 → DTO（原始记录含 user 信息，映射时剥离）
  const mapObjectiveSubmissionRow = (
    s: (typeof objectiveSubmissions)[number]
  ): AssignmentObjectiveSubmissionItem => ({
    questionId: s.questionId,
    answer: Array.isArray(s.answer) ? (s.answer as ObjectiveAnswer) : [],
    isCorrect: s.isCorrect,
    score: s.score,
    submitCount: s.submitCount,
    submittedAt: new Date(s.submittedAt).toISOString(),
    isLate: s.isLate,
  })

  // 当前用户最新作答（同题仅一条记录，无需再取最新）
  const userObjectiveSubmissions = objectiveSubmissions.filter(
    (s) => s.userId === viewerUserId
  )
  // 全员作答：可见性同 allSubmissions（班级 admin 恒可见；canViewStats 权限位成员可见）
  const allObjectiveSubmissions: AssignmentAllObjectiveSubmissionItem[] =
    canViewAllSubmissions
      ? objectiveSubmissions.map((s) => ({
          ...mapObjectiveSubmissionRow(s),
          userId: s.userId,
        }))
      : []

  // 题目统计
  const problemStats: Record<
    string,
    { submitCount: number; acceptedCount: number; acceptedUsers: Set<string> }
  > = {}
  assignment.problemIds.forEach((problemId: string) => {
    const ps = submissions.filter((s) => s.problemId === problemId)
    const accepted: Set<string> = new Set(
      ps.filter((s) => s.status === 'AC').map((s) => s.userId)
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
      status: getAssignmentStatus(assignment.startTime, assignment.endTime),
      allowLateSubmission: assignment.allowLateSubmission,
      problems: problems.map((p) => ({
        id: p.id,
        title: p.title,
        problemNumber: p.problemNumber || '',
        difficulty: p.difficulty,
        totalSubmit: problemStats[p.id]?.submitCount || 0,
        totalAccepted: problemStats[p.id]?.acceptedCount || 0,
      })),
      // 客观题（按 objectiveQuestionIds 顺序，不含 answer/explanation）
      objectiveQuestions: objectiveQuestions.map(
        (q): AssignmentObjectiveQuestionItem => ({
          id: q.id,
          questionNumber: q.questionNumber,
          type: q.type as ObjectiveQuestionType,
          title: q.title,
          difficulty: q.difficulty,
          score: q.score,
          options: Array.isArray(q.options)
            ? (q.options as unknown as ObjectiveQuestionOption[])
            : null,
        })
      ),
      classId: assignment.classId,
      memberProgress,
      createdAt: assignment.createdAt,
      createdBy: assignment.createdBy,
    },
    submissions: userSubmissions.map(mapSubmissionRow).filter(Boolean),
    allSubmissions,
    // 当前用户客观题最新作答
    objectiveSubmissions: userObjectiveSubmissions.map(mapObjectiveSubmissionRow),
    // 全员客观题作答（仅班级 admin / canViewStats 可见，否则为空数组）
    allObjectiveSubmissions,
  }
}

/**
 * 重新计算指定作业下所有提交的 isLate 标记。
 * 通常在作业 endTime 被修改后调用，以保证历史提交的逾期标记与新截止时间一致。
 */
export async function recalculateLateFlags(assignmentId: string): Promise<void> {
  const assignment = await prisma.classAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment || !assignment.endTime) return

  const endAt = new Date(assignment.endTime)
  const submissions = await prisma.classAssignmentSubmission.findMany({
    where: { assignmentId },
    select: { id: true, submittedAt: true, isLate: true },
  })

  // C-P2-5：按新 isLate 值分两组批量 updateMany，替代循环内逐条 update
  const shouldBeLate: string[] = []
  const shouldBeNotLate: string[] = []
  for (const s of submissions) {
    const newIsLate = new Date(s.submittedAt) > endAt
    if (s.isLate !== newIsLate) {
      if (newIsLate) shouldBeLate.push(s.id)
      else shouldBeNotLate.push(s.id)
    }
  }
  if (shouldBeLate.length > 0) {
    await prisma.classAssignmentSubmission.updateMany({
      where: { id: { in: shouldBeLate } },
      data: { isLate: true },
    })
  }
  if (shouldBeNotLate.length > 0) {
    await prisma.classAssignmentSubmission.updateMany({
      where: { id: { in: shouldBeNotLate } },
      data: { isLate: false },
    })
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
    problemIds?: string[]
    objectiveQuestionIds?: string[]
    allowLateSubmission?: boolean
  }
) {
  const finalEndTime = body.endTime
  // 编程题与客观题均为可选，默认空数组；两类合计至少 1 题
  const problemIds = body.problemIds ?? []
  const rawObjectiveQuestionIds = body.objectiveQuestionIds ?? []
  if (!body.title) {
    throw new ApiError('MISSING_FIELDS', '请填写完整的作业信息', 400)
  }
  if (problemIds.length + rawObjectiveQuestionIds.length === 0) {
    throw new ApiError('MISSING_FIELDS', '请至少选择一个编程题或客观题', 400)
  }
  // 强化输入校验：长度 / 数量
  if (body.title.length > 200) {
    throw new ApiError('INVALID_TITLE', '作业标题不能超过 200 字符', 400)
  }
  if (body.description && body.description.length > 2000) {
    throw new ApiError('INVALID_DESCRIPTION', '作业描述不能超过 2000 字符', 400)
  }
  // 题目数量校验：编程题 + 客观题合计 1-50 个
  if (problemIds.length + rawObjectiveQuestionIds.length > 50) {
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
  const valid = await validateAssignmentProblems(problemIds)
  if (!valid) {
    throw new ApiError('INVALID_PROBLEMS', '部分题目不存在或未公开', 400)
  }
  // 验证客观题是否存在（含逐项 ObjectId 格式校验，返回去重规范化 id）
  const objectiveQuestionIds = await validateAssignmentObjectiveQuestions(rawObjectiveQuestionIds)

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
  // ended 状态下拒绝修改题目列表（编程题与客观题同规则）
  if (status === 'ended') {
    if (JSON.stringify(problemIds) !== JSON.stringify(existing.problemIds)) {
      throw new ApiError(
        'ASSIGNMENT_ENDED_CANNOT_MODIFY_PROBLEMS',
        '作业已结束，不能修改题目列表',
        403
      )
    }
    if (
      JSON.stringify(objectiveQuestionIds) !==
      JSON.stringify(existing.objectiveQuestionIds || [])
    ) {
      throw new ApiError(
        'ASSIGNMENT_ENDED_CANNOT_MODIFY_OBJECTIVE_QUESTIONS',
        '作业已结束，不能修改客观题列表',
        403
      )
    }
  }

  const { updateClassAssignmentDirect } = await import('@/lib/mongodb-direct')
  await updateClassAssignmentDirect(assignmentId, {
    title: body.title,
    description: body.description || '',
    startTime: finalStartTime,
    endTime: finalEndDate,
    problemIds,
    objectiveQuestionIds,
    allowLateSubmission: typeof body.allowLateSubmission === 'boolean' ? body.allowLateSubmission : undefined,
  })

  // active 状态下修改题目列表时，对被移除的题目清理孤儿提交与计时进度
  if (status === 'active') {
    const removedProblemIds = existing.problemIds.filter(
      (id) => !problemIds.includes(id)
    )
    if (removedProblemIds.length > 0) {
      // 标记孤儿提交为 REMOVED（终态，保留记录但不再参与统计/评测）
      await prisma.classAssignmentSubmission.updateMany({
        where: { assignmentId, problemId: { in: removedProblemIds } },
        data: { status: SubmissionStatus.REMOVED },
      })
      // 保留计时进度（暂停并固化），不硬删，避免历史用时丢失
      await prisma.classAssignmentProblemProgress.updateMany({
        where: {
          assignmentId,
          problemId: { in: removedProblemIds },
          completedAt: null,
        },
        data: {
          isPaused: true,
          lastResumedAt: null,
        },
      })
    }
    // 客观题：删除被移除题目的作答记录（清理孤儿作答，硬删）
    const removedObjectiveQuestionIds = (existing.objectiveQuestionIds || []).filter(
      (id) => !objectiveQuestionIds.includes(id)
    )
    if (removedObjectiveQuestionIds.length > 0) {
      await prisma.classAssignmentObjectiveSubmission.deleteMany({
        where: { assignmentId, questionId: { in: removedObjectiveQuestionIds } },
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
