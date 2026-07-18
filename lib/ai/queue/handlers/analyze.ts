import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notification/service'
import { analyzeProblem } from '../../analyzers/problem-analyzer'
import type { JobExecutionContext } from './types'

/**
 * Mode: ANALYZE — 题目智能分析（只读，不写 Problem/Solution）
 *
 * 原始来源：lib/ai/queue.ts `_executeJobInner` 的 analyze 分支（418-489 行）。
 */
export async function handleAnalyze(ctx: JobExecutionContext): Promise<void> {
  const job = ctx.job
  const problemId = job.data.params.targetProblemId
  if (!problemId) {
    throw new Error('analyze mode 缺少 targetProblemId')
  }
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      title: true,
      description: true,
      input: true,
      output: true,
      samples: true,
      tags: true,
      difficulty: true,
      hint: true,
      stdCode: true,
      stdLang: true,
    },
  })
  if (!problem) {
    throw new Error(`analyze mode: 题目不存在 ${problemId}`)
  }

  const analysis = await analyzeProblem(
    {
      title: problem.title,
      description: problem.description,
      input: problem.input || undefined,
      output: problem.output || undefined,
      samples: problem.samples as any[],
      tags: problem.tags,
      difficulty: problem.difficulty,
      hint: problem.hint,
      stdCode: problem.stdCode,
      stdLang: problem.stdLang,
    },
    { userId: job.data.userId, modelId: job.data.params.modelId }
  )

  // 超时保护：跳过 COMPLETED 写库，避免覆盖已被 catch 标记的 FAILED 状态
  if (job.aborted) return

  await prisma.aiGenerationLog.update({
    where: { id: job.id },
    data: {
      status: 'COMPLETED',
      result: {
        analysis: {
          suggestedTags: analysis.suggestedTags,
          suggestedDifficulty: analysis.suggestedDifficulty,
          qualityIssues: analysis.qualityIssues,
          suggestedHints: analysis.suggestedHints,
          testCaseGaps: analysis.testCaseGaps,
        },
      } as any,
      tokensUsed: analysis.tokensUsed || 0,
    },
  })

  await createNotification({
    userId: job.data.userId,
    type: 'system',
    title: 'AI 题目分析完成',
    content: `题目 "${problem.title}" 的智能分析已完成。`,
    link: `/admin/problems/${problemId}/edit`,
  })

  job.status = 'completed'
}
