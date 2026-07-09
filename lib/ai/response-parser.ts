import { logger } from '../logger'

/**
 * AI 响应解析器 — 极简版
 *
 * 核心原则：DeepSeek 官方提供 `response_format: { type: 'json_object' }` 强制 JSON 输出，
 * 因此解析器只需要做两件事：
 *  1. 剥掉 DeepSeek v4 thinking 模式下泄漏的 `<think>...</think>` 块
 *  2. 直接 JSON.parse
 *
 * 失败时抛 `code: 'AI_PARSE_FAILED'` 错误并附上原始内容预览，便于排查。
 * 严禁"打补丁式"修复（拼接、逗号修补、尾随逗号移除等）— 让 API 层做正确的事。
 *
 * 下方仍保留的 6 个辅助函数（tryDirectParse / tryRemoveMarkdown / ...）已不再被
 * safeJsonParse 调用，仅作为内部工具供调试或单元测试使用。
 */

/**
 * 剥离 DeepSeek v4 thinking 块：`<think>...</think>`
 * 不区分大小写，跨多行匹配。使用非贪婪匹配以避免误删多个独立 think 块之间的正文。
 */
export function stripThinkBlocks(text: string): string {
  if (!text) return text
  // 非贪婪匹配，避免误删多个独立 think 块之间的正文
  // 如 `<think>A</think>正文<think>B</think>` 应只删除两个 think 块，保留"正文"
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

/**
 * 直接 JSON.parse
 */
export function tryDirectParse(text: string): any {
  return JSON.parse(text)
}

/**
 * 移除 markdown 代码块包裹后解析（保留作为调试工具）
 *   ```json ... ``` 或 ``` ... ```
 */
export function tryRemoveMarkdown(text: string): any {
  const sanitized = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  return JSON.parse(sanitized)
}

/**
 * 修复转义（保留作为调试工具）
 */
export function tryFixEscapes(text: string): any {
  let repaired = text.replace(/\\'/g, "'")
  repaired = repaired.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1')
  return JSON.parse(repaired)
}

/**
 * 补缺漏逗号（保留作为调试工具）— 不再被 safeJsonParse 调用
 */
export function tryFixCommas(text: string): any {
  const applyAll = (s: string): string => {
    let r = s
    r = r.replace(/\}\s*{/g, '}, {')
    r = r.replace(/\]\s*\[/g, '], [')
    r = r.replace(/"\s*"/g, '", "')
    r = r.replace(/([0-9])\s*{/g, '$1, {')
    r = r.replace(/([0-9])\s*"/g, '$1, "')
    r = r.replace(/([0-9])\s+([0-9])/g, '$1, $2')
    r = r.replace(/\}\s*"/g, '}, "')
    r = r.replace(/"\s*{/g, '", {')
    r = r.replace(/([0-9])\s*\]/g, '$1, ]')
    r = r.replace(/\}\s*\]/g, '}, ]')
    r = r.replace(/"\s*\]/g, '", ]')
    r = r.replace(/,(\s*[\}\]])/g, '$1')
    r = r.replace(/,(\s*,)+/g, ',')
    return r
  }

  let fixed = text
  for (let i = 0; i < 3; i++) {
    fixed = applyAll(fixed)
    try {
      return JSON.parse(fixed)
    } catch {
      // continue
    }
  }
  return JSON.parse(fixed)
}

/**
 * 激进数组修复（保留作为调试工具）
 */
export function tryAggressiveArrayFix(text: string): any {
  const arrayStart = text.indexOf('[')
  const arrayEnd = text.lastIndexOf(']')
  if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
    throw new Error('No array found for aggressive fix')
  }
  const beforeArray = text.substring(0, arrayStart + 1)
  const arrayContent = text.substring(arrayStart + 1, arrayEnd)
  const afterArray = text.substring(arrayEnd)

  const elements = arrayContent.split(/\s*[\{\}]\s*/).filter(el => el.trim() !== '')
  if (elements.length === 0) throw new Error('Aggressive fix: no elements found')

  let reconstructedContent = ''
  for (let i = 0; i < elements.length; i++) {
    if (i > 0) reconstructedContent += ', '
    if (arrayContent.includes('{' + elements[i]) || arrayContent.includes(elements[i] + '}')) {
      reconstructedContent += '{' + elements[i] + '}'
    } else {
      reconstructedContent += elements[i]
    }
  }

  return JSON.parse(beforeArray + reconstructedContent + afterArray)
}

