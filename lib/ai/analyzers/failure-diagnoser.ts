/**
 * lib/ai/analyzers/failure-diagnoser.ts
 *
 * 失败自动诊断（Task 30.1）
 *
 * 分析 FAILED 任务的 error / result.parseError / result.qualityIssues，
 * 调用轻量 AI 返回 { failureType, suggestedFix }。
 *
 * 复用 problem-analyzer.ts 的客户端 / 重试 / 解析机制：
 *   - createAiClient / buildChatParams（来自 factory）
 *   - safeJsonParse（来自 response-parser）
 *   - callWithRetry（来自 generator）
 *   - response_format: { type: 'json_object' } 强制 JSON 输出
 */
import { logger } from '@/lib/logger'
import { createAiClient, getModelName, buildChatParams } from '@/lib/ai/factory'
import { getAiConfig } from '@/lib/ai/config'
import { safeJsonParse } from '@/lib/ai/response-parser'
import { callWithRetry } from '@/lib/ai/generator'
import { buildDiagnosePrompt, type DiagnosisResult } from './prompts/diagnose-prompt'

export type { DiagnosisResult }

export interface DiagnoseOptions {
  userId?: string
  modelId?: string
  /** 近 7 天同 promptHash 失败任务数（由调用方查询后传入，Task 39.4） */
  similarFailureCount?: number
}

export interface DiagnoseOutput extends DiagnosisResult {
  tokensUsed: number
}

/**
 * 诊断失败任务的错误原因
 *
 * @param input 原任务的错误信息（error / parseError / qualityIssues / promptHash）
 * @param options.userId 用于解析 AI 模型偏好
 * @param options.modelId 指定模型 ID
 * @returns DiagnoseOutput（DiagnosisResult + tokensUsed）
 */
export async function diagnoseFailure(
  input: {
    error: string
    originalMode: string
    parseError?: string
    qualityIssues?: string[]
    promptHash?: string
  },
  options: DiagnoseOptions = {}
): Promise<DiagnoseOutput> {
  const config = await getAiConfig(options.userId, options.modelId)
  const { systemPrompt, userPrompt } = buildDiagnosePrompt({
    ...input,
    similarFailureCount: options.similarFailureCount,
  })

  const client = createAiClient(config, false)
  const model = getModelName(config, false)
  const baseTemperature = (config as any).temperature ?? 0.2

  let totalTokens = 0

  const tryDiagnose = async (
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
      max_tokens: (config as any).maxTokens ? Math.min((config as any).maxTokens, 2048) : 2048,
    }
    const merged = buildChatParams(config, baseParams, false)
    const response = await callWithRetry(
      () => client.chat.completions.create(merged as any),
      { maxRetries: 2, backoffMs: 800, opName: promptOverride ? 'ai-diagnose-regen' : 'ai-diagnose' }
    )
    if (!response.choices?.length) {
      throw new Error('AI diagnose 返回空 choices 数组')
    }
    const msg = response.choices[0].message as any
    const content = msg?.content || msg?.reasoning_content || ''
    if (!content) {
      throw new Error('No content received from AI (diagnose)')
    }
    totalTokens += response.usage?.total_tokens || 0
    return content
  }

  // 单次调用 + 解析失败梯度重试（0.2 → 0.0）
  const regenTemperatures = [0.2, 0.0]
  let content: string
  let parsed: any
  let regenAttempts = 0

  try {
    content = await tryDiagnose()
    parsed = safeJsonParse(content)
  } catch (e: any) {
    const isJsonError =
      e?.code === 'AI_PARSE_FAILED' ||
      (e instanceof Error &&
        (e.message.startsWith('Failed to parse JSON') || e.message.includes('JSON.parse')))
    if (!isJsonError) {
      // 诊断失败不阻塞主流程，返回 UNKNOWN
      logger.warn('[diagnoseFailure] 非解析错误，返回 UNKNOWN', { error: e?.message })
      return {
        failureType: 'UNKNOWN',
        suggestedFix: `诊断过程出错：${e?.message || '未知错误'}。建议手动检查原任务错误信息。`,
        analysis: `诊断器异常：${e?.message || String(e)}`,
        tokensUsed: totalTokens,
      }
    }

    // 梯度重试
    while (regenAttempts < regenTemperatures.length) {
      const regenTemp = regenTemperatures[regenAttempts]
      logger.warn(`[diagnoseFailure] JSON 解析失败，触发第 ${regenAttempts + 1} 次重试`, {
        temperature: regenTemp,
      })
      const regenPrompt = `${userPrompt}\n\n【重要】请重新输出严格合法闭合的 JSON 对象，不要添加任何 markdown 标记。`
      try {
        content = await tryDiagnose(regenPrompt, regenTemp)
        parsed = safeJsonParse(content)
        break
      } catch (e2: any) {
        regenAttempts++
        if (regenAttempts >= regenTemperatures.length) {
          // 诊断失败不阻塞，返回 UNKNOWN
          logger.warn('[diagnoseFailure] 重试用尽，返回 UNKNOWN', { error: e2?.message })
          return {
            failureType: 'UNKNOWN',
            suggestedFix: '诊断器无法解析 AI 返回，建议手动检查原任务错误信息并重试。',
            analysis: `诊断器解析失败：${e2?.message || String(e2)}`,
            tokensUsed: totalTokens,
          }
        }
      }
    }
  }

  if (!parsed) {
    return {
      failureType: 'UNKNOWN',
      suggestedFix: '诊断器未返回有效结果，建议手动检查原任务错误信息。',
      tokensUsed: totalTokens,
    }
  }

  // 字段归一化
  const validTypes = ['PARSE_ERROR', 'API_ERROR', 'TIMEOUT', 'QUALITY_FAIL', 'CONTENT_EMPTY', 'UNKNOWN']
  const failureType = validTypes.includes(parsed.failureType)
    ? parsed.failureType
    : 'UNKNOWN'

  const result: DiagnoseOutput = {
    failureType: failureType as DiagnosisResult['failureType'],
    suggestedFix:
      typeof parsed.suggestedFix === 'string' && parsed.suggestedFix.trim()
        ? parsed.suggestedFix.trim()
        : '建议重试任务或切换模型。',
    analysis: typeof parsed.analysis === 'string' ? parsed.analysis.trim() : undefined,
    similarFailureCount: options.similarFailureCount,
    tokensUsed: totalTokens,
  }

  return result
}
