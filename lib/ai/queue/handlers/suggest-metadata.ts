import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notification/service'
import { suggestMetadata } from '../../analyzers/metadata-suggester'
import type { JobExecutionContext } from './types'

/**
 * Mode: SUGGEST_METADATA — 元数据建议（只读，不写 Problem/Solution）
 *
 * 原始来源：lib/ai/queue.ts `_executeJobInner` 的 suggest_metadata 分支（492-532 行）。
 */
export async function handleSuggestMetadata(ctx: JobExecutionContext): Promise<void> {
  const job = ctx.job
  const suggestion = await suggestMetadata(
    {
      description: job.data.params.description || '',
      samples: job.data.params.samples,
      input: job.data.params.problemInput,
      output: job.data.params.problemOutput,
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
        suggestion: {
          tags: suggestion.tags,
          difficulty: suggestion.difficulty,
          hint: suggestion.hint,
          timeLimit: suggestion.timeLimit,
          memoryLimit: suggestion.memoryLimit,
        },
      } as any,
      tokensUsed: suggestion.tokensUsed || 0,
    },
  })

  await createNotification({
    userId: job.data.userId,
    type: 'system',
    title: 'AI 元数据建议完成',
    content: '元数据建议已生成，可在任务详情中查看。',
  })

  job.status = 'completed'
}
