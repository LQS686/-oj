/**
 * lib/ai/prompt-hash.ts
 *
 * Prompt 版本哈希（Task 39）
 *
 * 用途：
 * - 为每次 AI 任务计算 prompt 的 SHA-256 哈希，写入 AiGenerationLog.params.promptHash
 * - 监控页可按 promptHash 过滤，快速定位"同一 prompt 的失败任务集群"
 * - 失败诊断时关联近 7 天使用同一 prompt 的失败任务数（Task 39.4）
 *
 * 设计：
 * - 使用 Node.js 内置 crypto 模块（无需额外依赖）
 * - 哈希输入 = systemPrompt + '\n---\n' + userPrompt（分隔符避免拼接歧义）
 * - 返回 hex 编码的 64 字符字符串
 */
import { createHash } from 'crypto'

const PROMPT_SEPARATOR = '\n---\n'

/**
 * 计算 system + user prompt 的 SHA-256 哈希
 *
 * @param systemPrompt 系统 prompt
 * @param userPrompt 用户 prompt
 * @returns 64 字符 hex 字符串（SHA-256）
 */
export function computePromptHash(systemPrompt: string, userPrompt: string): string {
  const combined = `${systemPrompt}${PROMPT_SEPARATOR}${userPrompt}`
  return createHash('sha256').update(combined, 'utf8').digest('hex')
}

/**
 * 从 AiGenerationLog.params 中提取 promptHash（如存在）
 *
 * 用于监控页过滤 / 诊断关联查询。
 */
export function extractPromptHash(params: unknown): string | undefined {
  if (!params || typeof params !== 'object') return undefined
  const p = params as Record<string, unknown>
  const h = p.promptHash
  return typeof h === 'string' && h.length > 0 ? h : undefined
}
