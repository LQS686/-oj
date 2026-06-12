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
import { getClassAssignmentDetail, validateAssignmentProblems } from '@/lib/class/service'
import { prisma } from '@/lib/prisma'
import {
  updateClassAssignmentDirect,
  deleteClassAssignmentDirect,
} from '@/lib/mongodb-direct'

async function getMember(classId: string, userId: string) {
  return prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId } },
  })
}

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id, assignmentId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const member = await getMember(id, user.id)
  if (!member) throw403('只有班级成员可以查看作业')

  const detail = await getClassAssignmentDetail(id, assignmentId)
  if (!detail) throw404('作业不存在')
  const { assignment, members, submissions } = detail!

  // 获取题目详情
  const problems = await prisma.problem.findMany({
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
        role: m.role,
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

  // 当前用户的提交
  const userSubmissions = submissions.filter((s: any) => s.userId === user.id)
  const isAdminOrOwner = member!.role === 'owner' || member!.role === 'admin'
  const allSubmissions = isAdminOrOwner
    ? submissions.map((s: any) => ({
        id: s.id,
        userId: s.userId,
        problemId: s.problemId,
        status: s.status,
        score: s.score || 0,
        submittedAt: s.submittedAt,
      }))
    : []

  // 题目统计
  const problemStats: Record<string, { submitCount: number; acceptedCount: number; acceptedUsers: Set<string> }> = {}
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

  return ok({
    assignment: {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      deadline: assignment.endTime,
      problems: problems.map((p) => ({
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
  })
})

export const PUT = withApi.auth(async (req, ctx, { user }) => {
  const { id, assignmentId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const body = await readJson<{
    title?: string
    description?: string
    startTime?: string | Date
    endTime?: string | Date
    deadline?: string | Date
    problemIds?: string[]
  }>(req)

  const finalEndTime = body.endTime || body.deadline
  if (!body.title || !body.problemIds || body.problemIds.length === 0) {
    throw400('MISSING_FIELDS', '请填写完整的作业信息')
  }

  const member = await getMember(id, user.id)
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw403('只有管理员可以更新作业')
  }

  const existing = await prisma.classAssignment.findUnique({
    where: { id: assignmentId, classId: id },
  })
  if (!existing) throw404('作业不存在')

  const valid = await validateAssignmentProblems(body.problemIds!)
  if (!valid) throw400('INVALID_PROBLEMS', '部分题目不存在或未公开')

  const finalStartTime = body.startTime
    ? new Date(body.startTime)
    : existing!.startTime || undefined
  const finalEndDate = finalEndTime
    ? new Date(finalEndTime)
    : existing!.endTime || undefined

  await updateClassAssignmentDirect(assignmentId, {
    title: body.title!,
    description: body.description || '',
    startTime: finalStartTime,
    endTime: finalEndDate,
    problemIds: body.problemIds!,
  })

  return ok({ id: assignmentId })
})

export const DELETE = withApi.auth(async (req, ctx, { user }) => {
  const { id, assignmentId } = (ctx as any).params
  if (!isObjectId(id) || !isObjectId(assignmentId)) {
    throw400('INVALID_ID', '无效的ID')
  }

  const member = await getMember(id, user.id)
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw403('只有管理员可以删除作业')
  }

  const assignment = await prisma.classAssignment.findUnique({
    where: { id: assignmentId, classId: id },
  })
  if (!assignment) throw404('作业不存在')

  await deleteClassAssignmentDirect(assignmentId)
  return ok({ message: '作业删除成功' })
})
