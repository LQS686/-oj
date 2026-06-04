/**
 * save-and-verify — AI 出题"自动验证 + 自动发布"主流程
 *
 * 调用链：
 *   POST { problems, logId?, modelId? }
 *     → 对每个 GeneratedProblem：
 *         1) saveProblem(...)                          // 落库 + 测试点 + 标程
 *         2) executeJudge(problem.solution)            // 跑测试点（30s 超时）
 *         3) 失败则 regenerateSolution + 更新 DB        // 最多 3 次
 *         4) 成功后把 isPublic / aiStatus / fixAttempts 等字段落定
 *
 * 关键决策点：
 *   - executeJudge 不暴露 executeCode 的 output，所以 failedTest.actual 无法拿到；
 *     按任务要求把 failedTest 设为 undefined，让 regenerateSolution 仅用 judgeMessage 修正
 *   - executeJudge 走 Promise.race 加 30s 超时，超时按 TLE 处理
 *   - regenerateSolution 抛异常：保留草稿（isPublic=false, aiStatus='DRAFT'），
 *     success: false, error: 'AI 重写标程失败：...'
 *   - 任何一次循环成功（status=AC && passed === total）：
 *       UPDATE problem SET isPublic=true, aiStatus='VERIFIED', verifiedAt=now(),
 *                           judgeStatus='AC', fixAttempts=attempt
 *       UPDATE solution SET isOfficial=true, verified=true, verifiedAt=now()
 *   - 3 次都失败：
 *       UPDATE problem SET isPublic=true, aiStatus='AUTO_PUBLISHED_WITH_FAILURES',
 *                           verifiedAt=now(), judgeStatus=..., judgeMessage=...,
 *                           fixAttempts=3
 *       UPDATE solution SET isOfficial=false, verified=false
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { GeneratedProblem } from '@/lib/ai/prompts/core/types'
import { saveProblem } from '@/lib/ai/save-problem'
import { executeJudge } from '@/lib/judge/judger'
import { redistributeTestScores } from '@/lib/testcase-score'
import {
  regenerateSolution,
  ProblemContext,
  FailureContext
} from '@/lib/ai/regenerate-solution'

const MAX_ATTEMPTS = 3
const JUDGE_TIMEOUT_MS = 30_000

type JudgeStatus = 'AC' | 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE' | 'SE'

export interface FailedTestInfo {
  testIndex: number
  input: string
  expected: string
  actual: string
}

export interface SaveAndVerifyResult {
  success: true | 'partial' | false
  problemId?: string
  attempts: number
  judgeResult?: {
    status: JudgeStatus
    passed: number
    total: number
    message?: string
    failedTest?: FailedTestInfo
  }
  warning?: string
  error?: string
}

/**
 * 把 saveProblem 返回的 TestCase 转成 JudgeJob 需要的格式
 */
function toJudgeTestCases(testCases: any[]) {
  return testCases.map((tc) => ({
    id: tc.id,
    input: tc.input,
    output: tc.output,
    score: tc.score
  }))
}

/**
 * 用 Promise.race 给 executeJudge 加 30s 超时
 * 超时返回的合成结果按 TLE 处理
 */
