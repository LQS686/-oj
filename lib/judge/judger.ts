// 评测执行编排器
// 参考 Project LemonLime 的 TaskJudger，协调 compiler/executor/comparator
import type { JudgeJob, JudgeResult } from './queue'
import { compileCode } from './compiler'
import { executeCode } from './executor'
import { compareOutput } from './comparator'
import { validateCodeSafety } from './codeAnalyzer'
import { COMPILE_STATE_MESSAGES } from './types'
import type { ResultState } from './types'
import { join } from 'path'
import { logger } from '@/lib/logger'
import { emitJudgeProgress } from '@/lib/websocket/server'

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
  tcMemoryLimit: number
): Promise<{ status: ResultState; score: number; time: number; memory: number; message: string; outputCorrect: boolean; exceedsTimeLimit: boolean }> {
  const executeResult = await executeCode({
    code: job.code,
    language: job.language,
    input: testCase.input,
    timeLimit: tcTimeLimit,
    memoryLimit: tcMemoryLimit,
    compiledPath,
    extraTimeRatio: job.extraTimeRatio ?? 0.1,
  })

  // 细粒度状态判定
  if (executeResult.cannotStart) {
    return { status: 'CSP', score: 0, time: executeResult.time, memory: executeResult.memory, message: executeResult.error || '无法启动程序', outputCorrect: false, exceedsTimeLimit: false }
  }
  if (executeResult.timeout) {
    // 细化 TLE 消息：区分 CPU TLE 与墙钟 TLE（参考 HOJ/Hydro 的 clockLimit = 3 × cpuLimit 设计）
    // executeResult.error 已包含详细原因（CPU 时间超限 / 墙钟超时）
    const tleMsg = executeResult.error || '超出时间限制'
    return { status: 'TLE', score: 0, time: executeResult.time, memory: executeResult.memory, message: tleMsg, outputCorrect: false, exceedsTimeLimit: false }
  }
  if (executeResult.memoryExceeded) {
    return { status: 'MLE', score: 0, time: executeResult.time, memory: executeResult.memory, message: executeResult.error || '超出内存限制', outputCorrect: false, exceedsTimeLimit: false }
  }
  if (executeResult.runtimeError) {
    // 识别 UBSanitizer 的 runtime error 输出，细化 RE 消息
    // UBSan 在触发 UB 时向 stderr 输出形如 "runtime error: ..." 的诊断信息
    // 常见 UB：signed integer overflow, division by zero, null pointer dereference,
    //          load of value ... which is not a valid value for type 'int' (未初始化变量) 等
    // 参考：https://gcc.gnu.org/onlinedocs/gcc/Instrumentation-Options.html
    const reMsg = formatRuntimeErrorMessage(executeResult.error, executeResult.output)
    return { status: 'RE', score: 0, time: executeResult.time, memory: executeResult.memory, message: reMsg, outputCorrect: false, exceedsTimeLimit: false }
  }

  // 程序正常完成，比较输出
  const compareResult = await compareOutput({
    userOutput: executeResult.output,
    expectedOutput: testCase.output,
    fullScore: testCase.score,
    comparisonMode: job.comparisonMode ?? 'default',
    realPrecision: job.realPrecision ?? 3,
  })

  const outputCorrect = compareResult.score > 0

  // 临界 TLE：executor 判定程序完成但 CPU 时间超限
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
}

// 执行评测
export async function executeJudge(job: JudgeJob): Promise<JudgeResult> {
  const startTime = Date.now()

  logger.info(`开始评测提交`, { submissionId: job.submissionId, language: job.language, problemId: job.problemId })

  const result: JudgeResult = {
    submissionId: job.submissionId,
    status: 'Judging',
    score: 0,
    time: 0,
    memory: 0,
    passedTests: 0,
    totalTests: job.testCases.length,
    testResults: [],
  }

  let compileResult: Awaited<ReturnType<typeof compileCode>> | undefined

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

    // 第二步: 编译
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

    logger.debug(`编译成功`)

    // 第三步: 运行测试用例
    let maxTime = 0
    let maxMemory = 0

    for (let i = 0; i < job.testCases.length; i++) {
      const testCase = job.testCases[i]
      const currentTest = i + 1
      logger.debug(`测试用例`, { index: currentTest, total: job.testCases.length })

      try {
        emitJudgeProgress(job.userId, {
          submissionId: job.submissionId,
          currentTest,
          totalTests: job.testCases.length,
          status: 'Judging',
        })

        // 计算单测点有效限制
        const tcTimeLimit = testCase.timeLimit ?? job.timeLimit
        const tcMemoryLimit = testCase.memoryLimit ?? job.memoryLimit

        // 首次判定
        let verdict = await runOnce(testCase, job, compileResult.compiledPath!, tcTimeLimit, tcMemoryLimit)

        // 临界 TLE 重测：输出正确但时间略微超限，重跑以排除抖动
        const maxRejudge = job.rejudgeTimes ?? 0
        for (let r = 0; r < maxRejudge; r++) {
          // 仅当"临界 TLE"时重测：程序在 extraTime 窗口内完成（未被强制杀死）、输出正确、但 CPU 时间超限
          if (verdict.status !== 'TLE' || !verdict.exceedsTimeLimit || !verdict.outputCorrect) break
          // 重测：取首次通过的结果
          verdict = await runOnce(testCase, job, compileResult.compiledPath!, tcTimeLimit, tcMemoryLimit)
          // 重测通过则停止
          if (verdict.status === 'AC') break
        }

        // 更新最大时间和内存（符合NOI标准，确保非负）
        maxTime = Math.max(0, maxTime, verdict.time)
        maxMemory = Math.max(0, maxMemory, verdict.memory)

        // 记录测试点结果
        result.testResults?.push({
          testId: testCase.id,
          status: verdict.status,
          time: verdict.time,
          memory: verdict.memory,
          message: verdict.message,
        })

        // 累计得分
        if (verdict.status === 'AC') {
          result.passedTests++
          result.score += testCase.score
          logger.debug(`通过`, { time: verdict.time, memory: verdict.memory })
        } else {
          logger.debug(`测试失败`, { status: verdict.status, message: verdict.message })
        }
      } catch (error) {
        logger.error(`测试执行错误`, error)
        result.testResults?.push({
          testId: testCase.id,
          status: 'SE',
          time: 0,
          memory: 0,
          message: error instanceof Error ? error.message : '系统错误',
        })
      }
    }

    // 更新总时间和内存
    result.time = maxTime
    result.memory = maxMemory

    // 确定最终状态
    if (result.passedTests === result.totalTests) {
      result.status = 'AC'
      logger.info(`全部通过`)
    } else {
      const failedTest = result.testResults?.find(t => t.status !== 'AC')
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
  } catch (error) {
    logger.error(`评测系统错误`, error)
    result.status = 'SE'
    result.message = error instanceof Error ? error.message : '系统错误'
  } finally {
    // 仅当编译成功时清理编译产物
    if (compileResult?.success && compileResult.compiledPath) {
      try {
        await cleanup(compileResult.compiledPath, job.language)
      } catch (err) {
        logger.warn('清理编译产物失败', { error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  const endTime = Date.now()
  logger.info(`评测耗时`, { duration: endTime - startTime })

  result.judgedAt = new Date()
  return result
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
