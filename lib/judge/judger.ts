// 评测执行编排器
// 参考 Project LemonLime 的 TaskJudger，协调 compiler/executor/comparator
import type { JudgeJob, JudgeResult } from './queue'
import { compileCode } from './compiler'
import { executeCode, cleanupExecuteArtifacts } from './executor'
import { compareOutput } from './comparator'
import { validateCodeSafety } from './codeAnalyzer'
import { COMPILE_STATE_MESSAGES } from './types'
import type { ResultState } from './types'
import { join } from 'path'
import { logger } from '@/lib/logger'
import { emitJudgeProgress } from '@/lib/websocket/server'
import { SubmissionStatus } from '@/lib/constants/submission-status'
import { materializeTestCaseToDisk, cleanupMaterializedTestCase } from './testcase-loader'
import { computeExtraTime } from './process-stats'
import {
  mapPool,
  resolveCaseConcurrency,
  resolveLargeCaseConcurrency,
  resolveLargeCaseBytes,
  resolveFailFastMode,
  shouldFailFast,
} from './pool'
import {
  compileSpj,
  cleanupSpj,
  runSpj,
  ensureUserOutputFile,
  isSpecialJudgeMode,
} from './spj'

// 评测进度 DB 持久化节流：评测中定期把已完成测点数写入 Submission.passedTests，
// 使刷新页面/轮询兜底能读到真实进度（而非恒为 0）。
// 仅从非终态写入，终态写入（worker completed）不受影响。
const progressDbThrottle = new Map<string, number>()
const PROGRESS_DB_THROTTLE_MS = 500

function persistJudgeProgressThrottled(
  submissionId: string,
  passedTests: number,
  totalTests: number
): void {
  const now = Date.now()
  const last = progressDbThrottle.get(submissionId) ?? 0
  if (now - last < PROGRESS_DB_THROTTLE_MS && passedTests < totalTests) return
  progressDbThrottle.set(submissionId, now)
  if (passedTests >= totalTests && totalTests > 0) {
    progressDbThrottle.delete(submissionId) // 终态后不再需要节流状态
  }
  void import('@/lib/mongodb-direct').then(({ updateSubmissionDirect }) =>
    updateSubmissionDirect(
      submissionId,
      { passedTests, totalTests },
      {
        onlyFromStatuses: [
          SubmissionStatus.PENDING,
          SubmissionStatus.JUDGING,
          SubmissionStatus.RUNNING,
        ],
      }
    )
  ).catch((err) => {
    logger.warn('持久化评测进度失败', {
      submissionId,
      error: err instanceof Error ? err.message : String(err),
    })
  })
}

type CaseVerdict = {
  testId: string
  status: ResultState
  score: number
  time: number
  memory: number
  message?: string
  /** fail-fast 跳过：不参与最终状态判定 */
  skipped?: boolean
}

/**
 * 多段错误信息合并：参考 HOJ JudgeStrategy.mergeNonEmptyStrings。
 * 每段先 trim + 截断到 maxLenPerSegment，再过滤空串，最后用 sep 连接。
 * 避免单段过长遮蔽其他段信息（如编译 stderr 过长掩盖编译状态标签）。
 */
function mergeNonEmptyStrings(parts: Array<string | undefined | null>, sep = '\n', maxLenPerSegment = 2000): string {
  const valid = parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .map((p) => (p.length > maxLenPerSegment ? p.slice(0, maxLenPerSegment) : p))
    .filter((p) => p.length > 0)
  return valid.join(sep)
}

/**
 * 格式化运行时错误消息，识别 UBSanitizer 输出并给出可读诊断。
 *
 * UBSanitizer（-fsanitize=undefined）在运行时检测到未定义行为时，向 stderr 输出：
 *   "runtime error: <UB 类型描述>"
 *
 * 常见 UB 类型（gcc 文档：https://gcc.gnu.org/onlinedocs/gcc/Instrumentation-Options.html）：
 *   - "signed integer overflow"：有符号整数溢出（如 INT_MAX + 1）
 *   - "division by zero"：除零
 *   - "null pointer dereference"：空指针解引用
 *   - "load of value ... which is not a valid value for type 'int'"
 *     ：读取未初始化变量（藏数据题常见场景，如 int a; cout << a;）
 *   - "index ... out of bounds"：数组越界
 *   - "misaligned address"：内存对齐非法
 *
 * 当 UBSan 输出存在时，优先展示 UBSan 诊断（最直接的可读信息），
 * 否则回退到 executor 提供的信号映射消息（如 SIGSEGV/段错误）。
 *
 * 项目约束：错误消息中 stderr 截断到 2000 字符（项目硬约束）
 */
