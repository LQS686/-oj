import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notification/service'
import { compileCode, cleanup } from '@/lib/judge/compiler'
import { executeCode } from '@/lib/judge/executor'
import { ensureTotalScoreIs100 } from '@/lib/problem/testcase'
import { validateCodeSafety } from '@/lib/judge/codeAnalyzer'
import { calculateAndStoreCost } from '../utils'
import type { JobExecutionContext } from './types'

/**
 * Mode: PARAM_GEN / SIMILAR — 预览-确认工作流（Task 27.1 + Task 28.4）
 *
 * Phase 6 变更：不直接 createProblemWithRetry，改为将题目字段写入 result.previewProblems，
 * 由 service.commitPreviewedProblem(logId) 后续入库，service.discardPreviewedProblem(logId) 丢弃。
 *
 * 原始来源：lib/ai/queue.ts `_executeJobInner` 的 parametric / similar 分支（940-1233 行）。
 */
export async function handleParametricOrSimilar(ctx: JobExecutionContext): Promise<void> {
  const { job } = ctx
  const problems = ctx.problems
  const thought = ctx.thought
  const tokensUsed = ctx.tokensUsed
  const qualityIssues = ctx.qualityIssues

  const previewProblems: any[] = []
  // 每道题目的测试点 output 修正统计，最终聚合写入 aiGenerationLog.result.correctionStats
  const correctionStatsList: any[] = []

  // 1. Get next problem number start
  // Use createdAt desc to find the latest problem, as string sorting of "P10000" < "P9999" is incorrect
  const latestProblem = await prisma.problem.findFirst({
    where: { problemNumber: { startsWith: 'P' } },
    orderBy: { createdAt: 'desc' },
    select: { problemNumber: true }
  })

  let nextNumber = 1001
  if (latestProblem?.problemNumber) {
    const match = latestProblem.problemNumber.match(/^P(\d+)$/)
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1
    }
  }

  // 2. Prepare preview problems (with test case output correction)
  const errors: string[] = []

  for (const problem of problems) {
    const problemNumber = `P${nextNumber}`

    try {
      // AI 输出的 score 不可信，统一归一化到总和 100
      const rawTestCases = problem.test_cases || []
      if (rawTestCases.length < 10) {
        logger.warn('[ai-queue] AI 生成的测试点偏少（< 10 组）', {
          problemTitle: problem.title,
          testCaseCount: rawTestCases.length,
          hint: '可能 max_tokens 不够或 prompt 未生效；考虑重启 dev server 重试'
        })
      }
      const validTestCases = ensureTotalScoreIs100(
        rawTestCases.map((tc, idx) => ({
          input: tc.input !== undefined ? String(tc.input) : '',
          output: tc.output !== undefined ? String(tc.output) : '',
          isSample: false,
          score: 10,
          orderIndex: idx
        }))
      )

      // ---------------------------------------------------------
      // 🚀 用标程帮助修正测试点 output
      // 效率优先：Python 标程无需编译，启动开销小；C++ 需要先 g++ 编译再运行
      // 因此优先使用 Python 标程验证，仅当 Python 不可用时才回退到 C++
      // ---------------------------------------------------------
      let correctionStats: any
      const hasSolutionCpp = typeof problem.solution_cpp === 'string' && (problem.solution_cpp as string).trim().length > 0
      const hasSolutionPython = typeof problem.solution_python === 'string' && (problem.solution_python as string).trim().length > 0
      const stdCode: string | null = hasSolutionPython
        ? (problem.solution_python as string)
        : hasSolutionCpp
          ? (problem.solution_cpp as string)
          : null
      const stdLang: 'cpp' | 'python' | null = hasSolutionPython
        ? 'python'
        : hasSolutionCpp
          ? 'cpp'
          : null

      if (!stdCode || !stdLang) {
        correctionStats = { skipped: 'no_solution' }
        logger.info('[ai-queue] 无标程可用，跳过测试点 output 修正', {
          problemTitle: problem.title,
          hasCpp: hasSolutionCpp,
          hasPython: hasSolutionPython
        })
      } else {
        let unsafe: string | null = null
        try {
          const safety = validateCodeSafety(stdCode, stdLang)
          if (!safety.safe) {
            unsafe = (safety as any).reason || (safety as any).message || 'unsafe_code'
          }
        } catch (e) {
          logger.warn('[ai-queue] validateCodeSafety 不可用，跳过安全预检', e)
        }

        if (unsafe) {
          correctionStats = { skipped: 'unsafe_code', reason: unsafe }
          logger.warn('[ai-queue] 标程安全预检未通过，跳过 output 修正', {
            problemTitle: problem.title,
            language: stdLang,
            reason: unsafe
          })
        } else {
          const compileResult = await compileCode(stdCode, stdLang)
          if (!compileResult.success) {
            correctionStats = {
              skipped: 'compile_failed',
              compileError: compileResult.error || compileResult.stderr || 'unknown'
            }
            logger.warn('[ai-queue] 标程编译失败，跳过 output 修正', {
              problemTitle: problem.title,
              language: stdLang,
              compileError: correctionStats.compileError
            })
          } else {
            let totalTime = 0
            let totalMemory = 0
            let passed = 0
            let failed = 0
            const total = validTestCases.length

            try {
              for (let i = 0; i < validTestCases.length; i++) {
                const tc: any = validTestCases[i]
                const input = typeof tc.input === 'string' ? tc.input : String(tc.input || '')

                try {
                  const result = await executeCode({
                    code: stdCode,
                    language: stdLang,
                    input,
                    timeLimit: 2000,
                    memoryLimit: 256,
                    compiledPath: compileResult.compiledPath
                  })

                  if (result.timeout) {
                    logger.warn(`[ai-queue] 标程在测试点 #${i + 1} 超时，保留 AI 原 output`, {
                      problemTitle: problem.title
                    })
                    failed++
                    continue
                  }
                  if (result.runtimeError) {
                    logger.warn(`[ai-queue] 标程在测试点 #${i + 1} 运行时错误，保留 AI 原 output`, {
                      problemTitle: problem.title,
                      error: result.error
                    })
                    failed++
                    continue
                  }
                  if (result.exitCode !== 0) {
                    logger.warn(`[ai-queue] 标程在测试点 #${i + 1} 非零退出 (exitCode=${result.exitCode})，保留 AI 原 output`, {
                      problemTitle: problem.title
                    })
                    failed++
                    continue
                  }

                  passed++
                  totalTime += result.time || 0
                  totalMemory += result.memory || 0
                  tc.output = (result.output || '').trim()
                } catch (execErr) {
                  logger.error(`[ai-queue] 测试点 #${i + 1} 执行异常，保留 AI 原 output`, {
                    problemTitle: problem.title,
                    err: execErr
                  })
                  failed++
                }
              }
            } finally {
              await cleanup(compileResult.compiledPath)
            }

            correctionStats = {
              total,
              passed,
              failed,
              corrected: passed,
              avgTime: passed > 0 ? Math.round(totalTime / passed) : 0,
              avgMemory: passed > 0 ? Math.round(totalMemory / passed) : 0
            }

            logger.info('[ai-queue] 测试点 output 修正完成', {
              problemTitle: problem.title,
              ...correctionStats
            })
          }
        }
      }
      correctionStatsList.push(correctionStats)
      // ---------------------------------------------------------
      // END 标程修正 output
      // ---------------------------------------------------------

      // Phase 6 Task 27.1: 构建预览对象（不直接 createProblemWithRetry）
      const article = typeof problem.solution_article === 'string' ? problem.solution_article.trim() : ''
      const code: string | null = problem.solution_cpp
        ? String(problem.solution_cpp)
        : problem.solution_python
          ? String(problem.solution_python)
          : null
      const codeLanguage: 'cpp' | 'python' | null = problem.solution_cpp
        ? 'cpp'
        : problem.solution_python
          ? 'python'
          : null

      previewProblems.push({
        problemNumber,
        title: problem.title || 'Untitled AI Problem',
        description: problem.description || '',
        input: problem.input || '',
        output: problem.output || '',
        samples: problem.samples || [],
        hint: problem.hint,
        difficulty: problem.difficulty || '入门',
        tags: Array.isArray(problem.tags) ? problem.tags : [],
        timeLimit: problem.time_limit || 1000,
        memoryLimit: problem.memory_limit || 128,
        // 业务决策（2026-06）：AI 生成的题目不需要人工验证，直接加入公开题库
        // 质量门禁（2026-07）：存在 qualityIssues 时降级为 private，需人工复核
        isPublic: !qualityIssues?.length,
        visibility: qualityIssues?.length ? 'private' : 'public',
        authorId: job.data.userId,
        isAiGenerated: true,
        aiStatus: 'AI_GENERATED',
        aiPrompt: JSON.stringify(job.data.params),
        stdCode,
        stdLang,
        testCases: validTestCases,
        solution: article ? {
          title: `AI 标程题解 - ${problem.title || 'Untitled'}`,
          content: article,
          code: code || null,
          codeLanguage: codeLanguage || null,
          isOfficial: true,
          isAiGenerated: true,
          sourceType: 'AI_OFFICIAL',
        } : null,
      })

      if (!article) {
        logger.warn('[ai-queue] AI 返回的 solution_article 缺失，预览中题解为 null', {
          problemNumber,
          problemTitle: problem.title,
        })
      }

      nextNumber++
    } catch (prepError: any) {
      logger.error(`Failed to prepare AI problem: ${problem.title}`, prepError)
      errors.push(`Prep failed for "${problem.title}": ${prepError.message}`)
    }
  }

  // Determine final status
  let finalStatus = 'COMPLETED'
  let finalError = undefined

  if (previewProblems.length === 0 && problems.length > 0) {
    finalStatus = 'FAILED'
    finalError = errors.length > 0 ? errors.join('; ') : 'Failed to prepare any problems for preview'
  } else if (errors.length > 0) {
    // Partial success
    finalError = `Partial success. Errors: ${errors.join('; ')}`
  }

  // 超时保护：跳过 COMPLETED 写库，避免覆盖已被 catch 标记的 FAILED 状态
  if (job.aborted) return

  // Phase 6 Task 27.1: 写入预览数据到 log.result.previewProblems（不创建 Problem/Solution）
  await prisma.aiGenerationLog.update({
    where: { id: job.id },
    data: {
      status: finalStatus,
      result: {
        previewProblems,
        thought: thought,
        correctionStats: correctionStatsList,
        isPreview: true, // 标记为预览状态，等待 commit/discard
      } as any,
      tokensUsed: tokensUsed || 0,
      error: finalError
    }
  })

  // Phase 6 Task 35.1: 计算并存储预估成本
  calculateAndStoreCost(job.id, tokensUsed || 0, job.data.params.modelId).catch(() => {})

  // Notify User
  if (finalStatus === 'COMPLETED') {
    await createNotification({
      userId: job.data.userId,
      type: 'system',
      title: 'AI 题目生成完成（预览）',
      content: `已生成 ${previewProblems.length} 个题目预览，请前往 AI 工作区确认入库或丢弃。`,
      link: '/admin/ai'
    })
  }

  job.status = 'completed'
}
