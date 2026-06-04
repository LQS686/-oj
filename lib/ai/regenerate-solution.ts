import { logger } from '../logger'
import { createAiClient, getModelName, buildChatParams } from './factory'
import { getAiConfig } from './config'

/**
 * AI 修正标程 — 根据评测失败信息重新生成 solution
 *
 * 使用场景：
 *   - AI 生成的 solution_cpp 在评测时返回 WA / CE / TLE / RE / MLE
 *   - 上层（save-and-verify 等）调用本函数，附带失败信息与上一次的标程
 *   - DeepSeek 根据 prompt 重新生成完整可编译运行的代码
 *
 * 设计要点：
 *   - 复用 factory.ts 的 createAiClient / getModelName / buildChatParams，
 *     与 generator.ts 保持同一套 client 初始化与参数注入逻辑
 *   - 使用 callWithRetry 包装（429 / 5xx / 网络错误自动重试 2 次）
 *   - temperature 默认 0.2（修正场景对稳定性要求高于多样性）
 *   - max_tokens 4096（标程代码一般不超过 2K tokens，留余量）
 *   - prompt 中强制要求 markdown 代码块包裹（C++: ```cpp，Python: ```python），
 *     解析失败时直接抛错，由上层决定下一步
 */

export interface ProblemContext {
  title: string
  description: string
  input: string
  output: string
  samples: Array<{ input: string; output: string; explanation?: string }>
  previousSolution: string
  language: 'cpp' | 'python'
}

export interface FailureContext {
  judgeStatus: 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE'
  judgeMessage: string
  failedTest?: { input: string; expected: string; actual: string; testIndex: number }
}

export interface RegenerateOptions {
  modelId?: string
  temperature?: number
}

const SYSTEM_PROMPT =
  '你是算法竞赛标程修正专家。基于上一次的失败信息，给出能通过所有测试点的 C++17 标程。'

/**
 * 构造 user prompt — 严格按需求模板
 */
function buildUserPrompt(
  problem: ProblemContext,
  failure: FailureContext
): string {
  const samplesText = problem.samples
    .map((s, idx) => {
      const exp = s.explanation ? `\n  说明：${s.explanation}` : ''
      return `样例 ${idx + 1}：
  输入：
${s.input}
  输出：
${s.output}${exp}`
    })
    .join('\n\n')

  const failedTestBlock = failure.failedTest
    ? `
失败测试点 #${failure.failedTest.testIndex}：
  输入：
${failure.failedTest.input}
  期望输出：
${failure.failedTest.expected}
  你的实际输出：
${failure.failedTest.actual}
`
    : ''

  return `# 题目信息
标题：${problem.title}
题目描述：${problem.description}
输入格式：${problem.input}
输出格式：${problem.output}
样例：${samplesText}

# 上一次的标程
\`\`\`${problem.language}
${problem.previousSolution}
\`\`\`

# 上一次失败信息
评测状态：${failure.judgeStatus}
错误信息：${failure.judgeMessage}
${failedTestBlock}
# 任务
请基于以上失败信息，**修正**上一次的标程，输出**完整可编译运行的代码**（不是只输出修改片段）。
要求：
1. 严格按题目描述的输入输出格式读取和输出
2. 仔细分析 expected vs actual 的差异，定位 bug
3. 考虑边界条件（空输入、最大值、负数等）
4. 输出时用 markdown 代码块包裹：\`\`\`cpp ... \`\`\`

只输出修正后的完整代码块，不要在代码块外加任何解释。`
}

/**
 * 判断错误是否可重试（429 / 5xx / 网络层）
 */
function isRetryableError(err: any): boolean {
  const status = err?.status ?? err?.response?.status ?? err?.code
  if (typeof status === 'number') {
    if (status === 429) return true
    if (status >= 500 && status < 600) return true
    if (status === 408) return true
    return false
  }
  const code = err?.code || ''
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) return true
  const message = (err?.message || '').toLowerCase()
  if (message.includes('timeout') || message.includes('aborted') || message.includes('fetch failed')) return true
  return false
}

/**
 * 重试包装器 — 复用 generator.ts 的指数退避策略
 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; backoffMs?: number; opName?: string } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 2
  const backoffMs = opts.backoffMs ?? 800
  const opName = opts.opName ?? 'ai-regenerate-solution'

  let lastErr: any
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const retryable = isRetryableError(err)
      if (!retryable || attempt === maxRetries) {
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

/**
 * 从 AI 响应中提取 markdown 代码块。
 *
 * 优先匹配带语言标签的代码块（```cpp / ```python），
 * 匹配失败时回退到任意 ```...``` 块。
 * 仍未命中则返回 null。
 */
