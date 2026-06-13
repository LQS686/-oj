/**
 * /api/admin/problems - 管理员题目管理
 *
 * GET  题目列表
 * POST 创建题目
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { prisma, Prisma } from '@/lib/prisma'
import {
  validateRequired,
  validateProblemTitle,
  validateProblemDescription,
  validateDifficulty,
  validateTimeLimit,
  validateMemoryLimit,
  validateTags,
  validateTestCases,
} from '@/lib/validation'
import { trimAll, escapeHtml } from '@/lib/sanitize'
import { redistributeTestScores } from '@/lib/problem/testcase'
import { enqueueSolutionJob } from '@/lib/ai/solution-queue'

/**
 * GET /api/admin/problems - 获取题目列表（管理员）
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const problems = await prisma.problem.findMany({
    orderBy: [
      { problemNumber: 'asc' },
      { createdAt: 'desc' },
    ],
    select: {
      id: true,
      problemNumber: true,
      title: true,
      description: true,
      input: true,
      output: true,
      samples: true,
      hint: true,
      source: true,
      difficulty: true,
      tags: true,
      isPublic: true,
      visibility: true,
      timeLimit: true,
      memoryLimit: true,
      totalSubmit: true,
      totalAccepted: true,
      createdAt: true,
      updatedAt: true,
      isAiGenerated: true,
      aiStatus: true,
    },
  })

  return ok(problems)
})

/**
 * POST /api/admin/problems - 创建题目（管理员）
 */
export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<Record<string, any>>(req)
  const trimmedBody = trimAll(body)
  const {
    problemNumber,
    title,
    description,
    input,
    output,
    samples,
    hint,
    source,
    difficulty,
    tags,
    timeLimit,
    memoryLimit,
    isPublic,
    visibility,
    testCases,
  } = trimmedBody

  const requiredError = validateRequired(trimmedBody, ['title', 'description', 'difficulty'])
  if (requiredError) {
    throw400('MISSING_FIELDS', requiredError)
  }

  if (!validateProblemTitle(title as string)) {
    throw400('INVALID_TITLE', '题目标题长度必须在1-200个字符之间')
  }

  if (!validateProblemDescription(description as string)) {
    throw400('INVALID_DESCRIPTION', '题目描述至少需要10个字符')
  }

  if (!validateDifficulty(difficulty as string)) {
    throw400('INVALID_DIFFICULTY', '难度值无效，必须是：简单、中等、困难')
  }

  if (timeLimit !== undefined && timeLimit !== null) {
    const timeLimitNum = typeof timeLimit === 'string' ? parseInt(timeLimit, 10) : timeLimit
    if (!validateTimeLimit(timeLimitNum as number)) {
      throw400('INVALID_TIME_LIMIT', '时间限制必须在1-30000ms之间')
    }
  }

  if (memoryLimit !== undefined && memoryLimit !== null) {
    const memoryLimitNum = typeof memoryLimit === 'string' ? parseInt(memoryLimit, 10) : memoryLimit
    if (!validateMemoryLimit(memoryLimitNum as number)) {
      throw400('INVALID_MEMORY_LIMIT', '内存限制必须在1-1024MB之间')
    }
  }

  if (tags !== undefined && tags !== null && !validateTags(tags)) {
    throw400('INVALID_TAGS', '标签格式无效，每个标签必须是1-50个字符')
  }

  if (testCases !== undefined && testCases !== null) {
    const testCasesValidation = validateTestCases(testCases)
    if (!testCasesValidation.valid) {
      throw400('INVALID_TEST_CASES', testCasesValidation.errors.join('；'))
    }
  }

  const sanitizedTitle = escapeHtml(title as string)
  const sanitizedDescription = description as string
  const sanitizedInput = input ? (input as string) : ''
  const sanitizedOutput = output ? (output as string) : ''
  const sanitizedHint = hint ? escapeHtml(hint as string) : null
  const sanitizedSource = source ? escapeHtml(source as string) : null

  let finalProblemNumber = problemNumber as string | undefined

  if (!finalProblemNumber) {
    const latestProblem = await prisma.problem.findFirst({
      where: {
        problemNumber: {
          startsWith: 'P',
        },
      },
      orderBy: {
        problemNumber: 'desc',
      },
      select: {
        problemNumber: true,
      },
    })

    let nextNumber = 1001

    if (latestProblem?.problemNumber) {
      const match = latestProblem.problemNumber.match(/^P(\d+)$/)
      if (match) {
        const currentNumber = parseInt(match[1], 10)
        nextNumber = currentNumber + 1
      }
    }

    finalProblemNumber = `P${nextNumber}`
  } else {
    const existing = await prisma.problem.findUnique({
      where: { problemNumber: finalProblemNumber },
    })
    if (existing) {
      throw400('DUPLICATE_NUMBER', '题目编号已存在')
    }
  }

  const timeLimitValue: number = typeof timeLimit === 'string'
    ? parseInt(timeLimit, 10)
    : (typeof timeLimit === 'number' ? timeLimit : 1000)
  const memoryLimitValue: number = typeof memoryLimit === 'string'
    ? parseInt(memoryLimit, 10)
    : (typeof memoryLimit === 'number' ? memoryLimit : 128)

  const problemData: Prisma.ProblemCreateInput = {
    problemNumber: finalProblemNumber,
    title: sanitizedTitle,
    description: sanitizedDescription,
    input: sanitizedInput,
    output: sanitizedOutput,
    samples: samples || [],
    hint: sanitizedHint,
    source: sanitizedSource,
    difficulty: difficulty as string,
    tags: (tags as string[]) || [],
    timeLimit: timeLimitValue,
    memoryLimit: memoryLimitValue,
    isPublic: visibility === 'public',
    visibility: (visibility as string) || 'public',
    totalSubmit: 0,
    totalAccepted: 0,
    author: {
      connect: { id: user.id },
    },
  }

  if (testCases && Array.isArray(testCases) && testCases.length > 0) {
    problemData.testCases = {
      create: testCases.map((tc: Record<string, unknown>, idx: number) => ({
        input: String(tc.input || ''),
        output: String(tc.output || ''),
        isSample: Boolean(tc.isSample),
        score: Number(tc.score) || 10,
        orderIndex: idx,
      })),
    }
  }

  const problem = await prisma.problem.create({
    data: problemData as Prisma.ProblemCreateInput,
    include: {
      testCases: true,
    },
  })

  if (problem.testCases && problem.testCases.length > 0) {
    await redistributeTestScores(problem.id)
  }

  // 入队 AI 题解生成（不阻塞题目创建响应，AI 模块异常不影响题目落库）
  try {
    const { logId } = await enqueueSolutionJob({
      problemId: problem.id,
      title: problem.title,
      description: problem.description,
      stdCode: '',
      stdLang: '',
      authorId: user.id,
    })
    return ok({ problem, message: '题目创建成功', solutionGenerationStatus: 'queued', solutionLogId: logId })
  } catch (aiError) {
    return ok({ problem, message: '题目创建成功', solutionGenerationStatus: 'failed' })
  }
})
