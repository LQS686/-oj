import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notification/service'
import { compileCode, cleanup } from '@/lib/judge/compiler'
import { executeCode } from '@/lib/judge/executor'
import { scoreTestdataStrength } from '../../quality-check'
import { calculateAndStoreCost } from '../utils'
import type { JobExecutionContext } from './types'

/**
 * 标程执行验证（公共预处理）
 *
 * 仅当 mode === 'test_data' 且提供了 solutionCode/solutionLanguage 时执行：
 *   1. 编译标程
 *   2. 用标程跑每个 AI 生成的输入，得到真实 output，覆盖 AI 的 output
 *   3. 仅保留成功跑通的测试点（带 _stats）
 *   4. 更新 ctx.stats 与 ctx.testCases
 *
 * 原始来源：lib/ai/queue.ts `_executeJobInner` 中的 SHARED Solution Execution 块（618-704 行）。
 */
async function runSolutionValidation(ctx: JobExecutionContext): Promise<void> {
  const { job } = ctx
  // 捕获到局部变量以便 TS 在下方守卫后进行类型收窄
  const testCases = ctx.testCases
  if (!(
    job.data.params.mode === 'test_data' &&
    testCases &&
    job.data.params.solutionCode &&
    job.data.params.solutionLanguage
  )) {
    return
  }

  logger.info('Detected Solution Code, running to generate outputs...')
  const { solutionCode, solutionLanguage } = job.data.params
  const stats = ctx.stats

  // 解析题目实际 timeLimit / memoryLimit，保证"标程能跑出 output" 与"用户提交标程能 AC"使用同一资源约束，
  // 避免标程在 2000ms 内跑出 output 但用户提交时因题目实际 timeLimit=1000ms 而 TLE。
  // 优先级：job.data.params 显式传入 > targetProblemId 查库 > 默认 1000ms / 128MB（与 judger 默认对齐）
  let problemTimeLimit: number | undefined
  let problemMemoryLimit: number | undefined
  if (typeof job.data.params.timeLimit === 'number') {
    problemTimeLimit = job.data.params.timeLimit
  }
  if (typeof job.data.params.memoryLimit === 'number') {
    problemMemoryLimit = job.data.params.memoryLimit
  }
  if (
    (problemTimeLimit === undefined || problemMemoryLimit === undefined) &&
    job.data.params.targetProblemId
  ) {
    try {
      const targetProblem = await prisma.problem.findUnique({
        where: { id: job.data.params.targetProblemId },
        select: { timeLimit: true, memoryLimit: true }
      })
      if (targetProblem) {
        if (problemTimeLimit === undefined && typeof targetProblem.timeLimit === 'number') {
          problemTimeLimit = targetProblem.timeLimit
        }
        if (problemMemoryLimit === undefined && typeof targetProblem.memoryLimit === 'number') {
          problemMemoryLimit = targetProblem.memoryLimit
        }
      }
    } catch (e) {
      logger.warn('Failed to load target problem limits, falling back to defaults', e)
    }
  }
  const effectiveTimeLimit = problemTimeLimit ?? 1000
  const effectiveMemoryLimit = problemMemoryLimit ?? 128

  // 1. Compile Solution
  const compileResult = await compileCode(solutionCode, solutionLanguage)
  if (!compileResult.success) {
    throw new Error(`Solution Compilation Failed: ${compileResult.error || compileResult.stderr}`)
  }

  const validTestCasesWithStats: any[] = []

  try {
    // 2. Run Solution against each AI generated input
    let totalTime = 0
    let totalMemory = 0

    stats.total = testCases.length

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i]
      // Ensure input is a string
      const input = typeof tc.input === 'string' ? tc.input : String(tc.input)

      logger.info(`Running solution for test case #${i + 1}`)
      try {
        const result = await executeCode({
          code: solutionCode,
          language: solutionLanguage,
          input: input,
          timeLimit: effectiveTimeLimit,
          memoryLimit: effectiveMemoryLimit,
          compiledPath: compileResult.compiledPath
        })

        // 项目约束：任何测试点执行失败（TLE/RE/非零退出码/异常）必须将整个生成任务标记为 FAILED，
        // 不允许部分测试点入库导致用户提交被误判为 WA。错误消息包含输入数据前 100 字符以便诊断。
        const inputPrefix = input.slice(0, 100)
        if (result.timeout) {
          throw new Error(`Solution TLE on generated input #${i + 1} (input[:100]=${JSON.stringify(inputPrefix)})`)
        }
        if (result.runtimeError) {
          throw new Error(`Solution Runtime Error on generated input #${i + 1}: ${result.error} (input[:100]=${JSON.stringify(inputPrefix)})`)
        }
        if (result.exitCode !== 0) {
          throw new Error(`Solution Non-zero Exit Code on generated input #${i + 1}: exitCode=${result.exitCode} (input[:100]=${JSON.stringify(inputPrefix)})`)
        }

        // Success
        stats.passed++
        totalTime += result.time
        totalMemory += result.memory

        // Overwrite the AI output with the actual calculated output
        // Trim whitespace to ensure clean comparison
        tc.output = result.output.trim()

        // Store valid case with run stats
        validTestCasesWithStats.push({
          ...tc,
          _stats: { time: result.time, memory: result.memory }
        })

      } catch (execErr) {
        // executeCode 异常或其他未捕获错误：按项目约束整体标记 FAILED
        if (execErr instanceof Error && execErr.message.startsWith('Solution ')) {
          throw execErr
        }
        const inputPrefix = input.slice(0, 100)
        throw new Error(`Solution Execution Error on case #${i + 1}: ${execErr instanceof Error ? execErr.message : String(execErr)} (input[:100]=${JSON.stringify(inputPrefix)})`)
      }
    }

    if (stats.passed > 0) {
      stats.avgTime = Math.round(totalTime / stats.passed)
      stats.avgMemory = Math.round(totalMemory / stats.passed)
    }

  } finally {
    // 3. Cleanup compiled files
    await cleanup(compileResult.compiledPath)
  }

  // Replace original testCases with only valid ones
  ctx.testCases = validTestCasesWithStats

  if (ctx.testCases.length === 0) {
    throw new Error(`All ${stats.total} generated test cases failed validation against the solution code. Please check your solution or retry.`)
  }
}

