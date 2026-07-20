/**
 * 在线测试（pretest）：在正式提交前用样例测试点运行用户代码
 * POST /api/problems/[id]/pretest
 * body: { code: string, language: string }
 *
 * 鉴权：需登录
 * 行为：
 *   - 仅使用题目的样例测试点（isSample=true）
 *   - 不创建 Submission 记录，不进入评测队列
 *   - 同步执行，返回每个样例的运行结果
 *
 * 安全约束：
 *   - code 长度上限 50000（与正式提交一致）
 *   - 语言白名单 ['cpp', 'c', 'python']（与 compiler.ts 一致）
 *   - 复用 executePretest 内的代码安全分析与沙箱执行
 */
import { withApi, ok, readJson, throw400, throw404 } from '@/lib/api/withApi'
import { executePretest, type PretestCase } from '@/lib/judge/pretest'
import type { ComparisonMode } from '@/lib/judge/types'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { isObjectIdLike } from '@/lib/problem/lookup'

// 支持的提交语言白名单（与 lib/judge/compiler.ts 的 languageConfigs 一致）
const ALLOWED_LANGUAGES = ['cpp', 'c', 'python']

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id: problemId } = ctx.params
  if (!problemId) throw400('INVALID_ID', '无效的题目ID')

  const body = await readJson<{ code: string; language: string }>(req)
  if (!body.code || !body.language) {
    throw400('VALIDATION', '缺少必需字段: code, language')
  }
  if (typeof body.code !== 'string' || body.code.length > 50000) {
    throw400('VALIDATION', '代码长度不合法（最大 50000 字符）')
  }
  if (typeof body.language !== 'string' || !ALLOWED_LANGUAGES.includes(body.language)) {
    throw400('VALIDATION', '不支持的语言')
  }

  // 题目 ID 可能是 MongoDB ObjectId（24 字符 hex）或 problemNumber（如 "P1001"）
  // 直接对非 ObjectId 字符串调用 findUnique({ where: { id } }) 会触发
  // "Malformed ObjectID" 错误，因此用 isObjectIdLike 区分查询字段。
  const problemWhere: { id: string } | { problemNumber: string } = isObjectIdLike(problemId)
    ? { id: problemId }
    : { problemNumber: problemId }

  // 校验题目存在且公开可见，避免用户对未公开/不存在的题目发起 pretest
  const problem = await prisma.problem.findFirst({
    where: problemWhere,
    select: {
      id: true,
      timeLimit: true,
      memoryLimit: true,
      comparisonMode: true,
      realPrecision: true,
      // samples 是题目描述中展示给用户看的样例（Json 字段），
      // 当 TestCase 表没有 isSample=true 的记录时作为 pretest 回退数据源
      samples: true,
    },
  })
  if (!problem) throw404('题目不存在')
  // throw404 返回 never，TS 已收窄 problem 为非空类型
  const safeProblem = problem!

  // 取样例测试点（isSample=true），按 orderIndex 升序
  // 注意：TestCase.problemId 必须用真正的 ObjectId（不能用 P1001）
  const sampleTestCases = await prisma.testCase.findMany({
    where: { problemId: safeProblem.id, isSample: true },
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      input: true,
      output: true,
      timeLimit: true,
      memoryLimit: true,
    },
  })

  // 构造 pretest 测试点列表：
  // 1. 优先使用 TestCase 中 isSample=true 的样例测试点（含时间/内存限制覆盖）
  // 2. 回退到 Problem.samples（题目描述中的样例），使用题目默认时间/内存限制
  //    这样即使题目未配置 isSample 标记，pretest 仍可用题目公开样例运行
  let testCases: PretestCase[]
  let sampleSource: 'testcase' | 'problem-samples' | 'none'

  if (sampleTestCases.length > 0) {
    testCases = sampleTestCases.map((tc) => ({
      id: tc.id,
      input: tc.input,
      output: tc.output,
      timeLimit: tc.timeLimit,
      memoryLimit: tc.memoryLimit,
    }))
    sampleSource = 'testcase'
  } else if (Array.isArray(safeProblem.samples) && safeProblem.samples.length > 0) {
    // 回退：使用 Problem.samples（题目描述中的样例）
    // samples 结构：Array<{ input: string; output: string; explanation?: string }>
    testCases = safeProblem.samples
      .filter(
        (s: any): s is { input: string; output: string } =>
          s && typeof s === 'object' && typeof s.input === 'string' && typeof s.output === 'string'
      )
      .map((s, idx) => ({
        id: `problem-sample-${idx}`,
        input: s.input,
        output: s.output,
        // 题目描述样例无独立时间/内存限制，使用题目默认值（null 表示由 executePretest 用题目默认）
        timeLimit: null,
        memoryLimit: null,
      }))
    sampleSource = 'problem-samples'
  } else {
    testCases = []
    sampleSource = 'none'
  }

  if (testCases.length === 0) {
    return ok({
      status: 'AC',
      passedTests: 0,
      totalTests: 0,
      time: 0,
      memory: 0,
      results: [],
      judgedAt: new Date(),
      message: '本题暂无样例测试点（TestCase 未标记 isSample 且题目描述无 samples），建议直接提交',
    })
  }

  logger.info('pretest 请求', {
    userId: user.id,
    problemId,
    language: body.language,
    sampleCount: testCases.length,
    sampleSource,
  })

  const result = await executePretest({
    code: body.code,
    language: body.language,
    timeLimit: safeProblem.timeLimit,
    memoryLimit: safeProblem.memoryLimit,
    comparisonMode: (safeProblem.comparisonMode as ComparisonMode) || 'default',
    realPrecision: safeProblem.realPrecision ?? 3,
    testCases,
  })

  return ok(result)
})