function extractCodeBlock(content: string, language: 'cpp' | 'python'): string | null {
  // 1. 优先匹配带语言标签的代码块
  const langPattern = new RegExp(
    '```' + language + '\\s*\\n([\\s\\S]*?)\\n```',
    'i'
  )
  const langMatch = content.match(langPattern)
  if (langMatch && langMatch[1]) {
    return langMatch[1].trim()
  }

  // 2. 回退到任意 markdown 代码块（无语言标签）
  const genericPattern = /```[a-zA-Z0-9]*\s*\n([\s\S]*?)\n```/
  const genericMatch = content.match(genericPattern)
  if (genericMatch && genericMatch[1]) {
    return genericMatch[1].trim()
  }

  // 3. 尝试匹配单行 ``` 围栏（无换行的极端情况）
  const inlinePattern = /```([\s\S]*?)```/
  const inlineMatch = content.match(inlinePattern)
  if (inlineMatch && inlineMatch[1]) {
    // 去掉可能的语言标签
    const inner = inlineMatch[1].replace(/^(cpp|python)\s*\n/i, '').trim()
    if (inner) return inner
  }

  return null
}

/**
 * AI 修正标程主函数
 *
 * @param problemContext  题目上下文（标题、描述、IO 格式、样例、上一次标程）
 * @param failureContext  评测失败信息（状态、错误信息、可选的失败测试点）
 * @param options         可选参数（modelId / temperature）
 * @returns               修正后的完整代码字符串
 *
 * @throws Error
 *   - AI 配置缺失
 *   - AI 调用失败（含重试耗尽）
 *   - AI 响应未包含 markdown 代码块
 */
export async function regenerateSolution(
  problemContext: ProblemContext,
  failureContext: FailureContext,
  options?: RegenerateOptions
): Promise<string> {
  const temperature = options?.temperature ?? 0.2
  const modelId = options?.modelId

  try {
    // 1. 加载 AI 配置（与 generator.ts 保持一致）
    const config = await getAiConfig(undefined, modelId)
    const client = createAiClient(config, false)
    const model = getModelName(config, false)

    // 2. 构造 prompt
    const userPrompt = buildUserPrompt(problemContext, failureContext)

    // 3. 构造 chat params（透传 config.params + thinking 注入）
    const baseParams = {
      model,
      messages: [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        { role: 'user' as const, content: userPrompt }
      ],
      temperature,
      max_tokens: 4096
    }
    const merged = buildChatParams(config, baseParams, false)

    logger.info('[regenerateSolution] 开始调用 AI 修正标程', {
      model,
      temperature,
      judgeStatus: failureContext.judgeStatus,
      hasFailedTest: !!failureContext.failedTest,
      language: problemContext.language,
      promptLength: userPrompt.length
    })

    // 4. 调用（带重试）
    const response = await callWithRetry(
      () => client.chat.completions.create(merged as any),
      { maxRetries: 2, backoffMs: 800, opName: 'ai-regenerate-solution' }
    )

    // 5. 提取 markdown content
    const msg = response.choices[0]?.message as any
    const content: string = (msg?.content || msg?.reasoning_content || '').toString()
    if (!content) {
      throw new Error('AI 响应为空')
    }

    logger.debug('[regenerateSolution] AI 原始响应', {
      length: content.length,
      preview: content.substring(0, 200)
    })

    // 6. 提取代码块
    const code = extractCodeBlock(content, problemContext.language)
    if (!code) {
      logger.error('[regenerateSolution] AI 响应未包含代码块', {
        contentLength: content.length,
        contentPreview: content.substring(0, 500),
        expectedLanguage: problemContext.language
      })
      throw new Error('AI 响应未包含代码块')
    }

    logger.info('[regenerateSolution] 修正标程生成成功', {
      codeLength: code.length,
      language: problemContext.language
    })

    return code
  } catch (error: any) {
    logger.error('[regenerateSolution] 修正标程失败', {
      judgeStatus: failureContext.judgeStatus,
      language: problemContext.language,
      error: error?.message,
      code: error?.code
    })
    // 透传原始 Error 信息
    if (error instanceof Error) {
      throw error
    }
    throw new Error(error?.message || 'regenerateSolution failed')
  }
}