/**
 * Mode: TEST_DATA_GEN with targetProblemId (full replace)
 *
 * 原始来源：lib/ai/queue.ts `_executeJobInner` 的 test_data + targetProblemId 分支（707-819 行）。
 */
async function doTestDataWithTarget(ctx: JobExecutionContext): Promise<void> {
  const { job } = ctx
  // 由调用方 handleTestData 保证 ctx.testCases 此时为真值
  const testCases = ctx.testCases!
  const stats = ctx.stats
  const thought = ctx.thought
  const tokensUsed = ctx.tokensUsed
  const problemId = job.data.params.targetProblemId!

  try {
    // Check if problem exists
    const targetProblem = await prisma.problem.findUnique({
      where: { id: problemId },
      include: { testCases: true }
    })

    if (!targetProblem) {
      throw new Error(`Target problem not found: ${problemId}`)
    }

    // Combine existing and new cases
    const existingCases = targetProblem.testCases.map((tc: any) => ({
      input: tc.input,
      output: tc.output,
      isSample: tc.isSample,
    }))

    const newCasesFormatted = testCases.map(tc => ({
      input: tc.input !== undefined ? String(tc.input) : '',
      output: tc.output !== undefined ? String(tc.output) : '',
      isSample: false,
    }))

    const allCases = [...existingCases, ...newCasesFormatted]

    // Distribute scores
    const totalCases = allCases.length
    const baseScore = Math.floor(100 / totalCases)
    const remainder = 100 % totalCases

    const finalCases = allCases.map((tc, idx) => ({
      problemId,
      input: tc.input,
      output: tc.output,
      isSample: tc.isSample,
      score: baseScore + (idx < remainder ? 1 : 0),
      orderIndex: idx
    }))

    // Phase 6 Task 34.2: 测试数据强度评分（基于最终全量测试点）
    const strengthScore = scoreTestdataStrength(allCases)

    // 超时保护：若 executeJob 已因超时把日志标 FAILED，则跳过后续写库，避免覆盖状态
    if (job.aborted) return

    // Transactional update
    await prisma.$transaction(async (tx: any) => {
      // Delete old cases
      await tx.testCase.deleteMany({
        where: { problemId }
      })

      if (finalCases.length > 0) {
        await tx.testCase.createMany({
          data: finalCases
        })
      }

      // Update Problem Status
      await tx.problem.update({
        where: { id: problemId },
        data: {
          aiStatus: 'AI_ASSISTED',
          stdCode: job.data.params.solutionCode,
          stdLang: job.data.params.solutionLanguage
        } as any
      })

      // Update Log
      await tx.aiGenerationLog.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          result: {
            testCases: newCasesFormatted, // Return only new cases in result for log visibility
            thought,
            stats: stats.total > 0 ? stats : undefined,
            strengthScore, // Phase 6 Task 34.2
          } as any,
          tokensUsed: tokensUsed || 0
        }
      })
    })

    // Phase 6 Task 35.1: 计算并存储预估成本
    calculateAndStoreCost(job.id, tokensUsed || 0, job.data.params.modelId).catch(() => {})

    // Notify User with detailed report
    const report = stats.total > 0
      ? `\n生成统计: 总数 ${stats.total}, 通过 ${stats.passed}, 失败 ${stats.failed}, 平均耗时 ${stats.avgTime}ms`
      : '';

    await createNotification({
      userId: job.data.userId,
      type: 'system',
      title: 'AI 测试数据生成完成',
      content: `题目 "${targetProblem.title}" 的 ${newCasesFormatted.length} 组测试数据已生成并自动入库。` +
               (job.data.params.solutionCode ? ` (基于标程验证)${report}` : ''),
      link: `/admin/problems/${problemId}/testcases`
    })

    job.status = 'completed'
    return

  } catch (error: any) {
    logger.error('Test Data Auto-Save Error', error)
    throw error
  }
}

