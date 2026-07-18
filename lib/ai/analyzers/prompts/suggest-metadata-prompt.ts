/**
 * lib/ai/analyzers/prompts/suggest-metadata-prompt.ts
 *
 * 元数据建议 prompt 构建器（轻量，只输出元数据）
 *
 * 设计原则：
 *   1. 基于 DIFFICULTY_PROFILES 取中位 time/memory（写入 prompt 供 AI 参考）
 *   2. 复用 TOPICS 限定标签词表
 *   3. 不生成 testCases / 标程（仅 tags / difficulty / hint / timeLimit / memoryLimit）
 *   4. 严格 JSON Schema 输出
 */
import { TOPICS } from '@/lib/ai/prompts/core/types'
import { DIFFICULTY_PROFILES, type Difficulty } from '@/lib/ai/prompts/core/quality-gates'
// Task 40.6：复用共享段（json-output-spec）
import { JSON_OUTPUT_SPEC } from '@/lib/ai/prompts/shared/json-output-spec'

/**
 * 元数据建议结果
 */
export interface MetadataSuggestion {
  /** 标签（2-4 个，来自 TOPICS 词表） */
  tags: string[]
  /** 难度（来自 DIFFICULTY_PROFILES 档位） */
  difficulty: string
  /** 数据范围提示（1-2 句，不透露算法） */
  hint: string
  /** 时间限制（毫秒，取建议难度档位中位值） */
  timeLimit: number
  /** 内存限制（MB，取建议难度档位中位值） */
  memoryLimit: number
}

/**
 * 元数据建议输入
 */
export interface SuggestMetadataPromptInput {
  description: string
  samples?: any[]
  input?: string
  output?: string
}

/**
 * 预计算每个难度档位的中位 time/memory（供消费方读取）
 */
export const MEDIAN_TIME_LIMITS: Record<Difficulty, number> = Object.entries(
  DIFFICULTY_PROFILES
).reduce(
  (acc, [diff, profile]) => {
    acc[diff as Difficulty] = Math.round(
      (profile.timeLimitRange[0] + profile.timeLimitRange[1]) / 2
    )
    return acc
  },
  {} as Record<Difficulty, number>
)

export const MEDIAN_MEMORY_LIMITS: Record<Difficulty, number> = Object.entries(
  DIFFICULTY_PROFILES
).reduce(
  (acc, [diff, profile]) => {
    acc[diff as Difficulty] = Math.round(
      (profile.memoryLimitRange[0] + profile.memoryLimitRange[1]) / 2
    )
    return acc
  },
  {} as Record<Difficulty, number>
)

/**
 * 构建元数据建议的 system + user prompt
 */
export function buildSuggestMetadataPrompt(input: SuggestMetadataPromptInput): {
  systemPrompt: string
  userPrompt: string
} {
  const topicList = TOPICS.join('、')
  const difficultyList = Object.keys(DIFFICULTY_PROFILES).join(' / ')

  // 各难度档位中位值参考表（嵌入 prompt 让 AI 直接选用，避免自创数值）
  const difficultyMedianTable = Object.entries(DIFFICULTY_PROFILES)
    .map(
      ([diff, p]) =>
        `- ${diff}: time=${Math.round((p.timeLimitRange[0] + p.timeLimitRange[1]) / 2)}ms, memory=${Math.round((p.memoryLimitRange[0] + p.memoryLimitRange[1]) / 2)}MB`
    )
    .join('\n')

  const systemPrompt = `你是一位资深的算法竞赛命题顾问，根据题目描述建议元数据。

# 任务
基于题目描述，输出以下 5 个字段：
1. **tags** — 标签：从下列词表中选 2-4 个最匹配的：
   ${topicList}
2. **difficulty** — 难度：从下列档位中选 1 个：${difficultyList}
3. **hint** — 提示：1-2 句数据范围提示（不要透露算法）
4. **timeLimit** — 时间限制（毫秒）：取建议难度档位的中位值
5. **memoryLimit** — 内存限制（MB）：取建议难度档位的中位值

# 各难度档位中位值参考
${difficultyMedianTable}

# 输出格式
严格输出 JSON 对象：
{
  "tags": ["标签1", "标签2"],
  "difficulty": "普及",
  "hint": "数据范围提示...",
  "timeLimit": 1500,
  "memoryLimit": 256
}

# 约束
- 标签必须来自上方词表，禁止自创
- 难度必须来自上方档位列表
- timeLimit / memoryLimit 必须为正整数，且与建议难度档位的中位值一致
- 字符串字段使用简体中文

${JSON_OUTPUT_SPEC}`

  const userPrompt = `请根据以下题目信息建议元数据：

【描述】
${input.description}

【输入格式】
${input.input || '（未提供）'}

【输出格式】
${input.output || '（未提供）'}

【样例】
${JSON.stringify(input.samples || [], null, 2)}

请按 system prompt 中定义的 JSON Schema 输出建议。`

  return { systemPrompt, userPrompt }
}
