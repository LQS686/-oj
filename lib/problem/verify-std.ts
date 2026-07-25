/**
 * lib/problem/verify-std.ts
 * 标程验证：编译标程 → 跑全部测试点 → 成功则覆盖 output 并保存 stdCode
 */
import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/errors'
import { compileCode, cleanup } from '@/lib/judge/compiler'
import { executeCode } from '@/lib/judge/executor'
import { logger } from '@/lib/logger'

const ALLOWED_LANGS = new Set(['cpp', 'c', 'python'])

export interface VerifyStdInput {
  problemId: string
  operatorId: string
  solutionCode: string
  solutionLanguage: string
}

export interface VerifyStdCaseResult {
  id: string
  index: number
  status: 'OK' | 'FAILED' | 'ERROR'
  time?: number
  memory?: number
  error?: string
}

export interface VerifyStdResult {
  verified: boolean
  message: string
  fixedCount?: number
  results: VerifyStdCaseResult[]
  compileError?: string
}

export async function verifyProblemWithStd(input: VerifyStdInput): Promise<VerifyStdResult> {
  const code = input.solutionCode?.trim()
  const language = input.solutionLanguage?.trim()
  if (!code) throw AppError.badRequest('MISSING_CODE', '请提供标程代码')
  if (!language || !ALLOWED_LANGS.has(language)) {
    throw AppError.badRequest('INVALID_LANG', '标程语言仅支持 C / C++ / Python')
  }

  const problem = await prisma.problem.findUnique({
    where: { id: input.problemId },
    include: { testCases: { orderBy: { orderIndex: 'asc' } } },
  })
  if (!problem) throw AppError.notFound('题目不存在')
  if (!problem.testCases.length) {
    throw AppError.badRequest('NO_TEST_CASES', '题目没有测试用例，请先保存测试点后再验证')
  }

  const compileResult = await compileCode(code, language)
  if (!compileResult.success) {
    await prisma.verificationLog.create({
      data: {
        problemId: input.problemId,
        operatorId: input.operatorId,
        status: 'FAILED',
        details: {
          passed: 0,
          failed: problem.testCases.length,
          compileError: compileResult.error || compileResult.stderr || '编译失败',
        },
      },
    })
    return {
      verified: false,
      message: '标程编译失败',
      compileError: compileResult.error || compileResult.stderr || '编译失败',
      results: [],
    }
  }

  const compiledPath = compileResult.compiledPath
  const results: VerifyStdCaseResult[] = []
  const updatedOutputs: Array<{ id: string; output: string }> = []
  let passedCount = 0
  let failedCount = 0

  try {
    for (let i = 0; i < problem.testCases.length; i++) {
      const tc = problem.testCases[i]
      try {
        const runResult = await executeCode({
          code,
          language,
          input: tc.input,
          // 标程验证略放宽时限，避免卡在临界 TLE
          timeLimit: Math.max(problem.timeLimit, tc.timeLimit ?? 0) * 2 || problem.timeLimit * 2,
          memoryLimit: tc.memoryLimit ?? problem.memoryLimit,
          compiledPath: compiledPath!,
        })

        if (runResult.exitCode === 0 && !runResult.timeout && !runResult.runtimeError && !runResult.memoryExceeded) {
          updatedOutputs.push({ id: tc.id, output: runResult.output.replace(/\r\n/g, '\n') })
          passedCount++
          results.push({
            id: tc.id,
            index: i + 1,
            status: 'OK',
            time: runResult.time,
            memory: runResult.memory,
          })
        } else {
          failedCount++
          const error =
            runResult.error ||
            (runResult.timeout
              ? 'Time Limit Exceeded'
              : runResult.memoryExceeded
                ? 'Memory Limit Exceeded'
                : runResult.runtimeError
                  ? 'Runtime Error'
                  : `exit code ${runResult.exitCode}`)
          results.push({ id: tc.id, index: i + 1, status: 'FAILED', error })
        }
      } catch (err) {
        failedCount++
        results.push({
          id: tc.id,
          index: i + 1,
          status: 'ERROR',
          error: err instanceof Error ? err.message : '执行错误',
        })
      }
    }

    if (failedCount > 0) {
      await prisma.verificationLog.create({
        data: {
          problemId: input.problemId,
          operatorId: input.operatorId,
          status: 'FAILED',
          details: { passed: passedCount, failed: failedCount, results },
        },
      })
      return {
        verified: false,
        message: `标程在 ${failedCount} 个测试点上运行失败，请检查标程或输入数据`,
        results,
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const item of updatedOutputs) {
        await tx.testCase.update({
          where: { id: item.id },
          data: { output: item.output },
        })
      }
      await tx.problem.update({
        where: { id: input.problemId },
        data: { stdCode: code, stdLang: language },
      })
      await tx.verificationLog.create({
        data: {
          problemId: input.problemId,
          operatorId: input.operatorId,
          status: 'SUCCESS',
          details: {
            passed: passedCount,
            failed: 0,
            results,
            fixedCount: updatedOutputs.length,
          },
        },
      })
    })

    logger.info(`标程验证通过 problem=${input.problemId} fixed=${updatedOutputs.length}`)
    return {
      verified: true,
      message: `验证通过，已更新 ${passedCount} 个测试点的输出，并保存标程`,
      fixedCount: updatedOutputs.length,
      results,
    }
  } finally {
    if (compiledPath) {
      try {
        await cleanup(compiledPath)
      } catch (err) {
        logger.warn('标程验证清理编译产物失败', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }
}
