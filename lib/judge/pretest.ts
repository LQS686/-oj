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
import { executeCode } from './executor'
import { compareOutput } from './comparator'
import { validateCodeSafety } from './codeAnalyzer'
import { cleanup } from './judger'
import { logger } from '@/lib/logger'

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
  /** 样例测试点列表 */
  testCases: PretestCase[]
}

/**
 * 执行在线测试：编译 → 逐样例运行+比较 → 汇总
 *
 * 不创建 Submission 记录，不进入评测队列，编译产物在 finally 中清理。
 */
export async function executePretest(options: PretestOptions): Promise<PretestResult> {
  const { code, language, timeLimit, memoryLimit, comparisonMode = 'default', realPrecision = 3, testCases } = options

  const baseResult: PretestResult = {
    status: 'Judging',
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

    // 第三步：逐样例运行
    let maxTime = 0
    let maxMemory = 0
    let passed = 0

    for (const tc of testCases) {
      const tcTimeLimit = tc.timeLimit ?? timeLimit
      const tcMemoryLimit = tc.memoryLimit ?? memoryLimit

      try {
        const execResult = await executeCode({
          code,
          language,
          input: tc.input,
          timeLimit: tcTimeLimit,
          memoryLimit: tcMemoryLimit,
          compiledPath,
          extraTimeRatio: 0.1,
        })

        let status: ResultState
        let message: string
        let userOutput = ''

        if (execResult.cannotStart) {
          status = 'CSP'
          message = execResult.error || '无法启动程序'
        } else if (execResult.timeout) {
          status = 'TLE'
          message = '超出时间限制'
        } else if (execResult.memoryExceeded) {
          status = 'MLE'
          message = '超出内存限制'
        } else if (execResult.runtimeError) {
          status = 'RE'
          message = execResult.error || '运行时错误'
        } else {
          // 程序正常完成，比较输出
          userOutput = execResult.output || ''
          const cmp = await compareOutput({
            userOutput,
            expectedOutput: tc.output,
            fullScore: 100, // pretest 不计分，固定 100 用于判断 AC/WA
            comparisonMode,
            realPrecision,
          })
          status = cmp.status
          message = cmp.message
          if (status === 'AC') passed++
        }

        maxTime = Math.max(maxTime, execResult.time)
        maxMemory = Math.max(maxMemory, execResult.memory)

        baseResult.results.push({
          testId: tc.id,
          status,
          time: execResult.time,
          memory: execResult.memory,
          // 截断输出，防止前端展示溢出（项目约束：stderr 类输出截断 2000 字符）
          userOutput: userOutput.length > 8000 ? userOutput.slice(0, 8000) + '\n[输出过长，已截断]' : userOutput,
          expectedOutput: tc.output.length > 8000 ? tc.output.slice(0, 8000) + '\n[输出过长，已截断]' : tc.output,
          message,
        })
      } catch (err) {
        logger.error('pretest 单测点执行错误', err)
        baseResult.results.push({
          testId: tc.id,
          status: 'SE',
          time: 0,
          memory: 0,
          userOutput: '',
          expectedOutput: tc.output,
          message: err instanceof Error ? err.message : '系统错误',
        })
      }
    }

    // 汇总状态：全部通过为 AC，否则取第一个失败样例的状态
    if (passed === testCases.length) {
      baseResult.status = 'AC'
    } else {
      const firstFailed = baseResult.results.find((r) => r.status !== 'AC')
      baseResult.status = firstFailed?.status || 'WA'
    }
    baseResult.passedTests = passed
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
  }

  baseResult.judgedAt = new Date()
  return baseResult
}
