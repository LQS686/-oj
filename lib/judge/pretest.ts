/**
 * 在线测试（pretest）：在用户正式提交前，用题目样例测试点（isSample=true）运行用户代码。
 *
 * 与正式评测（executeJudge）的区别：
 *   - 不进入评测队列，不创建 Submission 记录
 *   - 仅使用样例测试点，不触碰隐藏测试点
 *   - 不进行重测、不发送 WebSocket 进度
 *   - 编译产物在 finally 中清理，避免磁盘泄漏
 *
 * 参考：HOJ JudgeStrategy.runWithSamples、Hydro 沙箱 pretest 接口
 */
import type { ComparisonMode, ResultState } from './types'
import { compileCode } from './compiler'
import { executeCode, cleanupExecuteArtifacts } from './executor'
import { compareOutput } from './comparator'
import { validateCodeSafety } from './codeAnalyzer'
import { cleanup } from './judger'
import { logger } from '@/lib/logger'
import { mapPool, resolveCaseConcurrency } from './pool'
import {
  compileSpj,
  cleanupSpj,
  runSpj,
  ensureUserOutputFile,
  isSpecialJudgeMode,
} from './spj'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import * as crypto from 'crypto'

/** 单个样例测试点的输入参数 */
export interface PretestCase {
  id: string
  input: string
  output: string
  /** 单测点时间限制覆盖（ms），可选 */
  timeLimit?: number | null
  /** 单测点内存限制覆盖（MB），可选 */
  memoryLimit?: number | null
}

/** 单个样例测试点的运行结果 */
export interface PretestCaseResult {
  testId: string
  /** AC / WA / TLE / MLE / RE / CSP / SE */
  status: ResultState
  /** 程序运行时间（ms） */
  time: number
  /** 程序峰值内存（KB） */
  memory: number
  /** 用户实际输出（截断到 8000 字符，防止日志溢出） */
  userOutput: string
  /** 期望输出（截断到 8000 字符） */
  expectedOutput: string
  /** 状态详情消息（如"第 2 行，期望 5 但得到 3"） */
  message: string
}

/** pretest 完整结果 */
export interface PretestResult {
  /** 整体状态：CE / SE / 含样例结果的汇总状态 */
  status: ResultState
  /** 编译错误详情（仅 status=CE 时有值） */
  compileError?: string
  /** 通过的样例数 */
  passedTests: number
  /** 总样例数 */
  totalTests: number
  /** 最大运行时间（ms） */
  time: number
  /** 最大峰值内存（KB） */
  memory: number
  /** 各样例点详情 */
  results: PretestCaseResult[]
  /** 评测完成时间戳 */
  judgedAt: Date
}

/** pretest 调用入参 */
export interface PretestOptions {
  /** 用户代码 */
  code: string
  /** 编程语言（cpp/c/python） */
  language: string
  /** 题目默认时间限制（ms） */
  timeLimit: number
  /** 题目默认内存限制（MB） */
  memoryLimit: number
  /** 输出比较模式，默认 'default' */
  comparisonMode?: ComparisonMode
  /** 浮点数比较精度，默认 3 */
  realPrecision?: number
  /** Testlib checker 源码（special-judge 时必填） */
  spjCode?: string | null
  /** 样例测试点列表 */
  testCases: PretestCase[]
}

/**
 * 执行在线测试：编译 → 逐样例运行+比较 → 汇总
 *
 * 不创建 Submission 记录，不进入评测队列，编译产物在 finally 中清理。
 */