function formatRuntimeErrorMessage(executorError: string | undefined, programOutput: string): string {
  // 合并 executor 错误与程序输出（UBSan 可能输出到 stdout 而非 stderr）
  const combined = [executorError, programOutput].filter(Boolean).join('\n')
  if (!combined) return '运行时错误'

  // 提取所有 "runtime error: ..." 行（UBSan 输出）
  const ubSanPattern = /runtime error: (.+)/g
  const ubMatches: string[] = []
  let match: RegExpExecArray | null
  while ((match = ubSanPattern.exec(combined)) !== null) {
    ubMatches.push(match[1].trim())
  }

  if (ubMatches.length > 0) {
    // 取第一条 UBSan 诊断作为主消息（避免多条 UB 重复展示）
    const firstUb = ubMatches[0]
    // 将 UBSan 原始文本映射为中文可读描述
    const readable = mapUbSanToReadable(firstUb)
    // 截断到 2000 字符（项目硬约束）
    const truncated = readable.length > 2000 ? readable.slice(0, 2000) + '\n[已截断]' : readable
    return `运行时错误（UBSanitizer 检测到未定义行为）: ${truncated}`
  }

  // 无 UBSan 输出：回退到 executor 提供的消息（已包含信号映射）
  return executorError || '运行时错误'
}

/**
 * 将 UBSanitizer 的英文 UB 描述映射为中文可读文本。
 * 仅处理常见 UB 类型，未匹配的返回原文。
 */
function mapUbSanToReadable(ubMessage: string): string {
  const msg = ubMessage.toLowerCase()
  if (msg.includes('signed integer overflow')) {
    return `有符号整数溢出（${ubMessage}）`
  }
  if (msg.includes('division by zero')) {
    return `除零错误（${ubMessage}）`
  }
  if (msg.includes('null pointer') || msg.includes('null pointer dereference')) {
    return `空指针解引用（${ubMessage}）`
  }
  if (msg.includes('load of value') && msg.includes('not a valid value')) {
    // 藏数据题典型场景：int a; cout << a; 读取未初始化变量
    return `读取了未初始化的变量（${ubMessage}）`
  }
  if (msg.includes('out of bounds') || msg.includes('index')) {
    return `数组越界访问（${ubMessage}）`
  }
  if (msg.includes('misaligned')) {
    return `内存对齐非法（${ubMessage}）`
  }
  if (msg.includes('shift')) {
    return `移位操作非法（${ubMessage}）`
  }
  // 未匹配的 UB 类型，原样返回
  return ubMessage
}

