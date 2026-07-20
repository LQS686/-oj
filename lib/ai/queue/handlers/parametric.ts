import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notification/service'
import { compileCode, cleanup } from '@/lib/judge/compiler'
import { executeCode } from '@/lib/judge/executor'
import { ensureTotalScoreIs100 } from '@/lib/problem/testcase'
import { validateCodeSafety } from '@/lib/judge/codeAnalyzer'
import { checkGeneratedProblem, checkProblemSimilarityFromDb } from '../../quality-check'
import { calculateAndStoreCost } from '../utils'
import type { JobExecutionContext } from './types'

/**
 * Mode: PARAM_GEN / SIMILAR — 预览-确认工作流（Task 27.1 + Task 28.4）
 *
 * 六步流程（spec 第 5 节）：
 * 1. 用户提交生成任务（PARAM_GEN / SIMILAR）
 * 2. AI 生成题目元数据 + C++ 标程 + 仅含 input 的 test_cases
 * 3. 编译 C++ 标程，对所有 input 运行 → 生成真实 output
 * 4. samples 从 test_cases 前 2 组复制（input + output 一致）
 * 5. 完成生成（写入 previewProblems，标记 isPreview: true）
 * 6. 用户确认入库 → 创建 Problem + Solution
 *
 * Phase 6 变更：不直接 createProblemWithRetry，改为将题目字段写入 result.previewProblems，
 * 由 service.commitPreviewedProblem(logId) 后续入库，service.discardPreviewedProblem(logId) 丢弃。
 *
 * Task 6 改造（spec 第 2.2 / 2.3 节，100% 正确率原则）：
 * - C++ 标程作为唯一权威：缺失 / 安全预检未通过 / 编译失败 → 任务 FAILED
 * - 任一测试点运行失败（超时 / RE / 非零退出）→ 立即中止 + 任务 FAILED
 * - samples 从前 2 组 test_cases 复制 input + output（explanation 保留 AI 输出）
 * - stdCode/stdLang 写入 solution_cpp / 'cpp'（不再优先 Python）
 * - 题解参考代码段使用 C++ 标程（codeLanguage: 'cpp'）
 * - finally 块清理编译产物
 * - qualityScore < 60 → FAILED；similarityScore > 0.95 → FAILED
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

  // 2. Prepare preview problems (with C++ std run output generation)
  const errors: string[] = []
  // 100% 正确率原则：任一题目在准备阶段失败即整体任务 FAILED（不再"部分入库"）
  let criticalError: string | null = null

  // PRE-generation 注入的候选相似题（在 POST-generation 相似度检测时排除，避免双重判罚）
  const avoidDuplicateWith = job.data.params?.avoidDuplicateWith as
    | Array<{ title: string; tags: string[] }>
    | undefined

  for (const problem of problems) {
    if (criticalError) break // 立即中止：100% 正确率原则
    const problemNumber = `P${nextNumber}`

    try {
      // AI 输出的 score 不可信，统一归一化到总和 100
      const rawTestCases = problem.test_cases || []
      // 不设数量下限——覆盖度判定完全基于 input 中真实体现的数据特征（quality-check.ts）
      // 数量由 AI 根据覆盖 10 个维度的需要自行决定，避免硬性下限诱导 AI 凑数量

      // 防御性：强制置空 AI 返回的 test_cases[].output（即使 AI 偷偷给了 output 也忽略）
      for (const tc of rawTestCases) {
        if (tc && typeof tc === 'object') {
          tc.output = ''
        }
      }

      const validTestCases = ensureTotalScoreIs100(
        rawTestCases.map((tc, idx) => ({
          input: tc.input !== undefined ? String(tc.input) : '',
          output: '', // 强制置空，由 C++ 标程运行生成
          isSample: false,
          score: 10,
          orderIndex: idx
        }))
      )

      // ---------------------------------------------------------
      // 🚀 C++ 标程编译运行生成 output（Task 6.2 / 6.7 / 6.8）
      // 1. 强制使用 solution_cpp（缺失即 FAILED，不再回退 / 不再使用 solution_python）
      // 2. 安全预检未通过 → FAILED
      // 3. 编译失败 → FAILED（stderr 截断至 2000 字符）
      // 4. 任一 case 运行失败 → 立即中止 + 任务 FAILED（100% 正确率原则）
      // 5. finally 块清理编译产物
      // ---------------------------------------------------------
      const solutionCpp: string | null =
        typeof problem.solution_cpp === 'string' && (problem.solution_cpp as string).trim().length > 0
          ? (problem.solution_cpp as string)
          : null

      if (!solutionCpp) {
        throw new Error('缺少 C++ 标程（solution_cpp），无法生成 output')
      }

      // 安全预检（避免恶意代码运行）
      let unsafe: string | null = null
      try {
        const safety = validateCodeSafety(solutionCpp, 'cpp')
        if (!safety.safe) {
          unsafe = (safety as any).reason || (safety as any).message || 'unsafe_code'
        }
      } catch (e) {
        logger.warn('[ai-queue] validateCodeSafety 不可用，跳过安全预检', e)
      }

      if (unsafe) {
        throw new Error(`C++ 标程安全预检未通过：${unsafe}`)
      }

      // compiledPath 在 try 外部声明（初始为 null），finally 中判空后 cleanup
      let compiledPath: string | null = null

      try {
        // 编译 C++ 标程（复用 lib/judge/compiler 的 compileCode）
        const compileResult = await compileCode(solutionCpp, 'cpp')
        if (!compileResult.success || !compileResult.compiledPath) {
          // stderr 截断至 2000 字符避免日志爆炸
          const stderr = String(compileResult.stderr || compileResult.error || 'unknown').slice(0, 2000)
          throw new Error(`C++ 标程编译失败：${stderr}`)
        }
        compiledPath = compileResult.compiledPath

        // 对每个 test_case.input 运行编译后的 C++ 二进制 → 写入真实 output
        let totalTime = 0
        let totalMemory = 0
        let passed = 0
        const total = validTestCases.length

        for (let i = 0; i < validTestCases.length; i++) {
          const tc: any = validTestCases[i]
          const input = typeof tc.input === 'string' ? tc.input : String(tc.input || '')
          // inputPreview：失败时记录 input 前 100 字符便于排查
          const inputPreview = (input || '').slice(0, 100)

          // 使用题目实际 time_limit / memory_limit 运行标程，
          // 保证"标程能跑出 output" 与"用户提交标程能 AC"使用同一资源约束，
          // 避免标程在 2000ms 内跑出 output 但用户提交时因题目实际 timeLimit=1000ms 而 TLE
          const problemTimeLimit = typeof problem.time_limit === 'number' ? problem.time_limit : 1000
          const problemMemoryLimit = typeof problem.memory_limit === 'number' ? problem.memory_limit : 128

          let result: any
          try {
            result = await executeCode({
              code: solutionCpp,
              language: 'cpp',
              input,
              timeLimit: problemTimeLimit,
              memoryLimit: problemMemoryLimit,
              compiledPath: compiledPath || undefined
            })
          } catch (execErr: any) {
            // 100% 正确率原则：任一 case 执行异常即 FAILED
            throw new Error(
              `C++ 标程运行第 ${i + 1} 个测试点失败：执行异常 ${execErr?.message || execErr}（input: ${inputPreview}）`
            )
          }

          // 判定失败原因（超时 / 内存超限 / RE / 非零退出 / 无法启动）
          let reason = ''
          if (result.timeout) {
            reason = `超时（>${problemTimeLimit}ms）`
          } else if (result.memoryExceeded) {
            reason = `内存超限（>${problemMemoryLimit}MB）`
          } else if (result.cannotStart) {
            reason = `无法启动：${String(result.error || '').slice(0, 500)}`
          } else if (result.runtimeError) {
            reason = `运行时错误：${String(result.error || '').slice(0, 500)}`
          } else if (result.exitCode !== 0) {
            reason = `非零退出 (exitCode=${result.exitCode})`
          }

          if (reason) {
            // 100% 正确率原则：任一 case 失败即 FAILED，错误信息含 case index + reason + input 前 100 字符
            throw new Error(
              `C++ 标程运行第 ${i + 1} 个测试点失败：${reason}（input: ${inputPreview}）`
            )
          }

          passed++
          totalTime += result.time || 0
          totalMemory += result.memory || 0
          tc.output = (result.output || '').trim()
        }

        const correctionStats = {
          total,
          passed,
          failed: 0, // 任一失败已抛错中止，能走到这里即 0 失败
          corrected: passed,
          avgTime: passed > 0 ? Math.round(totalTime / passed) : 0,
          avgMemory: passed > 0 ? Math.round(totalMemory / passed) : 0
        }

        logger.info('[ai-queue] C++ 标程运行生成 output 完成', {
          problemTitle: problem.title,
          ...correctionStats
        })
        correctionStatsList.push(correctionStats)
      } finally {
        // Task 6.8：finally 块清理编译产物，即使运行失败也清理
        if (compiledPath) {
          await cleanup(compiledPath)
        }
      }
      // ---------------------------------------------------------
      // END C++ 标程执行
      // ---------------------------------------------------------

      // Task 6.4：samples 从前 2 组 test_cases 复制（input + output 一致），
      // explanation 保留 AI 输出（如果 AI 给了 samples 的 explanation）；
      // 若 AI 给的 samples 不足 2 组，用 test_cases 前 2 组补齐；
      // 若 test_cases 不足 2 组，使用实际数量（不阻塞，quality-check 会 warn）
      const aiSamples = Array.isArray(problem.samples) ? problem.samples : []
      const samplesCount = Math.min(2, validTestCases.length)
      const finalSamples: Array<{ input: string; output: string; explanation: string }> = []
      for (let i = 0; i < samplesCount; i++) {
        const tc = validTestCases[i]
        const aiSample = aiSamples[i]
        const explanation =
          aiSample && typeof aiSample === 'object'
            ? String((aiSample as any).explanation || '')
            : ''
        finalSamples.push({
          input: String(tc.input || ''),
          output: String(tc.output || ''),
          explanation
        })
      }

      // Phase 6 Task 27.1: 构建预览对象（不直接 createProblemWithRetry）
      const article = typeof problem.solution_article === 'string' ? problem.solution_article.trim() : ''
      // Task 6.5 / 6.6：stdCode/stdLang 写入 solution_cpp / 'cpp'；题解参考代码段使用 C++ 标程
      previewProblems.push({
        problemNumber,
        title: problem.title || 'Untitled AI Problem',
        description: problem.description || '',
        input: problem.input || '',
        output: problem.output || '',
        samples: finalSamples,
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
        stdCode: solutionCpp,
        stdLang: 'cpp',
        testCases: validTestCases,
        solution: article ? {
          title: `AI 标程题解 - ${problem.title || 'Untitled'}`,
          content: article,
          code: solutionCpp,
          codeLanguage: 'cpp',
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

      // Task 6.9 / 6.10：质量检查（含相似度检测）
      // 1. 先调用 checkProblemSimilarityFromDb 获取 existingProblems
      // 2. 传入 checkGeneratedProblem(p, { avoidDuplicateWith, existingProblems })
      // 3. qualityScore < 60 → FAILED；similarityScore > 0.95 → FAILED
      const newProblemForCheck = {
        title: problem.title || '',
        description: problem.description || '',
        tags: Array.isArray(problem.tags) ? problem.tags : []
      }
      const { existingProblems } = await checkProblemSimilarityFromDb(
        newProblemForCheck,
        avoidDuplicateWith
      )
      const qualityResult = checkGeneratedProblem(
        {
          title: problem.title || '',
          description: problem.description || '',
          input: problem.input || '',
          output: problem.output || '',
          samples: finalSamples,
          hint: problem.hint,
          difficulty: problem.difficulty || '入门',
          tags: Array.isArray(problem.tags) ? problem.tags : [],
          time_limit: problem.time_limit || 1000,
          memory_limit: problem.memory_limit || 128,
          test_cases: validTestCases,
          solution_cpp: solutionCpp
        },
        { avoidDuplicateWith, existingProblems }
      )

      const qualityScore = qualityResult.qualityScore ?? 0
      if (qualityScore < 60) {
        throw new Error(`题目质量评分 ${qualityScore} 低于阈值 60，不入库`)
      }

      const similarityScore = qualityResult.similarityScore ?? 0
      if (similarityScore > 0.95) {
        throw new Error(`题目相似度 ${similarityScore} 高于阈值 0.95，视为重复题，不入库`)
      }

      // spec 第 7.4/7.5 节：将 qualityScore / similarityScore 回填到 previewProblems[i]
      // 前端 AiResultPanel 通过 rawProblem.qualityScore / rawProblem.similarityScore 读取展示
      const lastPreview = previewProblems[previewProblems.length - 1]
      if (lastPreview) {
        lastPreview.qualityScore = qualityScore
        lastPreview.similarityScore = similarityScore
      }

      nextNumber++
    } catch (prepError: any) {
      logger.error(`Failed to prepare AI problem: ${problem.title}`, prepError)
      errors.push(`Prep failed for "${problem.title}": ${prepError.message}`)
      // 100% 正确率原则：任一题目在准备阶段失败即整体任务 FAILED（不再"部分入库"）
      criticalError = prepError.message
    }
  }

  // Determine final status
  let finalStatus = 'COMPLETED'
  let finalError = undefined

  if (criticalError) {
    // 100% 正确率原则：任一题目准备失败即任务 FAILED
    finalStatus = 'FAILED'
    finalError = criticalError
  } else if (previewProblems.length === 0 && problems.length > 0) {
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