export async function executePretest(options: PretestOptions): Promise<PretestResult> {
  const {
    code,
    language,
    timeLimit,
    memoryLimit,
    comparisonMode = 'default',
    realPrecision = 3,
    spjCode,
    testCases,
  } = options

  const baseResult: PretestResult = {
    status: 'JUDGING',
    passedTests: 0,
    totalTests: testCases.length,
    time: 0,
    memory: 0,
    results: [],
    judgedAt: new Date(),
  }

  // 空样例：直接返回成功（无样例可测）
  if (testCases.length === 0) {
    return { ...baseResult, status: 'AC', judgedAt: new Date() }
  }

  let compiledPath: string | undefined
  let spjPath: string | undefined

  try {
    // 第一步：代码安全分析
    const safetyCheck = validateCodeSafety(code, language)
    if (!safetyCheck.safe) {
      return {
        ...baseResult,
        status: 'SE',
        compileError: safetyCheck.errors[0] || '代码检测到安全问题',
        judgedAt: new Date(),
      }
    }

    // 第二步：编译
    const compileResult = await compileCode(code, language)
    if (!compileResult.success) {
      return {
        ...baseResult,
        status: 'CE',
        // 合并编译状态标签与 stderr（参考 judger.ts 的 mergeNonEmptyStrings）
        compileError: [compileResult.error || '编译错误', compileResult.stderr].filter(Boolean).join('\n'),
        judgedAt: new Date(),
      }
    }
    compiledPath = compileResult.compiledPath

    if (isSpecialJudgeMode(comparisonMode)) {
      if (!spjCode?.trim()) {
        return {
          ...baseResult,
          status: 'SE',
          compileError: '题目配置为 Special Judge，但缺少 checker 代码',
          judgedAt: new Date(),
        }
      }
      const spjResult = await compileSpj(spjCode)
      if (!spjResult.success) {
        return {
          ...baseResult,
          status: 'SE',
          compileError: [spjResult.error || 'Special Judge 编译失败', spjResult.stderr]
            .filter(Boolean)
            .join('\n'),
          judgedAt: new Date(),
        }
      }
      spjPath = spjResult.compiledPath
    }

    // 第三步：并行跑完全部样例（不因 TLE/WA 等跳过）
    const concurrency = resolveCaseConcurrency()
    logger.info('pretest 开始跑样例', { total: testCases.length, concurrency, spj: !!spjPath })

    const tempDir = join(process.cwd(), 'temp', 'judge')
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true })
    }

    const caseResults = await mapPool(testCases, concurrency, async (tc) => {
      const tcTimeLimit = tc.timeLimit ?? timeLimit
      const tcMemoryLimit = tc.memoryLimit ?? memoryLimit

      try {
        const expectedBytes = Buffer.byteLength(tc.output ?? '', 'utf-8')
        const execResult = await executeCode({
          code,
          language,
          input: tc.input,
          timeLimit: tcTimeLimit,
          memoryLimit: tcMemoryLimit,
          compiledPath,
          extraTimeRatio: 0,
          expectedOutputBytes: expectedBytes,
        })

        let status: ResultState
        let message: string
        let userOutput = ''

        try {
          if (execResult.cannotStart) {
            status = 'CSP'
            message = execResult.error || '无法启动程序'
          } else if (execResult.timeout) {
            status = 'TLE'
            message = '超出时间限制'
          } else if (execResult.outputLimitExceeded) {
            status = 'OLE'
            message = execResult.error || '超出输出限制'
          } else if (execResult.memoryExceeded) {
            status = 'MLE'
            message = '超出内存限制'
          } else if (execResult.runtimeError) {
            status = 'RE'
            message = execResult.error || '运行时错误'
          } else {
            userOutput = execResult.output || ''
            await new Promise<void>((r) => setImmediate(r))

            if (spjPath && isSpecialJudgeMode(comparisonMode)) {
              const sid = crypto.randomBytes(4).toString('hex')
              const inPath = join(tempDir, `pre_in_${sid}.txt`)
              const ansPath = join(tempDir, `pre_ans_${sid}.txt`)
              let ephemeralUser: string | null = null
              try {
                await writeFile(inPath, tc.input ?? '', 'utf8')
                await writeFile(ansPath, tc.output ?? '', 'utf8')
                const outFile = await ensureUserOutputFile(
                  execResult.artifacts?.outputPath,
                  execResult.artifacts?.outputPath ? undefined : userOutput,
                  tempDir,
                )
                if (outFile.ephemeral) ephemeralUser = outFile.path
                const cmp = await runSpj({
                  checkerPath: spjPath,
                  inputPath: inPath,
                  userOutputPath: outFile.path,
                  answerPath: ansPath,
                  fullScore: 100,
                })
                status = cmp.status
                message = cmp.message
              } finally {
                for (const p of [inPath, ansPath, ephemeralUser]) {
                  if (!p) continue
                  try {
                    if (existsSync(p)) await unlink(p)
                  } catch {
                    /* ignore */
                  }
                }
              }
            } else {
              const cmp = await compareOutput({
                userOutputPath: execResult.artifacts?.outputPath,
                userOutput: execResult.artifacts?.outputPath ? undefined : userOutput,
                expectedOutput: tc.output,
                fullScore: 100,
                comparisonMode,
                realPrecision,
              })
              status = cmp.status
              message = cmp.message
            }
          }
        } finally {
          await cleanupExecuteArtifacts(execResult.artifacts)
        }

        return {
          testId: tc.id,
          status,
          time: execResult.time,
          memory: execResult.memory,
          userOutput: userOutput.length > 8000 ? userOutput.slice(0, 8000) + '\n[输出过长，已截断]' : userOutput,
          expectedOutput: tc.output.length > 8000 ? tc.output.slice(0, 8000) + '\n[输出过长，已截断]' : tc.output,
          message,
          skipped: false,
        }
      } catch (err) {
        logger.error('pretest 单测点执行错误', err)
        return {
          testId: tc.id,
          status: 'SE' as ResultState,
          time: 0,
          memory: 0,
          userOutput: '',
          expectedOutput: tc.output,
          message: err instanceof Error ? err.message : '系统错误',
          skipped: false,
        }
      }
    })

    let maxTime = 0
    let maxMemory = 0
    let passed = 0
    for (const r of caseResults) {
      if (r.skipped) continue
      baseResult.results.push({
        testId: r.testId,
        status: r.status,
        time: r.time,
        memory: r.memory,
        userOutput: r.userOutput,
        expectedOutput: r.expectedOutput,
        message: r.message,
      })
      maxTime = Math.max(maxTime, r.time)
      maxMemory = Math.max(maxMemory, r.memory)
      if (r.status === 'AC') passed++
    }

    // 汇总：全部样例 AC 才是 AC；fail-fast 跳过的不计入 results
    if (passed === testCases.length) {
      baseResult.status = 'AC'
    } else {
      const firstFailed = baseResult.results.find((r) => r.status !== 'AC')
      baseResult.status = firstFailed?.status || 'WA'
    }
    baseResult.passedTests = passed
    baseResult.totalTests = testCases.length
    baseResult.time = maxTime
    baseResult.memory = maxMemory
  } catch (err) {
    logger.error('pretest 系统错误', err)
    baseResult.status = 'SE'
    baseResult.compileError = err instanceof Error ? err.message : '系统错误'
  } finally {
    // 清理编译产物（项目约束：编译产物必须清理防止磁盘泄漏）
    if (compiledPath) {
      try {
        await cleanup(compiledPath, language)
      } catch (err) {
        logger.warn('pretest 清理编译产物失败', { error: err instanceof Error ? err.message : String(err) })
      }
    }
    if (spjPath) {
      try {
        await cleanupSpj(spjPath)
      } catch (err) {
        logger.warn('pretest 清理 SPJ 产物失败', { error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  baseResult.judgedAt = new Date()
  return baseResult
}