/**
 * Mode: TEST_DATA_INCREMENTAL with targetProblemId (Task 33.4, 追加不 deleteMany)
 *
 * 原始来源：lib/ai/queue.ts `_executeJobInner` 的 test_data_incremental + targetProblemId 分支（822-935 行）。
 */
async function doTestDataIncrementalWithTarget(ctx: JobExecutionContext): Promise<void> {
  const { job } = ctx
  // 由调用方 handleTestDataIncremental 保证 ctx.testCases 此时为真值
  const testCases = ctx.testCases!
  const stats = ctx.stats
  const thought = ctx.thought
  const tokensUsed = ctx.tokensUsed
  const problemId = job.data.params.targetProblemId!

  try {
    const targetProblem = await prisma.problem.findUnique({
      where: { id: problemId },
      include: { testCases: { orderBy: { orderIndex: 'asc' } } }
    })

    if (!targetProblem) {
      throw new Error(`Target problem not found: ${problemId}`)
    }

    const existingCount = targetProblem.testCases.length
    const newCasesFormatted = testCases.map(tc => ({
      input: tc.input !== undefined ? String(tc.input) : '',
      output: tc.output !== undefined ? String(tc.output) : '',
      isSample: false,
    }))

    // 全量测试点（existing + new）用于强度评分 + 分数重分配
    const existingCasesForScoring = targetProblem.testCases.map((tc: any) => ({
      input: tc.input,
      output: tc.output,
      isSample: tc.isSample,
    }))
    const allCases = [...existingCasesForScoring, ...newCasesFormatted]

    // 分数重分配（全量）
    const totalCases = allCases.length
    const baseScore = Math.floor(100 / totalCases)
    const remainder = 100 % totalCases

    // Phase 6 Task 34.2: 测试数据强度评分
    const strengthScore = scoreTestdataStrength(allCases)

    if (job.aborted) return

    // 增量写入：保留现有 testCase ID，仅追加新测试点 + 重分配分数
    await prisma.$transaction(async (tx: any) => {
      // 1. 追加新测试点（不 deleteMany，保留现有 ID）
      const newCasesData = newCasesFormatted.map((tc, idx) => ({
        problemId,
        input: tc.input,
        output: tc.output,
        isSample: tc.isSample,
        score: 0, // 临时 0 分，下一步统一重分配
        orderIndex: existingCount + idx,
      }))

      if (newCasesData.length > 0) {
        await tx.testCase.createMany({ data: newCasesData })
      }

      // 2. 重分配分数：读取全量测试点并逐个更新 score / orderIndex
      const allTestCases = await tx.testCase.findMany({
        where: { problemId },
        orderBy: { orderIndex: 'asc' },
      })
      for (let i = 0; i < allTestCases.length; i++) {
        const score = baseScore + (i < remainder ? 1 : 0)
        if (allTestCases[i].score !== score || allTestCases[i].orderIndex !== i) {
          await tx.testCase.update({
            where: { id: allTestCases[i].id },
            data: { score, orderIndex: i },
          })
        }
      }

      // 3. Update Problem Status
      await tx.problem.update({
        where: { id: problemId },
        data: {
          aiStatus: 'AI_ASSISTED',
          stdCode: job.data.params.solutionCode,
          stdLang: job.data.params.solutionLanguage,
        } as any,
      })

      // 4. Update Log
      await tx.aiGenerationLog.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          result: {
            testCases: newCasesFormatted,
            thought,
            stats: stats.total > 0 ? stats : undefined,
            strengthScore,
            mode: 'incremental', // 标记增量模式
          } as any,
          tokensUsed: tokensUsed || 0,
        },
      })
    })

    // Phase 6 Task 35.1: 计算并存储预估成本
    calculateAndStoreCost(job.id, tokensUsed || 0, job.data.params.modelId).catch(() => {})

    await createNotification({
      userId: job.data.userId,
      type: 'system',
      title: 'AI 测试数据增量补充完成',
      content: `题目 "${targetProblem.title}" 已追加 ${newCasesFormatted.length} 组测试数据（保留原有 ${existingCount} 组）。`,
      link: `/admin/problems/${problemId}/testcases`,
    })

    job.status = 'completed'
    return
  } catch (error: any) {
    logger.error('Test Data Incremental Auto-Save Error', error)
    throw error
  }
}

