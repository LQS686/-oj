
import { logger } from '../logger';
import { createAiClient, getModelName, buildChatParams } from './factory'
import type { AiConfig } from './config';
import { getAiConfig } from './config'
import { promptLoader } from './prompts/loader'
import type { PromptContext, GeneratedProblem } from './prompts/core/types';
import { GenerationMode } from './prompts/core/types'
import { checkGeneratedProblem, checkTestDataQuality } from './quality-check'
import { safeJsonParse as _safeJsonParse } from './response-parser'

export interface GenerationParams {
  mode: 'parametric' | 'test_data';
  // Parametric Mode Fields
  type?: string;
  difficulty?: string;
  topic?: string[];
  count?: number;
  additionalInfo?: string;

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

  // ✅ New: 内部重试标记（由 route.ts retry 路径传入，generator 据此走降温度路径）
  // _reduceTemperature: true → 基础温度 cap 到 0.2（适合 JSON 解析失败后的重试）
  // _retry: true → 标记这是重试（仅用于日志/审计，generator 当前不消费）
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
 * 从 AI 响应中提取 problems 数组
 *
 * 关键修复：避免把 test_cases 数组误识别为 problems
 * 1) 顶层是数组：直接用
 * 2) 顶层有 problems 字段（数组）：用之
 * 3) 顶层有 problems 字段（单对象）：包成 [problems]
 * 4) 否则视为单道题，把顶层对象包成 [parsed]
 * 5) 顶层是 null/undefined/标量：抛错
 */
export function extractProblems(parsed: any): GeneratedProblem[] {
  if (Array.isArray(parsed)) {
    return parsed as GeneratedProblem[]
  }
  if (parsed && typeof parsed === 'object') {
    // 显式 problems 字段：可能是数组或单对象（AI 偶尔会犯这种错）
    if ('problems' in parsed) {
      if (Array.isArray(parsed.problems)) {
        return parsed.problems as GeneratedProblem[]
      }
      if (parsed.problems && typeof parsed.problems === 'object') {
        return [parsed.problems as GeneratedProblem]
      }
    }
    // 顶层是单道题对象，包成数组
    return [parsed as GeneratedProblem]
  }
  throw new Error('Invalid JSON structure returned by AI: not an object or array')
}

/**
 * 单道题字段归一化
 *
 * - camelCase → snake_case 兜底（AI 偶尔输出 testCases/solutionCpp 等驼峰）
 * - 缺 time_limit → 1000，缺 memory_limit → 128
 * - input/output 兜底 input_description/output_description
 */
