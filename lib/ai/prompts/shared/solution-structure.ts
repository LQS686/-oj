/**
 * lib/ai/prompts/shared/solution-structure.ts
 *
 * 共享段：5 段式题解结构说明（Task 40.2）
 *
 * 抽取 ParamGen generator 和 solution-generator 中重复的题解结构说明，
 * 供 ParamGen / Similar / solution-generator 组合使用。
 */

/**
 * 5 段式题解结构说明
 *
 * 与 solution-generator.ts 的 SYSTEM_PROMPT 中定义的结构一致：
 * 1. 思路分析
 * 2. 算法描述
 * 3. 复杂度分析
 * 4. 参考代码
 * 5. 关键点说明
 *
 * 使用 H2 ## 分隔（不要用 H1 或 H3）
 */
export const SOLUTION_STRUCTURE_SPEC = `solution_article：5 段式 markdown 题解，使用 H2 ## 分隔（不要用 H1 或 H3）：
  1. ## 思路分析 — 为什么选这个算法（结合数据范围 / 题目约束）
  2. ## 算法描述 — 分步骤描述执行过程
  3. ## 复杂度分析 — 时间复杂度 + 空间复杂度（附推导）
  4. ## 参考代码 — 用 \`\`\`cpp 包裹完整 C++17 代码，**内容必须与 solution_cpp 字段完全一致**（不要再写第二份标程；直接复制 solution_cpp 的内容）
  5. ## 关键点说明 — 易错点 / 边界情况 / 常数优化
  - 总字数 800-2500 字（视难度而定），字符串内可能含双引号 / 反引号 / 换行，**必须用 \\" 和 \\n 转义**`

/**
 * 标程字段说明（solution_cpp / solution_python）
 *
 * Task 32：多语言标程同步，solution_python 基于 solution_cpp 功能等价翻译
 */
export const SOLUTION_CODE_SPEC = `- solution_cpp：C++17 标程（字符串里可能含 \\n 换行；含双引号必须转义为 \\"）
- solution_python：Python3 标程（基于 solution_cpp 的功能等价翻译，语法适配 Python 特性）`
