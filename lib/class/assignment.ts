/**
 * lib/class/assignment.ts
 * 班级作业 CRUD + 提交查询
 */

import { prisma } from '@/lib/prisma'

export interface CreateClassAssignmentInput {
  classId: string
  title: string
  description: string
  problemIds: string[]
  startTime?: Date | null
  endTime?: Date | null
  createdBy: string
}

export async function createClassAssignment(input: CreateClassAssignmentInput) {
  return prisma.classAssignment.create({
    data: {
      classId: input.classId,
      title: input.title,
      description: input.description,
      problemIds: input.problemIds,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      createdBy: input.createdBy,
    },
  })
}

export async function getClassAssignment(assignmentId: string) {
  return prisma.classAssignment.findUnique({
    where: { id: assignmentId },
  })
}

/**
 * 查询用户在某作业下某题目的提交历史
 */
export async function listClassAssignmentSubmissions(
  classId: string,
  options: {
    assignmentId?: string
    userId?: string
    problemId?: string
    status?: string
    skip?: number
    take?: number
  } = {}
) {
  const { assignmentId, userId, problemId, status, skip = 0, take = 50 } = options

  const where: any = {}
  if (assignmentId) where.assignmentId = assignmentId
  if (userId) where.userId = userId
  if (problemId) where.problemId = problemId
  if (status) where.status = status

  if (classId) {
    where.assignment = { classId }
  }

  return prisma.classAssignmentSubmission.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
    skip,
    take,
  })
}

/**
 * 用户在某作业下某题目的最新一次提交
 */
export async function getLatestClassAssignmentSubmission(
  assignmentId: string,
  userId: string,
  problemId: string
) {
  return prisma.classAssignmentSubmission.findFirst({
    where: { assignmentId, userId, problemId },
    orderBy: { submittedAt: 'desc' },
  })
}
