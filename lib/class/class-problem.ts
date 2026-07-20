/**
 * lib/class/class-problem.ts
 * 班级私有题库
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

/* ============================================================================
 * 班级题目（私有题库）
 * ========================================================================== */

export interface ListClassProblemsFilter {
  page?: number
  pageSize?: number
  difficulty?: string
  search?: string
}

export async function listClassProblems(
  classId: string,
  filter: ListClassProblemsFilter = {}
) {
  const page = filter.page ?? 1
  const pageSize = filter.pageSize ?? 20
  const where: any = { classId }
  if (filter.difficulty) where.difficulty = filter.difficulty
  if (filter.search) {
    where.OR = [
      { title: { contains: filter.search, mode: 'insensitive' } },
      { tags: { has: filter.search } },
    ]
  }

  const [problems, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { author: { select: { username: true, nickname: true } } },
    }),
    prisma.problem.count({ where }),
  ])

  return {
    problems: problems.map((p: any) => ({
      id: p.id,
      title: p.title,
      problemNumber: p.problemNumber,
      difficulty: p.difficulty,
      tags: p.tags || [],
      acCount: p.totalAccepted,
      totalSubmissions: p.totalSubmit,
      acRate: p.totalSubmit > 0 ? Math.round((p.totalAccepted / p.totalSubmit) * 100) : 0,
      createdAt: p.createdAt,
      createdBy: p.authorId,
      authorName: p.author.nickname || p.author.username,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function getClassProblem(classId: string, problemId: string) {
  return prisma.problem.findUnique({
    where: { id: problemId, classId },
    include: { testCases: { orderBy: { orderIndex: 'asc' } } },
  })
}

export async function updateClassProblemFields(
  problemId: string,
  data: {
    title?: string
    description?: string
    difficulty?: string
    tags?: string[]
    timeLimit?: number
    memoryLimit?: number
  }
) {
  return prisma.problem.update({ where: { id: problemId }, data })
}

export async function deleteClassProblem(problemId: string) {
  return prisma.problem.delete({ where: { id: problemId } })
}

/** 生成班级题目编号：T + 6 位时间戳 + 4 位随机 hex（避免 Math.random 可预测性） */
function generateClassProblemNumber(): string {
  const suffix = crypto.randomBytes(2).toString('hex')
  return `T${Date.now().toString().slice(-6)}${suffix}`
}

/** 复制一道公共题到班级题库 */
export async function cloneProblemToClass(
  sourceProblemId: string,
  classId: string,
  authorId: string
) {
  const source = await prisma.problem.findUnique({
    where: { id: sourceProblemId },
    include: { testCases: true },
  })
  if (!source) return null
  const problemNumber = generateClassProblemNumber()
  return prisma.problem.create({
    data: {
      problemNumber,
      classId,
      title: source.title,
      description: source.description,
      input: source.input,
      output: source.output,
      samples: source.samples || [],
      hint: source.hint,
      source: source.source,
      difficulty: source.difficulty,
      tags: source.tags,
      timeLimit: source.timeLimit,
      memoryLimit: source.memoryLimit,
      isPublic: false,
      authorId,
      testCases: {
        create: source.testCases.map((tc: any, idx: any) => ({
          input: tc.input,
          output: tc.output,
          isSample: tc.isSample,
          score: tc.score,
          orderIndex: idx,
        })),
      },
    },
  })
}

/** 在班级题库下创建新题 */
export async function createNewClassProblem(
  classId: string,
  authorId: string,
  data: {
    title: string
    description: string
    difficulty?: string
    tags?: string[]
    timeLimit?: number
    memoryLimit?: number
  }
) {
  const problemNumber = generateClassProblemNumber()
  return prisma.problem.create({
    data: {
      problemNumber,
      classId,
      title: data.title,
      description: data.description,
      input: '',
      output: '',
      samples: [],
      difficulty: data.difficulty || '普及',
      tags: data.tags || [],
      timeLimit: data.timeLimit || 1000,
      memoryLimit: data.memoryLimit || 256,
      isPublic: false,
      authorId,
    },
  })
}
