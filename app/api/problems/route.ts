/**
 * 公共题库列表 / 创建
 * - GET  /api/problems  列表
 * - POST /api/problems  创建题目（管理员）
 */
import { withApi, ok, readJson, readQuery, throw400, throw403 } from '@/lib/api/withApi'
import { createProblemWithTestcases } from '@/lib/problem/service'
import { prisma } from '@/lib/prisma'
import { ensureTotalScoreIs100 } from '@/lib/problem/testcase'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{
    page?: string
    pageSize?: string
    search?: string
    difficulty?: 'easy' | 'medium' | 'hard'
    tag?: string
  }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.min(50, Math.max(1, parseInt(q.pageSize || '20') || 20))

  const where: any = { isPublic: true }
  if (q.search) {
    where.OR = [
      { title: { contains: q.search, mode: 'insensitive' } },
      { id: { contains: q.search } },
    ]
  }
  if (q.difficulty) where.difficulty = q.difficulty
  if (q.tag) where.tags = { has: q.tag }

  const [items, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.problem.count({ where }),
  ])

  return ok({ items, total, page, pageSize })
})

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const currentUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!currentUser?.isAdmin) throw403('只有管理员可以创建题目')

  const body = await readJson<{
    title?: string
    description?: string
    input?: string
    output?: string
    samples?: any
    hint?: string
    source?: string
    difficulty?: string
    tags?: string[]
    timeLimit?: number
    memoryLimit?: number
    isPublic?: boolean
    testCases?: any[]
  }>(req)

  // 校验必填字段
  if (!body.title || !body.description || !body.difficulty) {
    throw400('MISSING_FIELDS', '请填写完整的题目信息')
  }

  // 测试用例处理
  let processedTestCases: any[] | undefined
  if (body.testCases && Array.isArray(body.testCases) && body.testCases.length > 0) {
    const withOrder = body.testCases.map((tc, index) => ({
      input: tc.input ?? '',
      output: tc.output ?? '',
      isSample: !!tc.isSample,
      score: typeof tc.score === 'number' ? tc.score : 0,
      orderIndex: index + 1,
    }))
    const hasSample = withOrder.some((tc) => tc.isSample)
    if (!hasSample) {
      throw400('NEED_SAMPLE', '测试用例中至少需要包含一个样例')
    }
    const invalidSample = withOrder.find(
      (tc) => tc.isSample && (!tc.input.trim() || !tc.output.trim())
    )
    if (invalidSample) {
      throw400('INVALID_SAMPLE', '样例测试用例的输入输出不能为空')
    }
    const normalized = ensureTotalScoreIs100(withOrder)
    const allTestCases = await Promise.resolve(normalized)
    processedTestCases = allTestCases
  } else {
    throw400('MISSING_TEST_CASES', '请至少添加一个测试用例')
  }

  // 题目去重
  const existing = await prisma.problem.findFirst({
    where: { title: body.title },
  })
  if (existing) {
    throw400('TITLE_TAKEN', '已存在同名题目')
  }

  try {
    const problem = await createProblemWithTestcases({
      title: body.title!,
      description: body.description!,
      input: body.input || '',
      output: body.output || '',
      samples: body.samples || [],
      hint: body.hint,
      source: body.source,
      difficulty: body.difficulty!,
      tags: body.tags || [],
      timeLimit: body.timeLimit,
      memoryLimit: body.memoryLimit,
      isPublic: body.isPublic ?? false,
      testCases: processedTestCases,
      authorId: user.id,
    })
    return ok({ id: problem.id }, { status: 201 })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      throw400('TITLE_TAKEN', '已存在同名题目')
    }
    console.error('Create problem failed:', err)
    throw400('CREATE_FAILED', '题目创建失败')
  }
})
