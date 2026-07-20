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
 * 业务决策（2026-07）：
 * 1. solution_cpp 改为**必填**——它是题目的标准解答 + output 生成工具，写入 problem.stdCode，
 *    题解参考代码段使用，必须可独立编译运行，且与题目逻辑严格一致。C++ 标程是题目唯一权威解答。
 * 2. solution_python 改为**可选**——AI 主动生成则保留，后端不使用；不再作为数据生成工具。
 * 3. 新增"标程复杂度与 timeLimit 匹配"约束：避免标程运行测试点时 TLE。
 * 4. 新增"标程代码质量"约束：变量命名 / 注释 / const / 模块化 / iostream。
 * 5. 新增"禁止使用 C++11 范围 for"约束：教学规范，初学者应建立清晰的循环控制概念。
 */
export const SOLUTION_CODE_SPEC = `# 标程字段规范
- solution_cpp（**必填**）：C++17 标程——题目的标准解答 + output 生成工具，写入 problem.stdCode，题解参考代码段使用，必须可独立编译运行，且与题目逻辑严格一致（字符串里可能含 \\n 换行；含双引号必须转义为 \\"）
- solution_python（**可选**）：Python3 标程——AI 主动生成则保留，后端不使用；C++ 标程是题目唯一权威解答

## 标程复杂度与 timeLimit 匹配
- 标程时间复杂度必须与题目 timeLimit 匹配，避免标程在测试点上 TLE
- 参考规则：timeLimit=1000ms 时，O(n²) 算法的 n 上限应 ≤ 3000，O(n log n) 算法的 n 上限应 ≤ 10^6，O(n) 算法的 n 上限应 ≤ 10^7
- AI 生成 input 时不得超出该上限，否则标程运行会 TLE，任务将 FAILED

## 标程代码质量
- 变量命名应有意义（避免 a/b/c 等单字母命名，循环变量 i/j/k 除外）
- 关键步骤应有简洁注释（如 // 状态转移、// 边界处理）
- 使用 const / constexpr 定义常量（避免 magic number）
- 函数模块化（复杂逻辑应拆分为函数，main 函数不超过 50 行）
- 使用 iostream 而非 stdio.h（C++ 风格统一）

## 禁止使用 C++11 范围 for
- 禁止 \`for (auto x : container)\` / \`for (int x : arr)\` 写法
- 推荐索引 for：\`for (int i = 0; i < n; i++)\` 或迭代器 for：\`for (auto it = v.begin(); it != v.end(); ++it)\`
- 理由：教学规范——DSOJ 是教育平台，初学者应建立清晰的循环控制概念（索引访问、元素修改），范围 for 隐藏了这些细节`
