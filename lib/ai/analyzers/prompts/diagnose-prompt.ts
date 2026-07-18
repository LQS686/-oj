/**
 * lib/ai/analyzers/prompts/diagnose-prompt.ts
 *
 * 失败诊断 prompt 构建器（Task 30.2）
 *
 * 分析 FAILED 任务的 error / parseError / qualityIssues，
 * 调用轻量 AI 返回 { failureType, suggestedFix }。
 *
 * 设计原则：
 *   1. 严格 JSON Schema 输出
 *   2. failureType 分类：PARSE_ERROR / API_ERROR / TIMEOUT / QUALITY_FAIL / CONTENT_EMPTY / UNKNOWN
 *   3. suggestedFix 给出具体可操作建议（重试 / 降温度 / 切换模型 / 修改 prompt 等）
 *   4. 注入 promptHash 关联信息（Task 39.4）
 */
import { JSON_OUTPUT_SPEC } from '@/lib/ai/prompts/shared/json-output-spec'

/**
 * 失败诊断结果
 */
export interface DiagnosisResult {
  /** 失败类型分类 */
  failureType: 'PARSE_ERROR' | 'API_ERROR' | 'TIMEOUT' | 'QUALITY_FAIL' | 'CONTENT_EMPTY' | 'UNKNOWN'
  /** 建议修复方案（具体可操作） */
  suggestedFix: string
  /** 详细分析（可选） */
  analysis?: string
  /** 近 7 天同 promptHash 失败任务数（Task 39.4，由调用方填充） */
  similarFailureCount?: number
}

/**
 * 诊断 prompt 输入
 */
export interface DiagnosePromptInput {
  /** 原任务的错误信息 */
  error: string
  /** 原任务的 mode */
  originalMode: string
  /** 原任务的解析错误信息（如有） */
  parseError?: string
  /** 原任务的质量问题（如有） */
  qualityIssues?: string[]
  /** 原任务的 promptHash（Task 39.4） */
  promptHash?: string
  /** 近 7 天同 promptHash 失败任务数（由调用方查询后传入） */
  similarFailureCount?: number
}

/**
 * 构建失败诊断的 system + user prompt
 */
export function buildDiagnosePrompt(input: DiagnosePromptInput): {
  systemPrompt: string
  userPrompt: string
} {
  const systemPrompt = `你是一位资深的 AI 系统诊断工程师，专门分析 AI 生成任务失败的原因并给出修复建议。

# 任务
分析一个 AI 生成任务的失败信息，返回失败类型分类和具体修复建议。

# 失败类型分类（failureType）
1. **PARSE_ERROR** — AI 返回的内容无法解析为合法 JSON（JSON 格式错误 / 含 markdown 标记 / 含 think 块）
2. **API_ERROR** — AI 服务商返回错误（429 限流 / 401 鉴权失败 / 5xx 服务端错误）
3. **TIMEOUT** — 任务执行超时（AI 响应过慢 / 标程执行超时）
4. **QUALITY_FAIL** — 生成内容质量不达标（字段缺失 / 测试点不足 / 标程编译失败）
5. **CONTENT_EMPTY** — AI 返回空内容（choices 为空 / content 为空）
6. **UNKNOWN** — 无法分类的未知错误

# 修复建议原则（suggestedFix）
- 必须具体可操作（如"降低 temperature 到 0.2 重试" / "切换到更稳定的模型" / "检查 API Key 配额"）
- 优先建议低成本的修复方案（重试 > 降温度 > 切换模型 > 修改 prompt）
- 如有同类失败历史（similarFailureCount > 0），建议检查 prompt 模板是否有系统性问题

# 输出格式
${JSON_OUTPUT_SPEC}

输出 JSON 对象：
{
  "failureType": "<上述 6 种之一>",
  "suggestedFix": "<具体修复建议，50-200 字>",
  "analysis": "<详细分析，可选，100-300 字>"
}

# 约束
- failureType 必须是上述 6 种之一（大写）
- suggestedFix 必须是非空字符串
- 使用简体中文`

  const userPrompt = `请分析以下 AI 生成任务的失败信息：

【原任务模式】
${input.originalMode}

【错误信息】
${input.error}

${input.parseError ? `【解析错误详情】\n${input.parseError}\n` : ''}
${input.qualityIssues && input.qualityIssues.length > 0 ? `【质量问题】\n${input.qualityIssues.map(q => `- ${q}`).join('\n')}\n` : ''}
${input.promptHash ? `【Prompt 哈希】\n${input.promptHash}\n` : ''}
${input.similarFailureCount && input.similarFailureCount > 0 ? `【同类失败统计】\n近 7 天使用同一 prompt 的失败任务数：${input.similarFailureCount}\n` : ''}

请按 system prompt 中定义的 JSON Schema 输出诊断结果。`

  return { systemPrompt, userPrompt }
}