// 单测点执行+比较（单次运行，不含重测）
async function runOnce(
  testCase: JudgeJob['testCases'][number],
  job: JudgeJob,
  compiledPath: string,
  tcTimeLimit: number,
  tcMemoryLimit: number,
  files: { inputPath: string; expectedPath: string; expectedBytes: number },
  signal?: AbortSignal,
  spjPath?: string | null,
): Promise<{ status: ResultState; score: number; time: number; memory: number; message: string; outputCorrect: boolean; exceedsTimeLimit: boolean; aborted?: boolean }> {
  if (signal?.aborted) {
    return {
      status: 'SE',
      score: 0,
      time: 0,
      memory: 0,
      message: typeof signal.reason === 'string' && signal.reason !== 'fail-fast'
        ? (signal.reason === 'job-aborted' ? '评测已中止' : signal.reason)
        : '已跳过（前面测点已失败）',
      outputCorrect: false,
      exceedsTimeLimit: false,
      aborted: true,
    }
  }

  const executeResult = await executeCode({
    code: job.code,
    language: job.language,
    inputPath: files.inputPath,
    timeLimit: tcTimeLimit,
    memoryLimit: tcMemoryLimit,
    compiledPath,
    extraTimeRatio: job.extraTimeRatio ?? 0,
    expectedOutputBytes: files.expectedBytes,
    signal,
  })

  try {
    if (executeResult.aborted || signal?.aborted) {
      return {
        status: 'SE',
        score: 0,
        time: 0,
        memory: 0,
        message: typeof signal?.reason === 'string' && signal.reason !== 'fail-fast'
          ? (signal.reason === 'job-aborted' ? '评测已中止' : signal.reason)
          : '已跳过（前面测点已失败）',
        outputCorrect: false,
        exceedsTimeLimit: false,
        aborted: true,
      }
    }
    // 细粒度状态判定
    if (executeResult.cannotStart) {
      return { status: 'CSP', score: 0, time: executeResult.time, memory: executeResult.memory, message: executeResult.error || '无法启动程序', outputCorrect: false, exceedsTimeLimit: false }
    }
    if (executeResult.timeout) {
      const tleMsg = executeResult.error || '超出时间限制'
      return { status: 'TLE', score: 0, time: executeResult.time, memory: executeResult.memory, message: tleMsg, outputCorrect: false, exceedsTimeLimit: false }
    }
    if (executeResult.outputLimitExceeded) {
      return { status: 'OLE', score: 0, time: executeResult.time, memory: executeResult.memory, message: executeResult.error || '超出输出限制', outputCorrect: false, exceedsTimeLimit: false }
    }
    if (executeResult.memoryExceeded) {
      return { status: 'MLE', score: 0, time: executeResult.time, memory: executeResult.memory, message: executeResult.error || '超出内存限制', outputCorrect: false, exceedsTimeLimit: false }
    }
    if (executeResult.runtimeError) {
      const reMsg = formatRuntimeErrorMessage(executeResult.error, executeResult.output)
      return { status: 'RE', score: 0, time: executeResult.time, memory: executeResult.memory, message: reMsg, outputCorrect: false, exceedsTimeLimit: false }
    }

    // 文件对文件流式比对 / Special Judge
    // 先让出事件循环，避免同步比对堵住其它并行测点的 child exit / 调度
    await new Promise<void>((r) => setImmediate(r))

    let compareResult
    let ephemeralUserOut: string | null = null
    try {
      if (isSpecialJudgeMode(job.comparisonMode) && spjPath) {
        const outFile = await ensureUserOutputFile(
          executeResult.artifacts?.outputPath,
          executeResult.artifacts?.outputPath ? undefined : executeResult.output,
          join(process.cwd(), 'temp', 'judge'),
        )
        if (outFile.ephemeral) ephemeralUserOut = outFile.path
        compareResult = await runSpj({
          checkerPath: spjPath,
          inputPath: files.inputPath,
          userOutputPath: outFile.path,
          answerPath: files.expectedPath,
          fullScore: testCase.score,
          signal,
        })
      } else {
        compareResult = await compareOutput({
          userOutputPath: executeResult.artifacts?.outputPath,
          userOutput: executeResult.artifacts?.outputPath ? undefined : executeResult.output,
          expectedOutputPath: files.expectedPath,
          fullScore: testCase.score,
          comparisonMode: job.comparisonMode ?? 'default',
          realPrecision: job.realPrecision ?? 3,
        })
      }
    } finally {
      if (ephemeralUserOut) {
        try {
          const { unlink } = await import('fs/promises')
          const { existsSync } = await import('fs')
          if (existsSync(ephemeralUserOut)) await unlink(ephemeralUserOut)
        } catch {
          /* ignore */
        }
      }
    }

    const outputCorrect = compareResult.score > 0

    if (executeResult.exceedsTimeLimit) {
      return { status: 'TLE', score: 0, time: executeResult.time, memory: executeResult.memory, message: '超出时间限制', outputCorrect, exceedsTimeLimit: true }
    }

    return {
      status: compareResult.status,
      score: compareResult.score,
      time: executeResult.time,
      memory: executeResult.memory,
      message: compareResult.message,
      outputCorrect,
      exceedsTimeLimit: false,
    }
  } finally {
    await cleanupExecuteArtifacts(executeResult.artifacts)
  }
}

