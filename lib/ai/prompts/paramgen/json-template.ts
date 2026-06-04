/**
 * AI 出题 JSON 模板
 *
 * 设计原则：
 * 1. 字段名与 [lib/ai/prompts/core/types.ts](file:///e:/桌面/oj/lib/ai/prompts/core/types.ts) `GeneratedProblem` + [lib/ai/quality-check.ts](file:///e:/桌面/oj/lib/ai/quality-check.ts) + Prisma `Problem` schema 1:1 对应
 * 2. 统一使用 snake_case（test_cases / time_limit / memory_limit / solution_cpp / solution_python），
 *    因为数据库 schema / normalizeProblem / quality-check 都用 snake_case
 * 3. **关键** count >= 1 始终输出 JSON 数组（[{...}, {...}]），避免 count > 1 时双道题被塞进同一对象
 *    导致重复 key、JSON.parse 只保留最后一个值
 * 4. 不使用任何注释（块注释 / 行注释 都不是合法 JSON）
 * 5. test_cases 展示 3 个示例对象，让 AI 明白每条结构；实际生成时由 AI 自行填满 15 组
 */

/**
 * 单道题的 JSON 结构
 * ⚠️ 必须与 GeneratedProblem / saveProblem 读取的字段保持 1:1
 */
export const SINGLE_PROBLEM_TEMPLATE = `{
  "title": "<4-10字中文题目名>",
  "description": "<Markdown 格式详细题目描述，含背景、要求、约束，用简体中文>",
  "input": "<输入格式说明，中文>",
  "output": "<输出格式说明，中文>",
  "samples": [
    {
      "input": "<样例1输入字符串>",
      "output": "<样例1输出字符串>",
      "explanation": "<样例1解释，用中文，1-2 句话>"
    },
    {
      "input": "<样例2输入字符串>",
      "output": "<样例2输出字符串>",
      "explanation": "<样例2解释，用中文，1-2 句话>"
    }
  ],
  "hint": "<1-2 句数据范围提示，不要直接透露算法>",
  "tags": ["<中文标签1>", "<中文标签2>"],
  "difficulty": "<难度字符串，必须与传入的 difficulty 完全一致>",
  "time_limit": <1000 或 1500 或 2000 或 3000 或 5000 整数毫秒>,
  "memory_limit": <64 或 128 或 256 或 512 或 1024 整数MB>,
  "test_cases": [
    {"input": "<测试1输入>", "output": "<测试1输出>"},
    {"input": "<测试2输入>", "output": "<测试2输出>"},
    {"input": "<测试3输入>", "output": "<测试3输出>"}
  ],
  "solution_cpp": "<完整可编译的 C++17 标程，以 #include <bits/stdc++.h> 开头，变量命名清晰>",
  "solution_python": "<完整可运行的 Python3 标程，可使用 sys.stdin.read() 加速>"
}`

/**
 * 顶层结构：始终为数组，无论 count 是几
 * 避免多道题被塞进同一对象
 */
export const PROBLEM_JSON_TEMPLATE = `[
  ${SINGLE_PROBLEM_TEMPLATE}
]`

/**
 * 字段名白名单 — 校验 AI 返回的对象是否包含全部必填字段
 * 用于 generator 内部的质量预检
 */
export const REQUIRED_FIELDS = [
  'title', 'description', 'input', 'output', 'samples', 'hint',
  'tags', 'difficulty', 'time_limit', 'memory_limit',
  'test_cases', 'solution_cpp', 'solution_python'
] as const

/**
 * 顶级字段名白名单 — 用于剔除 AI 在顶层多塞的字段（如 status / message / debug）
 */
export const TOP_LEVEL_FIELDS = ['title', 'problems'] as const

/**
 * 把 difficulty / timeLimit / memoryLimit 三个变量嵌入单道题模板
 */
export function fillSingleProblemTemplate(
  difficulty: string,
  timeLimit: number,
  memoryLimit: number
): string {
  return SINGLE_PROBLEM_TEMPLATE
    .replace(/<难度字符串[^>]*>/, difficulty)
    .replace(/<1000 或 1500 或 2000 或 3000 或 5000 整数毫秒>/, String(timeLimit))
    .replace(/<64 或 128 或 256 或 512 或 1024 整数MB>/, String(memoryLimit))
}

/**
 * 把 difficulty / timeLimit / memoryLimit 三个变量嵌入数组模板
 */
export function fillTemplate(
  difficulty: string,
  timeLimit: number,
  memoryLimit: number
): string {
  return `[\n  ${fillSingleProblemTemplate(difficulty, timeLimit, memoryLimit)}\n]`
}