export function normalizeProblem(p: any): any {
  const camelToSnakeMap: Record<string, string> = {
    testCases: 'test_cases',
    timeLimit: 'time_limit',
    memoryLimit: 'memory_limit',
    solutionCpp: 'solution_cpp',
    solutionPython: 'solution_python',
    inputDescription: 'input',
    outputDescription: 'output'
  }
  const normalized: any = { ...p }
  for (const [camel, snake] of Object.entries(camelToSnakeMap)) {
    if (normalized[snake] === undefined && normalized[camel] !== undefined) {
      normalized[snake] = normalized[camel]
    }
  }
  normalized.input = normalized.input || normalized.input_description || ''
  normalized.output = normalized.output || normalized.output_description || ''
  normalized.time_limit = normalized.time_limit || 1000
  normalized.memory_limit = normalized.memory_limit || 128
  return normalized
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
    }
    // 默认 ParamGen（AI 出题）
    return {
        mode: GenerationMode.PARAM_GEN,
        type: params.type || 'programming',
        difficulty: params.difficulty || '入门',
        topic: params.topic || [],
        count: params.count || 1,
        additionalInfo: params.additionalInfo
    };
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
    // thinking 模式下思维链会消耗大量 tokens，需给足预算（32768）
    const baseParams = {
      model,
      messages: [{ role: 'user' as const, content: prompt }],
      temperature,
      max_tokens: (config as any).maxTokens ? (config as any).maxTokens * 2 : 32768
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
    // 与生成步骤保持一致：优先读 content（最终输出），仅当 content 为空时回退到 reasoning_content（原始思维链）
    // thinking prompt 要求结构化设计分析，该分析在 content 中
    const content = msg?.content || msg?.reasoning_content || ''

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
  const { systemPrompt, userPrompt, temperature: promptTemperature } = promptLoader.getPrompt(context);
  // 优先使用 config.temperature（模型级配置），未配置时回退到 prompt generator 的默认温度
  const temperature = (config as any).temperature ?? promptTemperature

  const client = createAiClient(config, false)
  const model = getModelName(config, false)

  let finalUserPrompt = userPrompt;

  // 思考过程（design analysis）作为参考追加到 user prompt
  // 注意：仅 ParamGen 模式会运行 thinking（TEST_DATA_GEN 已在上方跳过）
  if (thoughtProcess) {
      finalUserPrompt += `\n\n# 参考：以下为资深命题人对本题的设计分析（请作为思路参考，最终题目要符合用户原始要求）\n${thoughtProcess}`
  }

  // 使用 buildChatParams 统一处理（自动注入 thinking / reasoning_effort + 透传 config.params）
  // 重试场景：_reduceTemperature=true 时，基础温度下调到 0.2（更稳的 JSON 输出）
  const effectiveBaseTemperature = params._reduceTemperature
    ? Math.min(temperature, 0.2)
    : temperature
  const baseParams = {
    model,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: finalUserPrompt },
    ],
    temperature: effectiveBaseTemperature,
    response_format: { type: 'json_object' as const },
    // 出 1 道完整题（15 组测试数据 + 双解法）通常 4000-9000 tokens；
    // 出 2-3 道时叠加。thinking 模式下思维链会额外消耗大量 tokens，
    // 给到 32768 防止长响应被截断（buildChatParams 已保护此字段不被 config.params 覆盖）。
    // thinking 模式下思维链会额外消耗大量 tokens，放大 2 倍预算
    max_tokens: (config as any).maxTokens ? (config as any).maxTokens * 2 : 32768
  }

  // 尝试 1：标准调用，使用 callWithRetry 包装
  // 内部重试机制：解析失败时会用更低的温度 + 强提示再调一次
  // 重试时通过 disableThinking=true 关闭 thinking 模式，避免思维链再次消耗 tokens 导致截断
  const tryGenerate = async (userPromptOverride?: string, overrideTemp?: number, disableThinking = false): Promise<any> => {
    const params: any = userPromptOverride
      ? { ...baseParams, messages: [baseParams.messages[0], { role: 'user' as const, content: userPromptOverride }] }
      : baseParams
    // 重生成时降温度提高稳定性（调用方传 overrideTemp 优先）
    if (userPromptOverride) {
      params.temperature = overrideTemp !== undefined ? overrideTemp : 0.2
    }
    // 重试时禁用 thinking：构建临时 config 副本，清空 params.thinking
    const effectiveConfig = disableThinking
      ? (() => {
          const paramsCopy = { ...(config.params || {}) }
          delete paramsCopy.thinking
          return { ...config, params: { ...paramsCopy, reasoning_effort: 'low' } }
        })()
      : config
    const merged = buildChatParams(effectiveConfig, params, false)
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
          hint: e?.info?.hint,
          preview: e?.info?.originalContent
        })
        const regenPrompt = `${finalUserPrompt}\n\n【重要】你上一次的响应无法被解析为合法 JSON（${e?.info?.parseError || 'parse error'}）。请重新输出**严格合法闭合的 JSON 对象**，不要添加任何 markdown 标记（\`\`\`json 等）、不要添加 \`<think>\` 思考块、不要在 JSON 外添加任何解释文字。`
        // 重试时禁用 thinking 模式：截断通常是 thinking 消耗 tokens 所致，关闭 thinking 让全部预算用于 JSON 输出
        content = await tryGenerate(regenPrompt, regenTemp, true)
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
        // 优先 snake_case；同时兜底 camelCase（AI 偶尔会犯这种错）
        const tcs = parsed.test_cases ?? parsed.testCases
        if (Array.isArray(tcs)) {
            testCases = tcs
        } else if (Array.isArray(parsed)) {
            testCases = parsed
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

    // ⚠️ 修复：避免把 test_cases 数组误识别为 problems
    // 1) 顶层是数组：直接用
    // 2) 顶层有 problems 字段（数组）：用之
    // 3) 否则视为单道题，把顶层对象包成 [parsed]
    problems = extractProblems(parsed)
    if (problems.length === 0) {
        throw new Error('Invalid JSON structure returned by AI: empty problems array')
    }

    // Post-processing to handle potential field naming mismatches if LLM hallucinates
    // camelCase → snake_case 兜底，避免字段名错误导致 test_cases=0、solution_cpp 丢失
    const normalizedProblems = problems.map(p => normalizeProblem(p))

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