/**
 * Mode: TEST_DATA — 测试数据生成
 *
 * 流程：
 *   1. runSolutionValidation（若提供标程则执行验证并替换 ctx.testCases / ctx.stats）
 *   2. 若有 targetProblemId → 全量替换入库（doTestDataWithTarget）
 *   3. 否则 → 走 manual fallback（仅写日志，不入库题目）
 *
 * 原始来源：lib/ai/queue.ts `_executeJobInner` 中 test_data mode 的处理（618-819 行 + 1235-1258 行兜底）。
 */
export async function handleTestData(ctx: JobExecutionContext): Promise<void> {
  await runSolutionValidation(ctx)
  if (ctx.job.data.params.targetProblemId && ctx.testCases) {
    await doTestDataWithTarget(ctx)
    return
  }
  await handleTestDataManualFallback(ctx)
}

/**
 * Mode: TEST_DATA_INCREMENTAL — 测试数据增量补充
 *
 * 流程：
 *   1. 若有 targetProblemId → 追加新测试点 + 全量分数重分配（doTestDataIncrementalWithTarget）
 *   2. 否则 → 走 manual fallback
 *
 * 原始来源：lib/ai/queue.ts `_executeJobInner` 中 test_data_incremental mode 的处理（822-935 行 + 1235-1258 行兜底）。
 */
export async function handleTestDataIncremental(ctx: JobExecutionContext): Promise<void> {
  if (ctx.job.data.params.targetProblemId && ctx.testCases) {
    await doTestDataIncrementalWithTarget(ctx)
    return
  }
  await handleTestDataManualFallback(ctx)
}

/**
 * Fallback: test_data / test_data_incremental without targetProblemId (manual generation)
 *
 * 也覆盖其他未匹配 mode 的兜底场景（由 dispatchByMode 的 default 分支调用）。
 * 注：剥离 _stats 字段，避免内部执行的统计信息污染 log.result
 *
 * 原始来源：lib/ai/queue.ts `_executeJobInner` 末尾兜底块（1235-1258 行）。
 */
export async function handleTestDataManualFallback(ctx: JobExecutionContext): Promise<void> {
  const { job } = ctx
  const testCases = ctx.testCases || []
  const thought = ctx.thought
  const tokensUsed = ctx.tokensUsed

  const cleanTestCases = (testCases).map(({ input, output }: any) => ({
    input: input !== undefined ? String(input) : '',
    output: output !== undefined ? String(output) : ''
  }))
  // Phase 6 Task 34.2: 测试数据强度评分（manual 模式也评分）
  const manualStrengthScore = scoreTestdataStrength(cleanTestCases)
  // 超时保护：跳过 COMPLETED 写库，避免覆盖已被 catch 标记的 FAILED 状态
  if (job.aborted) return
  await prisma.aiGenerationLog.update({
    where: { id: job.id },
    data: {
      status: 'COMPLETED',
      result: { testCases: cleanTestCases, thought, strengthScore: manualStrengthScore } as any,
      tokensUsed: tokensUsed || 0
    }
  })

  // Phase 6 Task 35.1: 计算并存储预估成本
  calculateAndStoreCost(job.id, tokensUsed || 0, job.data.params.modelId).catch(() => {})

  job.status = 'completed'
}
