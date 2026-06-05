/**
 * AI 题解生成器
 *
 * 基于题目描述 + 标程代码 + 语言，调用 AI 生成结构化题解文章（markdown）。
 *
 * 设计要点：
 * 1. 输出格式采用 JSON（response_format: json_object），保证结构稳定 + 复用 safeJsonParse
 * 2. Prompt 严格指定 5 段式结构（思路 / 算法 / 复杂度 / 参考代码 / 关键点）
 * 3. 复用 generator.ts 的 createAiClient / getModelName / buildChatParams
 * 4. 失败抛错，错误由上层 queue 捕获并写入 AiGenerationLog
 */

import { logger } from '../logger'
import { createAiClient, getModelName, buildChatParams } from './factory'
import { getAiConfig } from './config'
import { safeJsonParse } from './response-parser'

export interface SolutionGenerationParams {
  /** 题目 ID（用于日志关联） */
  problemId: string
  /** 题目标题 */
  title: string
  /** 题目描述（markdown 原文，含 input/output/样例） */
  description: string
  /** 标程代码（用于解读算法） */
  stdCode?: string
  /** 标程语言（cpp / python / java / go / javascript 等） */
  stdLang?: string
  /** 可选：指定 AI 模型 ID（覆盖用户默认偏好） */
  modelId?: string
  /** 题解创建者 ID（题目作者），写入 Solution.authorId */
  authorId: string
}

export interface SolutionGenerationResult {
  /** 完整题解内容（markdown 格式） */
  content: string
  /** 标程语言（来自 stdLang 或 AI 推断） */
  language?: string
  /** 本次调用消耗的 tokens */
  tokensUsed: number
}

/**
 * 判断错误是否可重试（与 generator.ts 同款策略）：
 *   - 429 / 5xx / 408 / 网络层错误 → 重试
 *   - 4xx 客户端错误（除 429）→ 不重试
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

async function callWithRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; backoffMs?: number; opName?: string } = {}
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 2
  const backoffMs = opts.backoffMs ?? 800
  const opName = opts.opName ?? 'AI solution call'

  let lastErr: any
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      const retryable = isRetryableError(err)
      if (!retryable || attempt === maxRetries) {
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

const SYSTEM_PROMPT = `你是一位资深的算法竞赛选手与教学者，擅长把题目解法讲得清晰、有条理。

# 你的任务
- 阅读用户给出的【题目描述】与【标程代码】
- 按下方【题解结构】输出严格 5 段式 markdown 题解
- 严格按 JSON 格式返回（不要使用 \`\`\`json 包裹，不要在 JSON 外添加任何文字）

# 题解结构（5 段，必须全部出现，使用 H2 标题 ## 分隔）
1. ## 思路分析
   - 解释为什么选择该算法（如：观察数据范围 / 贪心 / DP / 最短路等）
   - 指出题目的关键约束如何决定算法选型
2. ## 算法描述
   - 用分步骤的方式描述算法执行过程
   - 必要时使用列表 / 子标题展开
3. ## 复杂度分析
   - 给出时间复杂度（大 O 表示，附推导）
   - 给出空间复杂度（大 O 表示，附推导）
4. ## 参考代码
   - 用 \`\`\`<语言>\n...code...\n\`\`\` markdown 代码块包裹完整代码
   - 保留标程原始语言（C++ / Python / Java / Go / JavaScript 等）
   - 代码须可编译或可运行，关键变量需有简短注释
5. ## 关键点说明
   - 列出本题的易错点、边界情况、常数优化点
   - 若有等价解法，可一句话点出

# 输出 JSON Schema
{
  "content": "<完整题解 markdown 字符串，包含上述 5 段>",
  "language": "<标程语言，如 cpp / python / java / go / javascript>"
}

# 严格规则
- content 字段必须是合法字符串（双引号需转义为 \\"）
- 不要在 JSON 外输出 \`\`\`markdown 包裹
- 不要输出 \`<think>\` 思考块
- 不要添加任何额外字段（如 status / message / debug）`

function buildUserPrompt(params: SolutionGenerationParams): string {
  const sections: string[] = []
  sections.push(`# 题目标题\n${params.title}`)
  sections.push(`# 题目描述\n${params.description || '（无）'}`)

  if (params.stdCode && params.stdCode.trim()) {
    const lang = (params.stdLang || 'cpp').toLowerCase()
    sections.push(`# 标程代码（语言：${lang}）\n\`\`\`${lang}\n${params.stdCode}\n\`\`\``)
  } else {
    sections.push(`# 标程代码\n（无 — 请基于题目描述自行设计算法并给出参考实现，优先选择 C++17 或 Python3）`)
  }

  sections.push(`# 输出要求
- 严格按 JSON Schema 输出
- 题解 5 段必须齐全
- 参考代码必须用 markdown 代码块包裹
- 语言：${params.stdLang || 'auto'}`)
  return sections.join('\n\n')
}

/**
 * 生成 AI 题解
 *
 * @throws 调用失败 / 解析失败 / 内容异常时抛错，由上层 queue 处理
 */
