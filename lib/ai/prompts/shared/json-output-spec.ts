/**
 * lib/ai/prompts/shared/json-output-spec.ts
 *
 * 共享段：严格 JSON 输出规范（Task 40.1）
 *
 * 抽取各 generator 中重复的"严格按模板输出" / "禁止 markdown 标记" / "snake_case" 等规则，
 * 供 ParamGen / TestData / Similar / Incremental 等 generator 组合使用。
 *
 * 保持行为不变，仅结构重构（Task 40.4 / 40.5 / 40.6 复用）。
 */

/**
 * 严格 JSON 输出规范（适用于所有需要 JSON 输出的 AI 调用）
 *
 * 内容包括：
 * 1. 严格按模板输出
 * 2. 禁止 markdown 标记（```json 等）
 * 3. 禁止 think 块
 * 4. snake_case 字段名
 * 5. JSON 转义规则
 */
export const JSON_OUTPUT_SPEC = `# 严格 JSON 输出规范（不可违反）
1. **严格按模板输出**：把所有 <...> 占位符替换成实际内容，其他字符（字段名、嵌套层级、引号、逗号、换行）原样保留
2. **禁止 markdown 标记**：不要在 JSON 外添加 \`\`\`json 等包裹标记
3. **禁止 think 块**：不要输出 <think> 思考块
4. **禁止额外解释**：不要在 JSON 外添加任何解释文字、前言、后记
5. **字段名 snake_case**：与模板完全一致，包括 test_cases / time_limit / memory_limit / solution_cpp / solution_python / solution_article
6. **JSON 转义**：中文标点、字符串、代码中可能含双引号 / 反引号 / 换行，**必须用 \\" 和 \\n 转义**，否则 JSON 非法
7. **内容完整性**：字段内容必须完整闭合，禁止中途截断`

/**
 * 单题生成数量约束（业务决策 2026-06：单次只生成 1 道题）
 */
export const SINGLE_PROBLEM_CONSTRAINT = `**业务决策（2026-06）**：单次 AI 调用只生成 1 道题；顶层必须是长度为 1 的 JSON 数组 [ { ... } ]，严禁输出多个对象的数组或顶层对象`

/**
 * 测试点数量与覆盖度要求（ParamGen / Similar 共用）
 *
 * 业务决策（2026-07）：完全去除数量硬约束（既不设"15 组"也不设"8 组"下限）——
 * 覆盖度判定基于 input 中真实体现的数据特征，AI 凑数量无法蒙混过关。
 * 数量由 AI 根据覆盖 10 个维度的需要自行决定，只要覆盖达标，组数越少越好。
 * AI 只需生成 input 字段，output 字段必须留空字符串（''），最终由 C++ 标程运行生成。
 */
export const TEST_CASE_COVERAGE_REQUIREMENT = `test_cases 数量不设上下限——完全由覆盖度决定：必须覆盖 10 个维度（最小值 / 最大值 / 边界 / 反例 / 随机 / 全相同 / 单调 / 极端比例 / 倒数边界 / 随机压力）中的至少 8 个。覆盖判定基于 input 中真实体现的数据特征（如检测 n=1、大数字、连续相同 token、严格递增序列、接近上限的次边界值等），凑数量无效。只要覆盖达标，组数越少越好；标程代码可在标准编译器下编译运行。
**AI 只需生成 input 字段，output 字段必须留空字符串（""），最终由 C++ 标程运行生成**——不要浪费推理资源推算 output，output 的权威来源是后端编译运行 solution_cpp 得到的真实结果`