/** 单个测点：已落盘 → 运行（含临界重测）→ 清理 */
async function judgeOneCaseWithFiles(
  testCase: JudgeJob['testCases'][number],
  job: JudgeJob,
  compiledPath: string,
  files: NonNullable<Awaited<ReturnType<typeof materializeTestCaseToDisk>>>,
  signal?: AbortSignal,
  spjPath?: string | null,
): Promise<CaseVerdict> {
  try {
    const tcTimeLimit = testCase.timeLimit ?? job.timeLimit
    const tcMemoryLimit = testCase.memoryLimit ?? job.memoryLimit

    let verdict = await runOnce(
      testCase,
      job,
      compiledPath,
      tcTimeLimit,
      tcMemoryLimit,
      files,
      signal,
      spjPath,
    )

    if (verdict.aborted) {
      return {
        testId: testCase.id,
        status: 'SE',
        score: 0,
        time: 0,
        memory: 0,
        message: verdict.message,
        skipped: true,
      }
    }

    const extraRatio = job.extraTimeRatio ?? 0
    const extraMs = computeExtraTime(tcTimeLimit, extraRatio)
    const maxRejudge = job.rejudgeTimes ?? 1
    for (let r = 0; r < maxRejudge; r++) {
      if (verdict.status !== 'TLE' || !verdict.exceedsTimeLimit || !verdict.outputCorrect) break
      if (signal?.aborted) break
      verdict = await runOnce(
        testCase,
        job,
        compiledPath,
        tcTimeLimit,
        tcMemoryLimit,
        files,
        signal,
        spjPath,
      )
      if (verdict.aborted) {
        return {
          testId: testCase.id,
          status: 'SE',
          score: 0,
          time: 0,
          memory: 0,
          message: verdict.message,
          skipped: true,
        }
      }
      if (verdict.status === 'AC') break
    }

    if (
      verdict.status === 'TLE' &&
      verdict.exceedsTimeLimit &&
      verdict.outputCorrect &&
      verdict.time <= tcTimeLimit + extraMs
    ) {
      logger.info('临界 TLE 浮动通过', {
        time: verdict.time,
        timeLimit: tcTimeLimit,
        extraMs,
        testId: testCase.id,
      })
      verdict = {
        ...verdict,
        status: 'AC',
        score: testCase.score,
        message: '',
        exceedsTimeLimit: false,
      }
    }

    return {
      testId: testCase.id,
      status: verdict.status,
      // 保留 SPJ 部分分；AC 用满分，其余用 compare/SPJ 给出的 score
      score:
        verdict.status === 'AC'
          ? testCase.score
          : verdict.status === 'PC'
            ? verdict.score
            : Math.max(0, verdict.score),
      time: verdict.time,
      memory: verdict.memory,
      message: verdict.message,
    }
  } finally {
    await cleanupMaterializedTestCase(files)
  }
}

