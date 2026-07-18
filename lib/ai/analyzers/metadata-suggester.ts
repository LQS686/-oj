/**
 * lib/ai/analyzers/metadata-suggester.ts
 *
 * 元数据建议：调 AI 基于题目描述生成 tags / difficulty / hint / timeLimit / memoryLimit
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
  buildSuggestMetadataPrompt,
  type SuggestMetadataPromptInput,
  type MetadataSuggestion,
} from './prompts/suggest-metadata-prompt'

export type { MetadataSuggestion, SuggestMetadataPromptInput }

export interface SuggestMetadataOptions {
  userId?: string
  modelId?: string
}

/**
 * 元数据建议输出（MetadataSuggestion + 调用消耗的 tokens）
 */
export interface SuggestMetadataOutput extends MetadataSuggestion {
  tokensUsed: number
}

/**
 * 元数据建议
 *
 * @param input 题目描述 + 可选样例 / 输入格式 / 输出格式
 * @param options.userId 用于解析 AI 模型偏好
 * @param options.modelId 指定模型 ID
 * @returns SuggestMetadataOutput（MetadataSuggestion + tokensUsed）
 */
export async function suggestMetadata(
  input: SuggestMetadataPromptInput,
  options: SuggestMetadataOptions = {}
): Promise<SuggestMetadataOutput> {
  const config = await getAiConfig(options.userId, options.modelId)
  const { systemPrompt, userPrompt } = buildSuggestMetadataPrompt(input)

  const client = createAiClient(config, false)
  const model = getModelName(config, false)
  const baseTemperature = (config as any).temperature ?? 0.2

  let totalTokens = 0

  /**
   * 单次 AI 调用（支持 prompt 覆盖 + 温度覆盖，用于 JSON 解析失败后的梯度重试）
   */
  const trySuggest = async (
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
      // 元数据建议输出短（5 个字段），2K tokens 足够
      max_tokens: (config as any).maxTokens ? Math.min((config as any).maxTokens, 2048) : 2048,
    }
    const merged = buildChatParams(config, baseParams, false)
    const response = await callWithRetry(
      () => client.chat.completions.create(merged as any),
      {
        maxRetries: 2,
        backoffMs: 800,
        opName: promptOverride ? 'ai-suggest-metadata-regen' : 'ai-suggest-metadata',
      }
    )
    if (!response.choices?.length) {
      throw new Error('AI suggest-metadata 返回空 choices 数组')
    }
    const msg = response.choices[0].message as any
    const content = msg?.content || msg?.reasoning_content || ''
    if (!content) {
      throw new Error('No content received from AI (suggest-metadata)')
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
    content = await trySuggest()
    parsed = safeJsonParse(content)
  } catch (e: any) {
    const isJsonError =
      e?.code === 'AI_PARSE_FAILED' ||
      (e instanceof Error &&
        (e.message.startsWith('Failed to parse JSON') || e.message.includes('JSON.parse')))
    if (!isJsonError) {
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
      logger.warn(
        `[suggestMetadata] JSON 解析失败，触发第 ${regenAttempts + 1} 次重试`,
        {
          temperature: regenTemp,
          parseError: e?.info?.parseError,
          preview: e?.info?.originalContent,
        }
      )
      const regenPrompt = `${userPrompt}\n\n【重要】你上一次的响应无法被解析为合法 JSON（${e?.info?.parseError || 'parse error'}）。请重新输出**严格合法闭合的 JSON 对象**，不要添加任何 markdown 标记（\`\`\`json 等）、不要添加 \`<think>\` 思考块、不要在 JSON 外添加任何解释文字。`
      try {
        content = await trySuggest(regenPrompt, regenTemp)
        parsed = safeJsonParse(content)
        logger.info(`[suggestMetadata] 第 ${regenAttempts + 1} 次重试成功`)
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
          const err: any = new Error(e2.message)
          err.code = 'AI_PARSE_FAILED'
          err.info = e2.info
          throw err
        }
      }
    }
  }

  if (!parsed) {
    throw new Error('suggestMetadata: parsed is undefined after all retries')
  }

  // 字段归一化（兜底缺失字段 + 类型强制）
  const result: SuggestMetadataOutput = {
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: any) => String(t)) : [],
    difficulty: typeof parsed.difficulty === 'string' ? parsed.difficulty : '',
    hint: typeof parsed.hint === 'string' ? parsed.hint : '',
    timeLimit: typeof parsed.timeLimit === 'number' && parsed.timeLimit > 0 ? parsed.timeLimit : 1000,
    memoryLimit:
      typeof parsed.memoryLimit === 'number' && parsed.memoryLimit > 0
        ? parsed.memoryLimit
        : 128,
    tokensUsed: totalTokens,
  }

  return result
}