/**
 * 从 prose 中提取 JSON 区间（保留作为调试工具）
 */
export function tryExtractFromText(text: string): any {
  const firstOpen = text.search(/[\{\[]/)
  if (firstOpen === -1) throw new Error('No JSON start found in text')

  let lastClose = -1
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '}' || text[i] === ']') {
      lastClose = i
      break
    }
  }
  if (lastClose === -1 || lastClose <= firstOpen) {
    throw new Error('No JSON end found in text')
  }

  const extracted = text.substring(firstOpen, lastClose + 1)
  return JSON.parse(extracted)
}

/**
 * 解析失败时的可诊断信息
 */
export interface ParseFailureInfo {
  /** 原始内容（截前 500 字） */
  originalContent: string
  /** 剥离 think 块后尝试解析的字符串（截前 500 字） */
  strippedContent: string
  /** 原始内容长度 */
  contentLength: number
  /** 是否剥离了 think 块 */
  strippedThinkBlock: boolean
  /** JSON.parse 抛出的错误信息 */
  parseError: string
  /** 修复建议（截断/格式/字段名等） */
  hint?: string
}

/**
 * 极简版 JSON 解析入口
 *
 * 流程：
 *  1. 剥 `<think>...</think>` 块
 *  2. JSON.parse
 *  3. 失败 → 抛 `AI_PARSE_FAILED` + 原始内容预览
 *
 * @throws Error 携带 `code: 'AI_PARSE_FAILED'` 与 `info: ParseFailureInfo`
 */
export function safeJsonParse(text: string): any {
  if (typeof text !== 'string' || !text.trim()) {
    throw createParseError('Input is empty or not a string', text || '', false, 'No input')
  }

  // 步骤 1：剥离 think 块
  const stripped = stripThinkBlocks(text)
  const strippedThinkBlock = stripped !== text.trim()

  // 步骤 2：直接 JSON.parse — 信任 response_format: { type: 'json_object' }
  try {
    return JSON.parse(stripped)
  } catch (e: any) {
    // 二次尝试：剥离 markdown 代码块包裹（```json ... ``` 或 ``` ... ```）后解析
    // 国产模型偶发仍用 markdown 包裹 JSON，tryRemoveMarkdown 内部完成剥离 + JSON.parse
    try {
      return tryRemoveMarkdown(stripped)
    } catch {
      // 两次解析均失败，继续抛 AI_PARSE_FAILED
    }
    // 启发式检测响应是否被 max_tokens 截断：
    // 截断的标志 = 字符串里所有括号/引号都是奇数个未闭合
    // 简化判定：如果内容最后 50 字包含未闭合的 " 或 { 或 [，大概率是截断
    const tail = stripped.slice(-100)
    const unbalanced =
      (tail.match(/{/g) || []).length !== (tail.match(/}/g) || []).length ||
      (tail.match(/\[/g) || []).length !== (tail.match(/\]/g) || []).length ||
      /["{[](?![^"{}[\]]*["}\]])\s*$/.test(tail)
    const hint = unbalanced
      ? '响应可能因 max_tokens 不够而被截断；请增大 max_tokens 或减少生成数量'
      : undefined
    throw createParseError(
      'JSON.parse failed after stripping think blocks',
      text,
      strippedThinkBlock,
      e?.message || String(e),
      stripped,
      hint
    )
  }
}

function createParseError(
  msg: string,
  original: string,
  strippedThinkBlock: boolean,
  parseError: string,
  stripped?: string,
  hint?: string
): Error & { code?: string; info?: ParseFailureInfo } {
  const err: Error & { code?: string; info?: ParseFailureInfo } = new Error(msg)
  err.code = 'AI_PARSE_FAILED'
  err.info = {
    originalContent: (original || '').substring(0, 500),
    strippedContent: (stripped || '').substring(0, 500),
    contentLength: (original || '').length,
    strippedThinkBlock,
    parseError,
    hint
  }
  logger.warn('[safeJsonParse] JSON.parse failed — model returned non-JSON content', {
    contentLength: err.info.contentLength,
    contentPreview: err.info.originalContent,
    strippedContent: err.info.strippedContent,
    parseError,
    strippedThinkBlock,
    hint
  })
  return err
}