// 执行评测
export async function executeJudge(
  job: JudgeJob,
  options?: { signal?: AbortSignal },
): Promise<JudgeResult> {
  // B-P2-12：评测开始即清理上一次残留的节流条目（幂等），
  // 覆盖「上轮 fail-fast / 异常 / 中止」未能走到删除分支的泄漏场景
  progressDbThrottle.delete(job.submissionId)
  const startTime = Date.now()
  const jobSignal = options?.signal
  /** 编译结束时间点（编译 + SPJ 编译之后、测点执行之前），用于拆分评测耗时 */
  let compileEndMs = startTime
  /** 测点执行开始时间点（首个测点落盘前），用于拆分评测耗时 */
  let casesStartMs = startTime

  const cfgConcurrency = resolveCaseConcurrency()
  const cfgLargeConcurrency = resolveLargeCaseConcurrency()
  const cfgLargeBytes = resolveLargeCaseBytes()
  const failFastMode = resolveFailFastMode()

  logger.info(`开始评测提交`, {
    submissionId: job.submissionId,
    language: job.language,
    problemId: job.problemId,
    caseConcurrency: cfgConcurrency,
    totalTests: job.testCases.length,
  })

  const result: JudgeResult = {
    submissionId: job.submissionId,
    status: 'JUDGING',
    score: 0,
    time: 0,
    memory: 0,
    passedTests: 0,
    totalTests: job.testCases.length,
    testResults: [],
  }

  if (jobSignal?.aborted) {
    return {
      ...result,
      status: 'SE',
      message: abortReasonMessage(jobSignal.reason, '评测已中止'),
      judgedAt: new Date(),
    }
  }

  let compileResult: Awaited<ReturnType<typeof compileCode>> | undefined
  let spjCompileResult: Awaited<ReturnType<typeof compileSpj>> | undefined

  try {
    // 第一步: 代码安全分析
    logger.debug(`分析代码安全性`)
    const codeAnalysisResult = validateCodeSafety(job.code, job.language)

    if (!codeAnalysisResult.safe) {
      logger.warn(`代码检测到安全问题`)
      return {
        ...result,
        status: 'SE',
        message: codeAnalysisResult.errors[0] || '代码检测到安全问题',
        judgedAt: new Date(),
      }
    }

    // 第二步: 编译选手程序
    logger.debug(`编译代码`)
    compileResult = await compileCode(job.code, job.language)

    if (!compileResult.success) {
      logger.warn(`编译失败`, { compileState: compileResult.compileState, stderr: compileResult.stderr })
      const compileState = compileResult.compileState
      const stateLabel = COMPILE_STATE_MESSAGES[compileState] || ''
      const detail = compileResult.error || '编译错误'
      // 项目约束：编译 stderr 必须截断到 2000 字符以防止日志溢出
      // 使用 mergeNonEmptyStrings 统一分段截断，避免单段过长遮蔽状态标签
      const message = stateLabel
        ? mergeNonEmptyStrings([`${stateLabel}: ${detail}`, compileResult.stderr])
        : mergeNonEmptyStrings([detail, compileResult.stderr])
      return {
        ...result,
        status: 'CE',
        message,
        judgedAt: new Date(),
      }
    }

    // 2.5: Special Judge 编译（整单一次）
    if (isSpecialJudgeMode(job.comparisonMode)) {
      if (!job.spjCode?.trim()) {
        return {
          ...result,
          status: 'SE',
          message: '题目配置为 Special Judge，但缺少 checker 代码',
          judgedAt: new Date(),
        }
      }
      logger.debug('编译 Special Judge')
      spjCompileResult = await compileSpj(job.spjCode)
      if (!spjCompileResult.success) {
        logger.warn('SPJ 编译失败', {
          compileState: spjCompileResult.compileState,
          stderr: spjCompileResult.stderr,
        })
        return {
          ...result,
          status: 'SE',
          message: mergeNonEmptyStrings([
            spjCompileResult.error || 'Special Judge 编译失败',
            spjCompileResult.stderr,
          ]),
          judgedAt: new Date(),
        }
      }
    }

    if (jobSignal?.aborted) {
      return {
        ...result,
        status: 'SE',
        message: abortReasonMessage(jobSignal.reason, '评测已中止'),
        judgedAt: new Date(),
      }
    }

    logger.debug(`编译成功`)

    // 编译（含 SPJ）结束，记录时间点；后续为测点执行阶段
    compileEndMs = Date.now()
    casesStartMs = compileEndMs

    // 第三步: 统一并发队列；落盘后若体积大则再受「大测点槽位」限制（规则对所有题相同，无预热）
    const compiledPath = compileResult.compiledPath!
    const spjPath = spjCompileResult?.compiledPath ?? null
    let finishedCount = 0
    let largeInFlight = 0
    const largeWaiters: Array<() => void> = []

    const acquireLargeSlot = async () => {
      if (largeInFlight < cfgLargeConcurrency) {
        largeInFlight++
        return
      }
      await new Promise<void>((resolve) => {
        largeWaiters.push(() => {
          largeInFlight++
          resolve()
        })
      })
    }
    const releaseLargeSlot = () => {
      largeInFlight = Math.max(0, largeInFlight - 1)
      const next = largeWaiters.shift()
      if (next) next()
    }

    logger.info('测点调度', {
      total: job.testCases.length,
      concurrency: cfgConcurrency,
      largeCaseConcurrency: cfgLargeConcurrency,
      largeCaseBytes: cfgLargeBytes,
      failFast: failFastMode,
    })

    // 初始进度（0/N）已由 worker active 处理器推送，这里不再重复推送

    // 始终持有 AbortController：fail-fast 与整单超时（queue signal）均可中止在跑进程
    const abortController = new AbortController()
    const onJobAbort = () => {
      if (!abortController.signal.aborted) {
        abortController.abort(jobSignal?.reason ?? 'job-aborted')
      }
    }
    if (jobSignal) {
      if (jobSignal.aborted) onJobAbort()
      else jobSignal.addEventListener('abort', onJobAbort, { once: true })
    }
    const caseSignal = abortController.signal

    const skippedMessage = () =>
      abortReasonMessage(
        caseSignal.reason,
        failFastMode === 'off' ? '评测已中止' : '已跳过（前面测点已失败）',
      )

    try {
      const caseVerdicts = await mapPool(
        job.testCases,
        cfgConcurrency,
        async (testCase, index) => {
          logger.debug(`测试用例`, { index: index + 1, total: job.testCases.length })

          if (caseSignal.aborted) {
            finishedCount++
            emitJudgeProgress(job.userId, {
              submissionId: job.submissionId,
              currentTest: finishedCount,
              totalTests: job.testCases.length,
              status: 'JUDGING',
            })
            persistJudgeProgressThrottled(job.submissionId, finishedCount, job.testCases.length)
            return {
              testId: testCase.id,
              status: 'SE' as const,
              score: 0,
              time: 0,
              memory: 0,
              message: skippedMessage(),
              skipped: true,
            }
          }

          let heldLarge = false
          try {
            // 先落盘以得知真实体积，再决定是否占用大测点槽位
            const files = await materializeTestCaseToDisk(testCase.id)
            if (caseSignal.aborted) {
              if (files) await cleanupMaterializedTestCase(files)
              finishedCount++
              emitJudgeProgress(job.userId, {
                submissionId: job.submissionId,
                currentTest: finishedCount,
                totalTests: job.testCases.length,
                status: 'JUDGING',
              })
              persistJudgeProgressThrottled(job.submissionId, finishedCount, job.testCases.length)
              return {
                testId: testCase.id,
                status: 'SE' as const,
                score: 0,
                time: 0,
                memory: 0,
                message: skippedMessage(),
                skipped: true,
              }
            }

            const weight = files
              ? Math.max(files.inputBytes ?? 0, files.expectedBytes)
              : 0
            if (weight >= cfgLargeBytes) {
              await acquireLargeSlot()
              heldLarge = true
              if (caseSignal.aborted) {
                finishedCount++
                emitJudgeProgress(job.userId, {
                  submissionId: job.submissionId,
                  currentTest: finishedCount,
                  totalTests: job.testCases.length,
                  status: 'JUDGING',
                })
                persistJudgeProgressThrottled(job.submissionId, finishedCount, job.testCases.length)
                return {
                  testId: testCase.id,
                  status: 'SE' as const,
                  score: 0,
                  time: 0,
                  memory: 0,
                  message: skippedMessage(),
                  skipped: true,
                }
              }
            }

            const verdict = files
              ? await judgeOneCaseWithFiles(
                  testCase,
                  job,
                  compiledPath,
                  files,
                  caseSignal,
                  spjPath,
                )
              : {
                  testId: testCase.id,
                  status: 'SE' as const,
                  score: 0,
                  time: 0,
                  memory: 0,
                  message: '测试点不存在或已删除',
                }

            finishedCount++
            emitJudgeProgress(job.userId, {
              submissionId: job.submissionId,
              currentTest: finishedCount,
              totalTests: job.testCases.length,
              status: 'JUDGING',
            })
            persistJudgeProgressThrottled(job.submissionId, finishedCount, job.testCases.length)
            if (verdict.skipped) {
              // abort 中途结束的并行测点
            } else if (verdict.status === 'AC') {
              logger.debug(`通过`, { time: verdict.time, memory: verdict.memory, testId: testCase.id })
            } else {
              // 非 AC 测点打 info（含 message），便于在服务端日志直接定位 TLE/MLE/RE 成因
              logger.info(`测试失败`, {
                status: verdict.status,
                message: verdict.message,
                testId: testCase.id,
                time: verdict.time,
                memory: verdict.memory,
              })
              if (
                !verdict.skipped &&
                shouldFailFast(verdict.status, failFastMode) &&
                !abortController.signal.aborted
              ) {
                logger.info('fail-fast：中止剩余测点', {
                  status: verdict.status,
                  testId: testCase.id,
                  mode: failFastMode,
                })
                abortController.abort('fail-fast')
              }
            }
            return verdict
          } catch (error) {
            finishedCount++
            emitJudgeProgress(job.userId, {
              submissionId: job.submissionId,
              currentTest: finishedCount,
              totalTests: job.testCases.length,
              status: 'JUDGING',
            })
            persistJudgeProgressThrottled(job.submissionId, finishedCount, job.testCases.length)
            logger.error(`测试执行错误`, error)
            if (
              !abortController.signal.aborted &&
              shouldFailFast('SE', failFastMode)
            ) {
              abortController.abort('fail-fast')
            }
            return {
              testId: testCase.id,
              status: 'SE' as ResultState,
              score: 0,
              time: 0,
              memory: 0,
              message: error instanceof Error ? error.message : '系统错误',
            }
          } finally {
            if (heldLarge) releaseLargeSlot()
          }
        }
      )

      // 整单被队列超时中止：直接 SE，避免把跳过测点误报成 WA
      if (jobSignal?.aborted) {
        result.status = 'SE'
        result.message = abortReasonMessage(jobSignal.reason, '评测超时')
        for (const v of caseVerdicts) {
          result.testResults?.push({
            testId: v.testId,
            status: v.status,
            time: v.time,
            memory: v.memory,
            message: v.message,
          })
        }
      } else {
        let maxTime = 0
        let maxMemory = 0
        for (const v of caseVerdicts) {
          result.testResults?.push({
            testId: v.testId,
            status: v.status,
            time: v.time,
            memory: v.memory,
            message: v.message,
          })
          if (!v.skipped) {
            maxTime = Math.max(0, maxTime, v.time)
            maxMemory = Math.max(0, maxMemory, v.memory)
          }
          if (v.status === 'AC') {
            result.passedTests++
            result.score += v.score
          } else if (v.status === 'PC' && v.score > 0) {
            // Special Judge 部分分计入总分，但不算「通过测点数」
            result.score += v.score
          }
        }

        // 更新总时间和内存
        result.time = maxTime
        result.memory = maxMemory

        // 确定最终状态（跳过 fail-fast 未跑测点，避免整单变成 SE）
        const totalFullScore = job.testCases.reduce((s, tc) => s + (tc.score || 0), 0)
        if (result.passedTests === result.totalTests) {
          result.status = 'AC'
          logger.info(`全部通过`)
        } else if (
          result.score > 0 &&
          result.score < totalFullScore &&
          caseVerdicts.every((t) => t.skipped || t.status === 'AC' || t.status === 'PC')
        ) {
          // 仅有 AC/PC（无 WA/TLE/...）且未拿满分 → 整单 PC
          result.status = 'PC'
          logger.info(`部分正确`, { score: result.score, total: totalFullScore })
        } else {
          const failedTest = caseVerdicts.find((t) => t.status !== 'AC' && t.status !== 'PC' && !t.skipped)
            ?? caseVerdicts.find((t) => t.status === 'PC' && !t.skipped)
          const statusMap: Record<string, ResultState> = {
            WA: 'WA',
            TLE: 'TLE',
            MLE: 'MLE',
            RE: 'RE',
            CE: 'CE',
            SE: 'SE',
            PE: 'PE',
            OLE: 'OLE',
            CSP: 'CSP',
            PC: 'PC',
          }
          result.status = failedTest?.status ? (statusMap[failedTest.status] || 'WA') : 'WA'
          logger.info(`部分通过`, { passed: result.passedTests, total: result.totalTests })
        }
      }
    } finally {
      jobSignal?.removeEventListener('abort', onJobAbort)
    }
  } catch (error) {
    logger.error(`评测系统错误`, error)
    result.status = 'SE'
    result.message = error instanceof Error ? error.message : '系统错误'
  } finally {
    // B-P2-12：评测结束的所有路径（正常 / fail-fast / SE / 超时 / 中止）统一清理
    // progressDbThrottle 条目，防止 Map 长跑缓慢泄漏
    progressDbThrottle.delete(job.submissionId)
    // 仅当编译成功时清理编译产物
    if (compileResult?.success && compileResult.compiledPath) {
      try {
        await cleanup(compileResult.compiledPath, job.language)
      } catch (err) {
        logger.warn('清理编译产物失败', { error: err instanceof Error ? err.message : String(err) })
      }
    }
    if (spjCompileResult?.success && spjCompileResult.compiledPath) {
      try {
        await cleanupSpj(spjCompileResult.compiledPath)
      } catch (err) {
        logger.warn('清理 SPJ 产物失败', { error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  const endTime = Date.now()
  logger.info(`评测耗时`, {
    submissionId: job.submissionId,
    duration: endTime - startTime,
    // 拆分耗时构成：编译（含 SPJ）+ 测点执行（含落盘/运行/比对），便于定位大测点慢在哪一段
    compileMs: compileEndMs - startTime,
    casesMs: endTime - casesStartMs,
    caseConcurrency: cfgConcurrency,
    largeCaseConcurrency: cfgLargeConcurrency,
    failFast: failFastMode,
  })

  result.judgedAt = new Date()
  return result
}

function abortReasonMessage(reason: unknown, fallback: string): string {
  if (typeof reason === 'string' && reason.trim()) {
    if (reason === 'fail-fast') return '已跳过（前面测点已失败）'
    if (reason === 'job-aborted' || reason === 'queue-disposed') return fallback
    return reason
  }
  if (reason instanceof Error && reason.message) return reason.message
  return fallback
}

// 清理临时文件
export async function cleanup(compiledPath?: string, language?: string) {
  if (!compiledPath) return
  const fs = await import('fs/promises')
  const path = await import('path')

  const tryUnlink = async (p: string) => {
    try {
      await fs.unlink(p)
      logger.debug(`已清理临时文件`, { path: p })
    } catch {
      // 文件不存在或无权限，忽略
    }
  }

  await tryUnlink(compiledPath)

  // cpp/c：compiledPath 是可执行文件，需额外清理源文件 solution_*.cpp/.c
  // python：源文件就是 compiledPath（无需额外清理）
  // 评测机减负（2026-07）：移除 java 特殊清理逻辑
  if (language === 'cpp' || language === 'c') {
    const dir = path.dirname(compiledPath)
    const stem = path.basename(compiledPath, path.extname(compiledPath))
    const sourceExt = language === 'cpp' ? '.cpp' : '.c'
    await tryUnlink(path.join(dir, stem + sourceExt))
  }
}

// 清理过期的临时文件
export async function cleanupOldTempFiles() {
  const tempDir = join(process.cwd(), 'temp', 'judge')
  try {
    const fs = await import('fs/promises')
    const path = await import('path')

    try {
      await fs.access(tempDir)
    } catch {
      return
    }

    const files = await fs.readdir(tempDir, { withFileTypes: true })

    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000

    for (const file of files) {
      if (file.isFile()) {
        const filePath = path.join(tempDir, file.name)
        try {
          const stats = await fs.stat(filePath)

          if (stats.mtime.getTime() < oneHourAgo) {
            await fs.unlink(filePath)
            logger.debug(`已清理过期临时文件`, { filename: file.name })
          }
        } catch {
        }
      }
    }
  } catch {
  }
}
