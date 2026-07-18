import { prisma } from '@/lib/prisma'
import { enqueueSolutionJob } from '../solution-queue'
import {
  deleteAiOfficialSolutionsForProblem,
  getOperatorForSolutionRegen,
  getProblemForSolutionRegeneration,
} from '@/lib/problem/service'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/api/withApi'
import type { MetadataSuggestionInput } from './types'
import { enqueueAiGeneration } from './generation'

/* ============================================================================
 * AI 题解生成 facade（统一入口，外部模块禁止绕过 service 直调 solution-queue）
 * ========================================================================== */

/**
 * 重新生成题目的 AI 官方题解
 *
 * 事务封装「删除旧 AI_OFFICIAL 题解 + 调 enqueueSolutionJob」：
 *  1. 校验操作者账号可用
 *  2. 校验题目存在
 *  3. 删除旧 AI_OFFICIAL 题解（保留同题 USER 题解）
 *  4. 入队新的 AI 题解生成任务
 *
 * 参考原 app/api/admin/problems/[id]/regenerate-solution/route.ts 内联逻辑
 */
export async function enqueueSolutionRegeneration(problemId: string, operatorId: string) {
  // 校验操作者账号可用（管理员权限已由 withApi.admin 校验）
  const operator = await getOperatorForSolutionRegen(operatorId)
  if (!operator) {
    throw new ApiError('NOT_FOUND', '操作者账号不存在', 404)
  }
  if (operator.isBanned) {
    throw new ApiError('FORBIDDEN', '账号不可用', 403)
  }

  // 读取题目
  const problem = await getProblemForSolutionRegeneration(problemId)
  if (!problem) {
    throw new ApiError('NOT_FOUND', '题目不存在', 404)
  }

  // 删除旧 AI_OFFICIAL 题解（保留同题的 USER 题解）
  const deleteResult = await deleteAiOfficialSolutionsForProblem(problemId)

  // 拼装 description（复用 solution-generator 输入）
  const description = [
    problem.description || '',
    problem.input ? `\n\n## 输入格式\n${problem.input}` : '',
    problem.output ? `\n\n## 输出格式\n${problem.output}` : '',
  ].join('')

  // 入队新的 AI 题解生成
  const { logId } = await enqueueSolutionJob({
    problemId: problem.id,
    title: problem.title,
    description,
    stdCode: problem.stdCode || undefined,
    stdLang: problem.stdLang || undefined,
    authorId: problem.authorId,
    triggeredBy: operatorId,
  })

  logger.info('[ai/service] 重新生成 AI 题解任务已入队', {
    problemId,
    logId,
    operatorId,
    oldAiSolutionsDeleted: deleteResult.count,
  })

  return { logId }
}

/**
 * 为新创建的题目入队 AI 题解生成（薄包装 enqueueSolutionJob）
 *
 * 承接 app/api/admin/problems/route.ts POST 流程：题目创建成功后自动入队 AI 题解生成。
 * AI 模块异常不影响题目落库（由调用方 try/catch 处理）。
 */
export async function enqueueSolutionForNewProblem(
  problemId: string,
  stdCode: string,
  stdLang: string,
  operatorId: string
) {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, title: true, description: true },
  })
  if (!problem) {
    throw new ApiError('NOT_FOUND', '题目不存在', 404)
  }

  return enqueueSolutionJob({
    problemId: problem.id,
    title: problem.title,
    description: problem.description,
    stdCode: stdCode || '',
    stdLang: stdLang || '',
    authorId: operatorId,
  })
}

/**
 * 取消 AI 任务（仅在 PENDING 状态生效）
 *
 * Prisma schema 的 AiGenerationLog.status 不支持 CANCELLED 枚举值，
 * 故标记为 FAILED 且 error='用户取消'。
 */
export async function cancelAiJob(logId: string) {
  const log = await prisma.aiGenerationLog.findUnique({ where: { id: logId } })
  if (!log) {
    throw new ApiError('NOT_FOUND', 'Log not found', 404)
  }
  if (log.status !== 'PENDING') {
    throw new ApiError(
      'INVALID_STATUS',
      `仅 PENDING 状态可取消，当前状态：${log.status}`,
      400
    )
  }
  await prisma.aiGenerationLog.update({
    where: { id: logId },
    data: { status: 'FAILED', error: '用户取消' },
  })
  return { logId, cancelled: true }
}

/* ============================================================================
 * AI 题目智能分析 / 元数据建议 facade（Phase 2 新能力）
 * ========================================================================== */

/**
 * 入队"题目智能分析"任务
 *
 * 通过 enqueueAiGeneration 入队（mode='analyze' + targetProblemId），
 * 队列 executeJob 会调 analyzeProblem 并写 AiGenerationLog.result（不写 Problem/Solution）。
 *
 * @param problemId 目标题目 ID
 * @param operatorId 操作者用户 ID（写入 log.userId）
 */
export async function enqueueProblemAnalysis(problemId: string, operatorId: string) {
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
    throw new ApiError('NOT_FOUND', '题目不存在', 404)
  }

  return enqueueAiGeneration(operatorId, {
    mode: 'analyze',
    targetProblemId: problemId,
    title: problem.title,
    description: problem.description,
    inputDescription: problem.input || undefined,
    outputDescription: problem.output || undefined,
  })
}

/**
 * 入队"元数据建议"任务
 *
 * 通过 enqueueAiGeneration 入队（mode='suggest_metadata' + 题目描述等字段），
 * 队列 executeJob 会调 suggestMetadata 并写 AiGenerationLog.result（不写 Problem/Solution）。
 *
 * @param input 题目描述 + 可选样例 / 输入格式 / 输出格式
 * @param operatorId 操作者用户 ID（写入 log.userId）
 */
export async function enqueueMetadataSuggestion(
  input: MetadataSuggestionInput,
  operatorId: string
) {
  if (!input.description || !input.description.trim()) {
    throw new ApiError('MISSING_FIELDS', 'input.description 必填', 400)
  }

  return enqueueAiGeneration(operatorId, {
    mode: 'suggest_metadata',
    description: input.description,
    samples: input.samples,
    // 题目本身的 input/output 字段映射到 problemInput/problemOutput
    // （避免与 test_data 模式的 inputDescription/outputDescription 混淆）
    problemInput: input.input,
    problemOutput: input.output,
  })
}
