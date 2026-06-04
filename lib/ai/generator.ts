
import { logger } from '../logger';
import { createAiClient, getModelName, buildChatParams } from './factory'
import { getAiConfig, AiConfig } from './config'
import { promptLoader } from './prompts/loader'
import { GenerationMode, PromptContext, GeneratedProblem } from './prompts/core/types'
import { checkGeneratedProblem, checkTestDataQuality } from './quality-check'
import { safeJsonParse as _safeJsonParse } from './response-parser'

export interface GenerationParams {
  mode: 'parametric' | 'text_based' | 'test_data';
  // Parametric Mode Fields
  type?: string;
  difficulty?: string;
  topic?: string[];
  count?: number;
  additionalInfo?: string;

  // Text Based Mode Fields
  textInput?: string;
  textModeType?: 'clone' | 'similar';
  optimizeDescription?: boolean;

  // Test Data Gen Fields
  title?: string;
  description?: string;
  inputDescription?: string;
  outputDescription?: string;

  // Optional: Target problem ID for background auto-saving
  targetProblemId?: string;

  // Optional: Solution code for running test cases
  solutionCode?: string;
  solutionLanguage?: string;

  // ✅ New: Specific Model ID to use
  modelId?: string;

  // ✅ New: 内部重试标记（由后端 retry 路径传入，generator 据此走降温度路径）
  _retry?: boolean;
  _reduceTemperature?: boolean;
}

export interface GenerationResult {
  problems: GeneratedProblem[]; // Kept for compatibility, but might be empty for test_data
  testCases?: any[]; // New field for test data gen
  thought?: string;
  tokensUsed: number;
  /** 质量自检问题列表（仅记录，不阻塞导入） */
  qualityIssues?: Array<{ problemIndex: number; reason: string; details?: string[] }>;
}

function safeJsonParse(content: string): any {
  // safeJsonParse 已迁出到 ./response-parser，自动剥离 DeepSeek 思考块 + 6 步修复
  return _safeJsonParse(content)
}

/**
 * 判断错误是否属于"可重试"类型：
 *   - 429 限流
 *   - 5xx 服务端错误
 *   - 网络超时 / AbortError
 * 4xx 客户端错误（除 429）一律不重试
 */
function isRetryableError(err: any): boolean {
  const status = err?.status ?? err?.response?.status ?? err?.code
  // OpenAI SDK 错误对象上的 status
  if (typeof status === 'number') {
    if (status === 429) return true
    if (status >= 500 && status < 600) return true
    if (status === 408) return true
    return false
  }
  // 网络层错误：ECONNRESET / ETIMEDOUT / AbortError / fetch failed
  const code = err?.code || ''
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) return true
  const message = (err?.message || '').toLowerCase()
  if (message.includes('timeout') || message.includes('aborted') || message.includes('fetch failed')) return true
  return false
}