async function executeJudgeWithTimeout(
  payload: Parameters<typeof executeJudge>[0],
  submissionId: string
) {
  let timer: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise<any>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        submissionId,
        status: 'TLE' as JudgeStatus,
        score: 0,
        time: 0,
        memory: 0,
        passedTests: 0,
        totalTests: payload.testCases.length,
        message: '评测超时（>30s）',
        testResults: []
      })
    }, JUDGE_TIMEOUT_MS)
  })

  try {
    const result = await Promise.race([executeJudge(payload), timeoutPromise])
    return result
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * 从 JudgeResult 中挑出第一个非 AC 的 testCase 信息
 * 注意 executeJudge.testResults 不含 actual output，所以 actual 置空字符串
 */
function pickFailedTest(
  judgeResult: any,
  fullTestCases: any[]
): FailedTestInfo | undefined {
  if (!judgeResult?.testResults || judgeResult.testResults.length === 0) {
    return undefined
  }
  const tcById = new Map<string, any>(fullTestCases.map((tc) => [tc.id, tc]))
  const failed = judgeResult.testResults.find((r: any) => r.status !== 'AC')
  if (!failed) return undefined
  const tcIndex = fullTestCases.findIndex((t) => t.id === failed.testId)
  const tc = tcById.get(failed.testId)
  if (!tc) return undefined
  return {
    testIndex: tcIndex >= 0 ? tcIndex + 1 : 1,
    input: tc.input ?? '',
    expected: tc.output ?? '',
    actual: '' // executeJudge 不暴露 actual output
  }
}

/**
 * 解析 JudgeResult.status → 内部枚举
 */
function normalizeStatus(status: string): JudgeStatus {
  const allowed: JudgeStatus[] = ['AC', 'WA', 'CE', 'RE', 'TLE', 'MLE', 'SE']
  return (allowed as string[]).includes(status) ? (status as JudgeStatus) : 'WA'
}

/**
 * 对单个 problem 跑"落库 + 评测 + 修正"完整流程
 */
async function verifyOne(
  user: { userId: string; isAdmin: boolean },
  problemData: GeneratedProblem,
  logId: string | undefined,
  modelId: string | undefined
): Promise<SaveAndVerifyResult> {
  // 1) 落库
  const saved = await saveProblem(user, problemData, logId, {
    isPublic: false,
    aiStatus: 'PENDING',
    solutionVerified: false
  })
  const { problem, solution } = saved
  const baseTestCases = saved.testCases

  // 优先用 cpp 标程，否则 python
  const initialCode = problemData.solution_cpp || problemData.solution_python || ''
  const language: 'cpp' | 'python' = problemData.solution_cpp ? 'cpp' : 'python'
  let currentCode = initialCode

  // 跟踪最后一次评测结果（用于失败分支落库）
  let lastJudgeResult: any = null
  let succeeded = false
  let successAttempts = 0
  let aiRewriteFailed = false
  let aiRewriteErrorMsg = ''

  // 2) 自动修正循环
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const submissionId = `${problem.id}-${attempt}`

    // 把保存下来的测试点喂给执行器
    const judgePayload: Parameters<typeof executeJudge>[0] = {
      submissionId,
      problemId: problem.id,
      userId: user.userId,
      code: currentCode,
      language,
      timeLimit: problemData.time_limit || problem.timeLimit || 1000,
      memoryLimit: problemData.memory_limit || problem.memoryLimit || 128,
      testCases: toJudgeTestCases(baseTestCases)
    }

    let judgeResult: any
    try {
      judgeResult = await executeJudgeWithTimeout(judgePayload, submissionId)
    } catch (e: any) {
      logger.error('[save-and-verify] executeJudge 抛异常', {
        problemId: problem.id,
        attempt,
        error: e?.message
      })
      judgeResult = {
        status: 'SE',
        score: 0,
        time: 0,
        memory: 0,
        passedTests: 0,
        totalTests: baseTestCases.length,
        message: e?.message || 'executeJudge 异常',
        testResults: []
      }
    }
    lastJudgeResult = judgeResult

    const status = normalizeStatus(judgeResult.status)
    const passed = Number(judgeResult.passedTests ?? 0)
    const total = Number(judgeResult.totalTests ?? baseTestCases.length)

    // 2.1 成功：直接跳出
    if (status === 'AC' && passed === total) {
      succeeded = true
      successAttempts = attempt + 1
      break
    }

    // 2.2 失败但还有预算：调 AI 修正
    if (attempt < MAX_ATTEMPTS - 1) {
      const failureContext: FailureContext = {
        judgeStatus: (['WA', 'CE', 'RE', 'TLE', 'MLE'] as const).includes(
          status as any
        )
          ? (status as 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE')
          : 'WA',
        judgeMessage: judgeResult.message || `评测状态：${status}`,
        failedTest: pickFailedTest(judgeResult, baseTestCases)
      }

      const problemContext: ProblemContext = {
        title: problemData.title,
        description: problemData.description,
        input: problemData.input,
        output: problemData.output,
        samples: problemData.samples || [],
        previousSolution: currentCode,
        language
      }

      try {
        const newCode = await regenerateSolution(problemContext, failureContext, {
          modelId
        })
        currentCode = newCode
        // 同步更新数据库中的标程（Solution.code 与 Problem.stdCode/stdLang）
        await prisma.solution.updateMany({
          where: { problemId: problem.id, authorId: user.userId },
          data: {
            code: newCode,
            language,
            verified: false,
            verifiedAt: null
          }
        })
        await prisma.problem.update({
          where: { id: problem.id },
          data: {
            stdCode: newCode,
            stdLang: language
          }
        })
        logger.info('[save-and-verify] AI 修正标程成功', {
          problemId: problem.id,
          attempt,
          judgeStatus: status
        })
      } catch (e: any) {
        logger.error('[save-and-verify] regenerateSolution 抛异常', {
          problemId: problem.id,
          attempt,
          error: e?.message
        })
        aiRewriteFailed = true
        aiRewriteErrorMsg = e?.message || 'AI 重写失败'
        break
      }
    }
  }

  // 3) AI 重写 API 异常分支
  if (aiRewriteFailed) {
    await prisma.problem.update({
      where: { id: problem.id },
      data: {
        isPublic: false,
        aiStatus: 'DRAFT'
      }
    })
    return {
      success: false,
      problemId: problem.id,
      attempts: 0,
      error: `AI 重写标程失败：${aiRewriteErrorMsg}`
    }
  }

  const finalStatus = normalizeStatus(lastJudgeResult?.status ?? 'WA')
  const finalPassed = Number(lastJudgeResult?.passedTests ?? 0)
  const finalTotal = Number(lastJudgeResult?.totalTests ?? baseTestCases.length)
  const finalMessage = lastJudgeResult?.message

  // 4) 成功分支
  if (succeeded) {
    await prisma.problem.update({
      where: { id: problem.id },
      data: {
        isPublic: true,
        aiStatus: 'VERIFIED',
        verifiedAt: new Date(),
        judgeStatus: 'AC',
        fixAttempts: successAttempts
      }
    })
    if (solution) {
      await prisma.solution.updateMany({
        where: { id: solution.id },
        data: {
          isOfficial: true,
          verified: true,
          verifiedAt: new Date()
        }
      })
    }
    // 重新分配一次（数量未变，分数仍等于 100，但保持幂等）
    if (baseTestCases.length > 0) {
      await redistributeTestScores(problem.id)
    }
    return {
      success: true,
      problemId: problem.id,
      attempts: successAttempts,
      judgeResult: {
        status: 'AC',
        passed: finalPassed,
        total: finalTotal
      }
    }
  }

  // 5) 3 次都失败分支
  await prisma.problem.update({
    where: { id: problem.id },
    data: {
      isPublic: true,
      aiStatus: 'AUTO_PUBLISHED_WITH_FAILURES',
      verifiedAt: new Date(),
      judgeStatus: finalStatus,
      judgeMessage: finalMessage || `3 次修正后仍未通过：${finalStatus}`,
      fixAttempts: MAX_ATTEMPTS
    }
  })
  if (solution) {
    await prisma.solution.updateMany({
      where: { id: solution.id },
      data: {
        isOfficial: false,
        verified: false,
        verifiedAt: null
      }
    })
  }
  if (baseTestCases.length > 0) {
    await redistributeTestScores(problem.id)
  }
  return {
    success: 'partial',
    problemId: problem.id,
    attempts: MAX_ATTEMPTS,
    judgeResult: {
      status: finalStatus,
      passed: finalPassed,
      total: finalTotal,
      message: finalMessage,
      failedTest: pickFailedTest(lastJudgeResult, baseTestCases)
    },
    warning: `已自动发布但标程验证未通过（${finalStatus}），请人工复核`
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { problems, logId, modelId } = body as {
      problems: GeneratedProblem[]
      logId?: string
      modelId?: string
    }

    if (!problems || !Array.isArray(problems) || problems.length === 0) {
      return NextResponse.json(
        { success: false, error: 'problems 字段必须是非空数组' },
        { status: 400 }
      )
    }

    const results: SaveAndVerifyResult[] = []
    for (const p of problems) {
      try {
        const r = await verifyOne(user, p, logId, modelId)
        results.push(r)
      } catch (e: any) {
        logger.error('[save-and-verify] 单题处理失败', {
          logId,
          title: p?.title,
          error: e?.message
        })
        results.push({
          success: false,
          attempts: 0,
          error: e?.message || '处理失败'
        })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    logger.error('[save-and-verify] 顶层异常', { error: error?.message })
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
