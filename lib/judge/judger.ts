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
    return { status: 'TLE', score: 0, time: executeResult.time, memory: executeResult.memory, message: '超出时间限制', outputCorrect: false, exceedsTimeLimit: false }
  }
  if (executeResult.memoryExceeded) {
    return { status: 'MLE', score: 0, time: executeResult.time, memory: executeResult.memory, message: '超出内存限制', outputCorrect: false, exceedsTimeLimit: false }
  }
  if (executeResult.runtimeError) {
    return { status: 'RE', score: 0, time: executeResult.time, memory: executeResult.memory, message: executeResult.error || '运行时错误', outputCorrect: false, exceedsTimeLimit: false }
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
      logger.warn(`编译失败`, { compileState: compileResult.compileState })
      const compileState = compileResult.compileState
      const stateLabel = COMPILE_STATE_MESSAGES[compileState] || ''
      const detail = compileResult.error || '编译错误'
      const message = stateLabel ? `${stateLabel}: ${detail}` : detail
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
        await cleanup(compileResult.compiledPath)
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
export async function cleanup(compiledPath?: string) {
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

  // Java 情况：compiledPath 无扩展名，实际产物是 {className}.class 与源文件 {className}.java
  // 不清理会导致高并发下两个 Java 提交（均 public class Main）互相覆盖
  const ext = path.extname(compiledPath)
  if (!ext) {
    await tryUnlink(`${compiledPath}.class`)
    await tryUnlink(`${compiledPath}.java`)
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