/**
 * 通用重试包装器
 *   - maxRetries：最多重试次数（不含首次）
 *   - backoffMs：首次重试前的等待（毫秒），后续按指数退避
 *   - 仅对 isRetryableError(err) 为 true 的错误重试
 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; backoffMs?: number; opName?: string } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 2
  const backoffMs = opts.backoffMs ?? 800
  const opName = opts.opName ?? 'AI call'

  let lastErr: any
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const retryable = isRetryableError(err)
      if (!retryable || attempt === maxRetries) {
        // 不可重试 或 已用尽重试次数
        if (retryable && attempt === maxRetries) {
          logger.warn(`[${opName}] 达到最大重试次数 ${maxRetries}，抛出最后错误`, {
            status: err?.status,
            code: err?.code,
            message: err?.message
          })
        }
        throw err
      }
      const wait = backoffMs * Math.pow(2, attempt)
      logger.warn(`[${opName}] 第 ${attempt + 1} 次失败，${wait}ms 后重试`, {
        status: err?.status,
        code: err?.code,
        message: err?.message
      })
      await new Promise(resolve => setTimeout(resolve, wait))
    }
  }
  throw lastErr
}

function mapToContext(params: GenerationParams): PromptContext {
    if (params.mode === 'test_data') {
        return {
            mode: GenerationMode.TEST_DATA_GEN,
            title: params.title || '',
            description: params.description || '',
            inputDescription: params.inputDescription || '',
            outputDescription: params.outputDescription || '',
            count: params.count || 5,
            hasSolution: !!params.solutionCode && !!params.solutionLanguage
        };
    } else if (params.mode === 'text_based') {
        if (params.textModeType === 'similar') {
            return {
                mode: GenerationMode.SIMILAR,
                textInput: params.textInput || ''
            };
        } else {
            // Default to Clone
            return {
                mode: GenerationMode.CLONE,
                textInput: params.textInput || '',
                optimizeDescription: params.optimizeDescription || false
            };
        }
    } else {
        return {
            mode: GenerationMode.PARAM_GEN,
            type: params.type || 'programming',
            difficulty: params.difficulty || '入门',
            topic: params.topic || [],
            count: params.count || 1,
            additionalInfo: params.additionalInfo
        };
    }
}

async function runThinkingStep(config: AiConfig, context: PromptContext): Promise<{ content: string, tokens: number }> {
    const client = createAiClient(config, true)
    const model = getModelName(config, true)

    // Use Loader to get isolated thinking prompt
    const prompt = promptLoader.getThinkingPrompt(context);

    // 修复：thinkingLevel=5 时温度上限 0.95，避免触发部分服务商的 2.0 上限
    const temperature = Math.min(0.95, 0.5 + config.thinkingLevel * 0.1)

    // 合并 config.params（DeepSeek v4 thinking 参数、topP 等透传）
    // 使用 buildChatParams 统一处理（自动注入 thinking / reasoning_effort）
    const baseParams = {
      model,
      messages: [{ role: 'user' as const, content: prompt }],
      temperature
    }
    const merged = buildChatParams(config, baseParams, true)

    // 使用 callWithRetry 包装（429/5xx/超时自动重试）
    // 注：buildChatParams 返回 Record<string, any> 以支持 DeepSeek 扩展字段（thinking 等），
    //     此处用 as any 兼容 OpenAI SDK 严格类型
    const response = await callWithRetry(
      () => client.chat.completions.create(merged as any),
      { maxRetries: 2, backoffMs: 800, opName: 'thinking-step' }
    )

    // DeepSeek v4 thinking 模式：思维链在 reasoning_content，主输出在 content
    // 优先读取 reasoning_content（如有），否则回退到 content
    const msg = response.choices[0].message as any
    const content = msg?.reasoning_content || msg?.content || ''

    return {
        content: typeof content === 'string' ? content : '',
        tokens: response.usage?.total_tokens || 0
    }
}

export async function generateProblems(params: GenerationParams, userId?: string): Promise<GenerationResult> {
  const config = await getAiConfig(userId, params.modelId)
  const context = mapToContext(params);
  
  let thoughtProcess = ''
  let totalTokens = 0

  if (config.enableThinking && context.mode !== GenerationMode.TEST_DATA_GEN) {
    try {
        logger.info('Starting Thinking Process...')
        const thinkingResult = await runThinkingStep(config, context)
        thoughtProcess = thinkingResult.content
        totalTokens += thinkingResult.tokens
        logger.info('Thinking Complete.')
    } catch (e) {
        logger.error('Thinking Model Failed, falling back to direct generation', e)
    }
  }

  // Use Loader to get isolated generation prompt
  const { systemPrompt, userPrompt, temperature } = promptLoader.getPrompt(context);

  const client = createAiClient(config, false)
  const model = getModelName(config, false)

  let finalUserPrompt = userPrompt;
  
  // Do NOT include thought process for CLONE mode
  // The thought process often contains sample analysis like "n=3 output ABC",
  // which confuses the LLM into thinking "3" is the input description.
  // For CLONE mode, we want pure extraction from the user input.
  if (thoughtProcess && context.mode !== GenerationMode.CLONE) {
      finalUserPrompt += `\n\nRefer to the following design analysis when generating the problems:\n${thoughtProcess}`
  }

  // 使用 buildChatParams 统一处理（自动注入 thinking / reasoning_effort + 透传 config.params）
  const baseParams = {
    model,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: finalUserPrompt },
    ],
    temperature: temperature,
    response_format: { type: 'json_object' as const },
    // DeepSeek 官方建议：合理设置 max_tokens 防止 JSON 字符串被中途截断
    // 出一道完整题（含样例、测试数据、双解法）通常 4000-8000 tokens
    max_tokens: 8192
  }

  // 尝试 1：标准调用，使用 callWithRetry 包装
  // 内部重试机制：解析失败时会用更低的温度 + 强提示再调一次
  const tryGenerate = async (userPromptOverride?: string, overrideTemp?: number): Promise<any> => {
    const params: any = userPromptOverride
      ? { ...baseParams, messages: [baseParams.messages[0], { role: 'user' as const, content: userPromptOverride }] }
      : baseParams
    // 重生成时降温度提高稳定性（调用方传 overrideTemp 优先）
    if (userPromptOverride) {
      params.temperature = overrideTemp !== undefined ? overrideTemp : 0.2
    }
    const merged = buildChatParams(config, params, false)
    // 注：buildChatParams 返回 Record<string, any> 以支持 DeepSeek 扩展字段（thinking 等），
    //     此处用 as any 兼容 OpenAI SDK 严格类型
    const response = await callWithRetry(
      () => client.chat.completions.create(merged as any),
      { maxRetries: 2, backoffMs: 800, opName: userPromptOverride ? 'ai-regen' : 'ai-generate' }
    )
    const msg = response.choices[0].message as any
    const content = msg?.content || msg?.reasoning_content || ''
    if (!content) {
      throw new Error('No content received from AI')
    }
    // 任务1：解析前打印原始 AI 响应前 200 字，便于排查 JSON 解析失败
    logger.debug('[generateProblems] raw AI response', {
      length: content.length,
      preview: content.substring(0, 200),
      hasThinkBlock: /<think>/i.test(content),
      hasMarkdown: /```/i.test(content)
    })
    totalTokens += response.usage?.total_tokens || 0
    return content
  }

  try {
    let content: string
    let parsed: any
    const baseTemperature = temperature
    // 解析失败重试梯度：每次降温度（0.8 → 0.2 → 0.0）
    const regenTemperatures = [0.2, 0.0]
    // 当前是用户主动重试（_retry=true）时，baseTemperature 已经从队列降过
    // 解析失败时再叠加 1-2 次内层重试
    let regenAttempts = 0
    while (true) {
      try {
        content = await tryGenerate()
        parsed = safeJsonParse(content)
        break
      } catch (e: any) {
        const isJsonError = e?.code === 'AI_PARSE_FAILED' ||
          (e instanceof Error && (e.message.startsWith('Failed to parse JSON') || e.message.includes('JSON.parse')))
        if (!isJsonError) throw e
        if (regenAttempts >= regenTemperatures.length) {
          // 已用尽所有内层重试
          logger.error('[generateProblems] 解析失败，已用尽内层重试', {
            attempts: regenAttempts,
            finalError: e?.message,
            preview: e?.info?.originalContent
          })
          throw e
        }
        const regenTemp = regenTemperatures[regenAttempts]
        logger.warn(`[generateProblems] JSON 解析失败，触发第 ${regenAttempts + 1} 次内层重试`, {
          temperature: regenTemp,
          code: e?.code,
          parseError: e?.info?.parseError,
          strippedThinkBlock: e?.info?.strippedThinkBlock,
          preview: e?.info?.originalContent
        })
        const regenPrompt = `${finalUserPrompt}\n\n【重要】你上一次的响应无法被解析为合法 JSON（${e?.info?.parseError || 'parse error'}）。请重新输出**严格合法闭合的 JSON 对象**，不要添加任何 markdown 标记（\`\`\`json 等）、不要添加 \`<think>\` 思考块、不要在 JSON 外添加任何解释文字。`
        content = await tryGenerate(regenPrompt, regenTemp)
        try {
          parsed = safeJsonParse(content)
          logger.info(`[generateProblems] 第 ${regenAttempts + 1} 次内层重试成功`)
          break
        } catch (e2: any) {
          regenAttempts++
          // 继续 while 循环再试
          if (regenAttempts >= regenTemperatures.length) {
            throw e2
          }
        }
      }
    }

    // Special handling for Test Data Gen
    if (context.mode === GenerationMode.TEST_DATA_GEN) {
        let testCases = [];
        if (parsed.test_cases && Array.isArray(parsed.test_cases)) {
            testCases = parsed.test_cases;
        } else if (Array.isArray(parsed)) {
            testCases = parsed;
        }

        // 质量自检
        const qc = checkTestDataQuality(testCases)
        const qualityIssues = qc.ok ? undefined : [{
          problemIndex: -1,
          reason: qc.reason || 'TestData 自检失败',
          details: qc.details
        }]
        if (!qc.ok) {
          logger.warn('[generateProblems] TestData 质量自检未通过', { reason: qc.reason, details: qc.details })
        }

        return {
            problems: [],
            testCases: testCases,
            thought: thoughtProcess,
            tokensUsed: totalTokens,
            qualityIssues
        }
    }

    let problems: GeneratedProblem[] = [];
    if (Array.isArray(parsed)) {
      problems = parsed;
    } else if (parsed.problems && Array.isArray(parsed.problems)) {
      problems = parsed.problems;
    } else {
      const values = Object.values(parsed);
      for (const val of values) {
        if (Array.isArray(val)) {
            problems = val as GeneratedProblem[];
            break;
        }
      }
    }

    if (problems.length === 0) {
        throw new Error('Invalid JSON structure returned by AI');
    }

    // Post-processing to handle potential field naming mismatches if LLM hallucinates
    const normalizedProblems = problems.map(p => ({
        ...p,
        input: p.input || (p as any).input_description || 'No input description',
        output: p.output || (p as any).output_description || 'No output description',
        time_limit: p.time_limit || 1000,
        memory_limit: p.memory_limit || 128
    }));

    // 质量自检：对每条 problem 调用 checkGeneratedProblem，失败项不阻塞但记录到 qualityIssues
    const qualityIssues: Array<{ problemIndex: number; reason: string; details?: string[] }> = []
    normalizedProblems.forEach((p, idx) => {
      const qc = checkGeneratedProblem(p)
      if (!qc.ok) {
        qualityIssues.push({
          problemIndex: idx,
          reason: qc.reason || '自检失败',
          details: qc.details
        })
      }
    })
    if (qualityIssues.length > 0) {
      logger.warn(`[generateProblems] 质量自检发现 ${qualityIssues.length} 条问题`, { issues: qualityIssues })
    }

    return {
        problems: normalizedProblems,
        thought: thoughtProcess,
        tokensUsed: totalTokens,
        qualityIssues: qualityIssues.length > 0 ? qualityIssues : undefined
    };

  } catch (error: any) {
    logger.error('AI Generation Error', error);
    // 透传 AI_PARSE_FAILED 的 code 与 info，让上层能识别
    if (error?.code === 'AI_PARSE_FAILED') {
      const err: any = new Error(error.message)
      err.code = 'AI_PARSE_FAILED'
      err.info = error.info
      throw err
    }
    throw error;
  }
}