export async function generateSolutionForProblem(
  params: SolutionGenerationParams,
  _userId?: string
): Promise<SolutionGenerationResult> {
  if (!params.problemId || !params.title) {
    throw new Error('solution-generator: problemId 与 title 必填')
  }
  if (!params.authorId) {
    throw new Error('solution-generator: authorId 必填（题解落库时作为 authorId）')
  }

  const config = await getAiConfig(_userId, params.modelId)
  const client = createAiClient(config, false)
  const model = getModelName(config, false)

  const userPrompt = buildUserPrompt(params)

  const baseParams = {
    model,
    messages: [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: userPrompt }
    ],
    // 题解写作需要一定创造性，温度 0.7；不用 JSON 强约束结构（已经在 system prompt 中明示）
    temperature: 0.7,
    response_format: { type: 'json_object' as const },
    // 题解 5 段 markdown 通常 1500-4000 tokens，给 8192 留足余量
    max_tokens: 8192
  }
  const merged = buildChatParams(config, baseParams, false)

  logger.info('[solution-generator] 开始生成题解', {
    problemId: params.problemId,
    title: params.title,
    hasStdCode: !!params.stdCode,
    stdLang: params.stdLang,
    model
  })

  const response = await callWithRetry(
    () => client.chat.completions.create(merged as any),
    { maxRetries: 2, backoffMs: 800, opName: 'solution-generate' }
  )

  const msg = response.choices[0].message as any
  const raw = msg?.content || msg?.reasoning_content || ''
  const tokensUsed = response.usage?.total_tokens || 0

  if (!raw) {
    throw new Error('solution-generator: AI 响应为空')
  }

  let parsed: any
  try {
    parsed = safeJsonParse(raw)
  } catch (e: any) {
    // 解析失败时透传 AI_PARSE_FAILED 元信息
    logger.error('[solution-generator] JSON 解析失败', {
      problemId: params.problemId,
      parseError: e?.info?.parseError,
      preview: e?.info?.originalContent
    })
    throw e
  }

  const content: string = (parsed?.content || '').toString().trim()
  if (!content) {
    throw new Error('solution-generator: AI 返回的 content 字段为空')
  }

  // 简单完整性校验：5 段 H2 标题至少出现 4 个（容错 AI 偶尔漏一段）
  const requiredSections = ['思路分析', '算法描述', '复杂度分析', '参考代码', '关键点说明']
  const missing = requiredSections.filter(s => !content.includes(s))
  if (missing.length > 1) {
    logger.warn('[solution-generator] 题解结构不完整（缺多段）', {
      problemId: params.problemId,
      missing
    })
  }

  const language: string | undefined = (parsed?.language || params.stdLang || '').toString().trim() || undefined

  logger.info('[solution-generator] 题解生成成功', {
    problemId: params.problemId,
    contentLength: content.length,
    language,
    tokensUsed
  })

  return { content, language, tokensUsed }
}
