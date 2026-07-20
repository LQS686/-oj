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
 * 5. test_cases 展示 3 个示例对象，让 AI 明白每条结构；实际生成时数量不设上下限，由覆盖度决定（必须覆盖 10 个维度的至少 8 个，凑数量无效）
 */

/**
 * 单道题的 JSON 结构
 * ⚠️ 必须与 GeneratedProblem / saveProblem 读取的字段保持 1:1
 *
 * 业务决策（2026-07）：
 * 1. test_cases 中**移除** output 占位符，只保留 input——AI 只生成 input，
 *    output 由后端编译运行 solution_cpp 生成（C++ 标程是题目唯一权威解答）
 * 2. samples 的 output 改为空字符串占位（""），同样由后端 C++ 标程运行生成；
 *    samples 必须是简单、小规模、有教学意义的输入（如 n≤5），便于用户阅读理解
 * 3. test_cases 前 2 组应优先安排小数据 case 供 samples 复制（前 2 组会被复制为 samples）
 */
export const SINGLE_PROBLEM_TEMPLATE = `{
  "title": "<4-10字中文题目名>",
  "description": "<Markdown 格式详细题目描述，含背景、要求、约束，用简体中文>",
  "input": "<输入格式说明，中文>",
  "output": "<输出格式说明，中文>",
  "samples": [
    {
      "input": "<样例1输入字符串，必须是简单小规模数据如 n≤5，便于用户阅读理解>",
      "output": "",
      "explanation": "<样例1解释，用中文，1-2 句话>"
    },
    {
      "input": "<样例2输入字符串，必须是简单小规模数据如 n≤5，便于用户阅读理解>",
      "output": "",
      "explanation": "<样例2解释，用中文，1-2 句话>"
    }
  ],
  "hint": "<1-2 句数据范围提示，不要直接透露算法>",
  "tags": <2-4 个中文标签字符串数组，例如 ["动态规划", "背包", "时间优化"]；元素必须是字符串、必须是中文、不得含难度词>,
  "difficulty": "<难度字符串，必须与传入的 difficulty 完全一致>",
  "time_limit": <1000 或 1500 或 2000 或 3000 或 5000 整数毫秒>,
  "memory_limit": <64 或 128 或 256 或 512 或 1024 整数MB>,
  "test_cases": [
    {"input": "<测试1输入，前 2 组应优先安排小数据 case 供 samples 复制>"},
    {"input": "<测试2输入，前 2 组应优先安排小数据 case 供 samples 复制>"},
    {"input": "<测试3输入>"}
  ],
  "solution_cpp": "<完整可编译的 C++17 标程，以 #include <bits/stdc++.h> 开头，变量命名清晰；题目的标准解答 + output 生成工具，写入 problem.stdCode，题解参考代码段使用，必须可独立编译运行，且与题目逻辑严格一致>",
  "solution_python": "<可选；完整可运行的 Python3 标程；AI 主动生成则保留，后端不使用；C++ 标程是题目唯一权威解答>",
  "solution_article": "<5 段式 markdown 题解，使用 H2 ## 分隔：思路分析 / 算法描述 / 复杂度分析 / 参考代码 / 关键点说明；字符串内可能含双引号 / 反引号 / 换行，必须用 \\\" 和 \\n 转义>"
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
  'test_cases', 'solution_cpp', 'solution_python',
  'solution_article'
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
