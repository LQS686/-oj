/**
 * saveProblem — 把 AI 生成的题目落库的统一入口
 *
 * 设计目标：
 * 1. 抽离 [app/api/admin/ai/save/route.ts](file:///e:/桌面/oj/app/api/admin/ai/save/route.ts) 的事务逻辑，
 *    让 save 路由与 save-and-verify 路由共用同一份"创建题目 + 写测试点 + 写标程"流程
 * 2. 事务外统一调用 [redistributeTestScores](file:///e:/桌面/oj/lib/testcase-score.ts)
 *    保证所有路径的测试点总分 = 100
 * 3. options 提供三个开关，覆盖"保存草稿"、"保存+验证"两种语义：
 *    - isPublic: 保存时是否公开（默认 false，save-and-verify 内部流程会再 UPDATE）
 *    - aiStatus: 初始 AI 状态（PENDING / DRAFT ...）
 *    - solutionVerified: 标程是否已通过验证（默认 false；只有验证通过时为 true）
 *
 * 错误模型：
 * 任何内部异常都会被捕获并包成 Error 抛出，错误信息包含上下文（problemNumber / logId），
 * 让上层路由可以直接把 message 回传给前端。
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { redistributeTestScores } from '@/lib/testcase-score'
import { GeneratedProblem } from './prompts/core/types'

export interface SaveProblemOptions {
  isPublic?: boolean
  aiStatus?: 'PENDING' | 'VERIFIED' | 'AUTO_PUBLISHED_WITH_FAILURES' | 'DRAFT'
  solutionVerified?: boolean
}

export type SaveProblemUser = {
  userId: string
  isAdmin: boolean
}

export async function saveProblem(
  user: SaveProblemUser,
  problem: GeneratedProblem,
  logId?: string,
  options: SaveProblemOptions = {}
): Promise<{ problem: any; solution: any | null; testCases: any[] }> {
  const isPublic = options.isPublic ?? false
  const aiStatus = options.aiStatus ?? 'PENDING'
  const solutionVerified = options.solutionVerified ?? false

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. 生成题目编号 Pxxxx（与 save 路由保持一致的逻辑）
      const latestProblem = await tx.problem.findFirst({
        where: { problemNumber: { startsWith: 'P' } },
        orderBy: { problemNumber: 'desc' },
        select: { problemNumber: true }
      })

      let nextNumber = 1001
      if (latestProblem?.problemNumber) {
        const match = latestProblem.problemNumber.match(/^P(\d+)$/)
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1
        }
      }
      const finalProblemNumber = `P${nextNumber}`

      // 2. 难度字段兜底
      const systemDifficulty = problem.difficulty || '普及-'

      // 3. 创建 Problem
      const newProblem = await tx.problem.create({
        data: {
          problemNumber: finalProblemNumber,
          title: problem.title,
          description: problem.description,
          input: problem.input,
          output: problem.output,
          samples: problem.samples as any,
          hint: problem.hint,
          difficulty: systemDifficulty,
          tags: problem.tags || [],
          authorId: user.userId,
          isPublic,
          isAiGenerated: true,
          aiStatus,
          aiPrompt: logId ? `Generated from log ${logId}` : 'Manual AI generation',
          timeLimit: problem.time_limit || 1000,
          memoryLimit: problem.memory_limit || 128
        }
      })

      // 4. 创建 Test Cases（samples + hidden）
      const allTestCases: any[] = []

      if (problem.samples && problem.samples.length > 0) {
        allTestCases.push(
          ...problem.samples.map((s, idx) => ({
            problemId: newProblem.id,
            input: s.input,
            output: s.output,
            isSample: true,
            score: 0,
            orderIndex: idx
          }))
        )
      }

      if (problem.test_cases && problem.test_cases.length > 0) {
        const sampleCount = allTestCases.length
        allTestCases.push(
          ...problem.test_cases.map((tc, idx) => ({
            problemId: newProblem.id,
            input: tc.input,
            output: tc.output,
            isSample: false,
            score: 0,
            orderIndex: sampleCount + idx
          }))
        )
      }

      if (allTestCases.length > 0) {
        await tx.testCase.createMany({ data: allTestCases })
      }

      // 5. 创建 Solution（如果 AI 给出了标程）
      let createdSolution: any = null
      const hasCpp = !!problem.solution_cpp
      const hasPython = !!problem.solution_python
      if (hasCpp || hasPython) {
        const code = problem.solution_cpp || problem.solution_python || ''
        const language = hasCpp ? 'cpp' : 'python'
        createdSolution = await tx.solution.create({
          data: {
            problemId: newProblem.id,
            authorId: user.userId,
            title: 'Reference Solution',
            content: 'AI Generated Reference Solution',
            code,
            language,
            isOfficial: true,
            verified: solutionVerified,
            verifiedAt: solutionVerified ? new Date() : null
          }
        })
      }

      return { problem: newProblem, solution: createdSolution, testCases: allTestCases }
    })

    // 6. 事务外：重新分配测试点分数（保证 sum=100）
    if (result.testCases.length > 0) {
      await redistributeTestScores(result.problem.id)
    }

    // 7. 重新读一次 testCases（拿到真实分配的 score）
    const finalTestCases = await prisma.testCase.findMany({
      where: { problemId: result.problem.id },
      orderBy: { orderIndex: 'asc' }
    })

    return {
      problem: result.problem,
      solution: result.solution,
      testCases: finalTestCases
    }
  } catch (error: any) {
    logger.error('[saveProblem] 保存 AI 题目失败', {
      logId,
      title: problem?.title,
      error: error?.message
    })
    if (error instanceof Error) {
      throw error
    }
    throw new Error(error?.message || 'saveProblem failed')
  }
}
