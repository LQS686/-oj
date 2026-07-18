/**
 * lib/ai/analyzers/prompts/analyze-prompt.ts
 *
 * 题目智能分析 prompt 构建器（只读分析，不修改题目）
 *
 * 设计原则：
 *   1. 严格 JSON Schema 输出（与 AnalysisResult 类型 1:1 对应）
 *   2. 标签词表限定（复用 TOPICS）
 *   3. 难度档位限定（复用 DIFFICULTY_PROFILES）
 *   4. 5 维度分析框架：标签 / 难度 / 质量 / 测试维度缺口 / 建议提示
 */
import { TOPICS } from '@/lib/ai/prompts/core/types'
import { DIFFICULTY_PROFILES, type Difficulty } from '@/lib/ai/prompts/core/quality-gates'
// Task 40.6：复用共享段（json-output-spec）
import { JSON_OUTPUT_SPEC } from '@/lib/ai/prompts/shared/json-output-spec'

/**
 * 题目智能分析结果（5 维度）
 */
export interface AnalysisResult {
  /** 标签建议（来自 TOPICS 词表） */
  suggestedTags: string[]
  /** 难度建议（来自 DIFFICULTY_PROFILES 档位） */
  suggestedDifficulty: string
  /** 质量问题描述（无问题返回空数组） */
  qualityIssues: string[]
  /** 对学生的提示建议（1-3 条，不透露算法） */
  suggestedHints: string[]
  /** 测试维度缺口（最小值 / 最大值 / 边界 / 反例 / 随机 / 全相同 / 单调 / 极端比例 / 倒数边界 / 随机压力） */
  testCaseGaps: string[]
}

/**
 * 题目智能分析输入（完整 Problem 对象）
 */
export interface AnalyzePromptInput {
  title: string
  description: string
  input?: string
  output?: string
  samples?: any[]
  tags?: string[]
  difficulty?: string
  stdCode?: string | null
  stdLang?: string | null
  hint?: string | null
}

/**
 * 构建题目智能分析的 system + user prompt
 */
export function buildAnalyzePrompt(input: AnalyzePromptInput): {
  systemPrompt: string
  userPrompt: string
} {
  const topicList = TOPICS.join('、')
  const difficultyList = Object.keys(DIFFICULTY_PROFILES).join(' / ')

  const systemPrompt = `你是一位资深的算法竞赛命题审稿人，对题目进行只读分析（不修改题目）。

# 任务
基于输入的题目信息，从以下 5 个维度给出评估结果：
1. **suggestedTags** — 标签建议：从下列词表中选取 2-4 个最匹配的标签（若原 tags 已合理，可微调或保留）：
   ${topicList}
2. **suggestedDifficulty** — 难度建议：从下列档位中选 1 个最匹配的：${difficultyList}
3. **qualityIssues** — 质量问题：列出题目中存在的质量问题（描述不清晰 / 数据范围缺失 / 样例不足 / 标程缺失 / 等），无问题返回空数组
4. **testCaseGaps** — 测试维度缺口：分析题目现有测试点（若提供）覆盖了哪些维度，缺失哪些维度（最小值 / 最大值 / 边界 / 反例 / 随机 / 全相同 / 单调 / 极端比例 / 倒数边界 / 随机压力）
5. **suggestedHints** — 建议提示：给出 1-3 条对学生的提示（数据范围提示 / 易错点提示 / 思路引导），不要直接透露算法

# 输出格式
严格输出 JSON 对象，字段名 1:1 一致：
{
  "suggestedTags": ["标签1", "标签2"],
  "suggestedDifficulty": "普及",
  "qualityIssues": ["问题描述1", "问题描述2"],
  "suggestedHints": ["提示1", "提示2"],
  "testCaseGaps": ["缺失维度1", "缺失维度2"]
}

# 约束
- 只读分析，不修改题目内容
- 标签必须来自上方词表，禁止自创
- 难度必须来自上方档位列表
- 字符串字段使用简体中文
- 字段缺失时返回空数组 []，不要省略字段

${JSON_OUTPUT_SPEC}`

  const userPrompt = `请分析以下题目：

【标题】
${input.title}

【描述】
${input.description}

【输入格式】
${input.input || '（未提供）'}

【输出格式】
${input.output || '（未提供）'}

【样例】
${JSON.stringify(input.samples || [], null, 2)}

【当前标签】
${(input.tags || []).join('、') || '（无）'}

【当前难度】
${input.difficulty || '（未指定）'}

【提示】
${input.hint || '（无）'}

【标程】
${input.stdCode ? `\`\`\`${input.stdLang || 'cpp'}\n${input.stdCode}\n\`\`\`` : '（未提供）'}

请按 system prompt 中定义的 JSON Schema 输出分析结果。`

  return { systemPrompt, userPrompt }
}

/**
 * 解析后的难度档位列表（供消费方读取）
 */
export const ANALYZE_DIFFICULTY_LIST: readonly Difficulty[] = Object.keys(DIFFICULTY_PROFILES) as Difficulty[]
