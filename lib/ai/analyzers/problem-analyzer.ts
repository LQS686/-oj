/**
 * lib/ai/analyzers/problem-analyzer.ts
 *
 * 题目智能分析：调 AI 对题目做 5 维度只读评估
 *
 * 复用 ParamGen 的客户端 / 重试 / 解析机制：
 *   - createAiClient / buildChatParams（来自 factory）
 *   - safeJsonParse（来自 response-parser）
 *   - callWithRetry（来自 generator）
 *   - response_format: { type: 'json_object' } 强制 JSON 输出
 *   - 失败时梯度重试（温度 0.2 → 0.0，最多 2 次）
 */
import { logger } from '@/lib/logger'
import { createAiClient, getModelName, buildChatParams } from '@/lib/ai/factory'
import { getAiConfig } from '@/lib/ai/config'
import { safeJsonParse } from '@/lib/ai/response-parser'
import { callWithRetry } from '@/lib/ai/generator'
import {
  buildAnalyzePrompt,
  type AnalyzePromptInput,
  type AnalysisResult,
} from './prompts/analyze-prompt'

export type { AnalysisResult, AnalyzePromptInput }

export interface AnalyzeOptions {
  userId?: string
  modelId?: string
}

/**
 * 分析输出（AnalysisResult + 调用消耗的 tokens）
 *
 * tokensUsed 由调用方写入 AiGenerationLog.tokensUsed。
 * AnalysisResult 是只读分析结果，写入 AiGenerationLog.result.analysis。
 */
export interface AnalyzeOutput extends AnalysisResult {
  tokensUsed: number
}

/**
 * 题目智能分析
 *
 * @param problem 完整 Problem 对象（含 description / samples / tags / difficulty / stdCode / stdLang）
 * @param options.userId 用于解析 AI 模型偏好（modelId 缺省时回退到用户偏好）
 * @param options.modelId 指定模型 ID
 * @returns AnalyzeOutput（AnalysisResult + tokensUsed）
 */
export async function analyzeProblem(
  problem: AnalyzePromptInput,
  options: AnalyzeOptions = {}
): Promise<AnalyzeOutput> {
  const config = await getAiConfig(options.userId, options.modelId)
  const { systemPrompt, userPrompt } = buildAnalyzePrompt(problem)

  const client = createAiClient(config, false)
  const model = getModelName(config, false)
  const baseTemperature = (config as any).temperature ?? 0.2

  let totalTokens = 0

  /**
   * 单次 AI 调用（支持 prompt 覆盖 + 温度覆盖，用于 JSON 解析失败后的梯度重试）
   */
  const tryAnalyze = async (
    promptOverride?: string,
    overrideTemp?: number
  ): Promise<string> => {
    const temperature = promptOverride
      ? (overrideTemp !== undefined ? overrideTemp : 0.2)
      : Math.min(baseTemperature, 0.2)
    const userContent = promptOverride || userPrompt
    const baseParams = {
      model,
      messages: [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userContent },
      ],
      temperature,
      response_format: { type: 'json_object' as const },
      // 分析任务输出较短（5 个字段），4K tokens 足够
      max_tokens: (config as any).maxTokens ? Math.min((config as any).maxTokens, 4096) : 4096,
    }
    const merged = buildChatParams(config, baseParams, false)
    const response = await callWithRetry(
      () => client.chat.completions.create(merged as any),
      { maxRetries: 2, backoffMs: 800, opName: promptOverride ? 'ai-analyze-regen' : 'ai-analyze' }
    )
    if (!response.choices?.length) {
      throw new Error('AI analyze 返回空 choices 数组')
    }
    const msg = response.choices[0].message as any
    const content = msg?.content || msg?.reasoning_content || ''
    if (!content) {
      throw new Error('No content received from AI (analyze)')
    }
    totalTokens += response.usage?.total_tokens || 0
    return content
  }

  // 梯度重试温度（JSON 解析失败时）：0.2 → 0.0，最多 2 次
  const regenTemperatures = [0.2, 0.0]
  let content: string
  let parsed: any
  let regenAttempts = 0

  try {
    content = await tryAnalyze()
    parsed = safeJsonParse(content)
  } catch (e: any) {
    const isJsonError =
      e?.code === 'AI_PARSE_FAILED' ||
      (e instanceof Error &&
        (e.message.startsWith('Failed to parse JSON') || e.message.includes('JSON.parse')))
    if (!isJsonError) {
      // 透传 AI_PARSE_FAILED 的 code 与 info（与 generateProblems 一致）
      if (e?.code === 'AI_PARSE_FAILED') {
        const err: any = new Error(e.message)
        err.code = 'AI_PARSE_FAILED'
        err.info = e.info
        throw err
      }
      throw e
    }

    // 梯度重试
    while (regenAttempts < regenTemperatures.length) {
      const regenTemp = regenTemperatures[regenAttempts]
      logger.warn(`[analyzeProblem] JSON 解析失败，触发第 ${regenAttempts + 1} 次重试`, {
        temperature: regenTemp,
        parseError: e?.info?.parseError,
        preview: e?.info?.originalContent,
      })
      const regenPrompt = `${userPrompt}\n\n【重要】你上一次的响应无法被解析为合法 JSON（${e?.info?.parseError || 'parse error'}）。请重新输出**严格合法闭合的 JSON 对象**，不要添加任何 markdown 标记（\`\`\`json 等）、不要添加 \`<think>\` 思考块、不要在 JSON 外添加任何解释文字。`
      try {
        content = await tryAnalyze(regenPrompt, regenTemp)
        parsed = safeJsonParse(content)
        logger.info(`[analyzeProblem] 第 ${regenAttempts + 1} 次重试成功`)
        break
      } catch (e2: any) {
        const isJsonError2 =
          e2?.code === 'AI_PARSE_FAILED' ||
          (e2 instanceof Error &&
            (e2.message.startsWith('Failed to parse JSON') || e2.message.includes('JSON.parse')))
        if (!isJsonError2) {
          throw e2
        }
        regenAttempts++
        if (regenAttempts >= regenTemperatures.length) {
          // 透传最后一次解析失败的 info
          const err: any = new Error(e2.message)
          err.code = 'AI_PARSE_FAILED'
          err.info = e2.info
          throw err
        }
      }
    }
  }

  // 兜底：循环正常退出但 parsed 未赋值（理论不可达，因为失败会 throw）
  if (!parsed) {
    throw new Error('analyzeProblem: parsed is undefined after all retries')
  }

  // 字段归一化（兜底缺失字段 + 类型强制）
  const result: AnalyzeOutput = {
    suggestedTags: Array.isArray(parsed.suggestedTags)
      ? parsed.suggestedTags.map((t: any) => String(t))
      : [],
    suggestedDifficulty:
      typeof parsed.suggestedDifficulty === 'string' ? parsed.suggestedDifficulty : '',
    qualityIssues: Array.isArray(parsed.qualityIssues)
      ? parsed.qualityIssues.map((t: any) => String(t))
      : [],
    suggestedHints: Array.isArray(parsed.suggestedHints)
      ? parsed.suggestedHints.map((t: any) => String(t))
      : [],
    testCaseGaps: Array.isArray(parsed.testCaseGaps)
      ? parsed.testCaseGaps.map((t: any) => String(t))
      : [],
    tokensUsed: totalTokens,
  }

  return result
}
