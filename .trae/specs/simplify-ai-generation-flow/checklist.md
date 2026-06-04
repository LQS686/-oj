# AI 出题流程简化 - 验收清单

## 模板与 Prompt

- [ ] `lib/ai/prompts/paramgen/json-template.ts` 已创建并导出 `PROBLEM_JSON_TEMPLATE`
- [ ] `PROBLEM_JSON_TEMPLATE` 字段顺序：title / description / input / output / samples / hint / tags / difficulty / timeLimit / memoryLimit / testCases / solutionCpp / solutionPython
- [ ] `fillTemplate(difficulty, timeLimit, memoryLimit)` 辅助函数可正确替换占位符
- [ ] ParamGen system prompt 含"JSON 填空机器人"角色定义
- [ ] ParamGen user prompt 末尾拼接 `PROBLEM_JSON_TEMPLATE`（而非重复列字段）
- [ ] ParamGen system prompt 显式禁止：添加模板外字段、删除模板字段、JSON 外的解释 / markdown / think 块

## 拆分生成已完全移除

- [ ] `app/admin/ai-generation/page.tsx` 无 `skipTestCases` state
- [ ] `app/admin/ai-generation/page.tsx` 无"仅生成题目描述"checkbox
- [ ] `app/admin/ai-generation/page.tsx` 无"补全测试数据（15 组）"按钮
- [ ] `app/admin/ai-generation/page.tsx` 无 `handleGenerateTestCases` 函数
- [ ] `app/admin/ai-generation/page.tsx` `GenerationResult` 无 `solutionCpp` / `solutionPython` / `timeLimit` / `memoryLimit` 字段
- [ ] `app/admin/ai-generation/page.tsx` `LogResult.problems[0]` 无 `solution_cpp` / `solution_python` / `time_limit` / `memory_limit` 字段
- [ ] `app/api/admin/ai/generate/route.ts` 无 `skipTestCases` 解构与透传
- [ ] `lib/ai/prompts/core/types.ts` `ParamGenContext` 无 `skipTestCases` 字段
- [ ] `lib/ai/generator.ts` `GenerationParams` 无 `skipTestCases` 字段
- [ ] `lib/ai/generator.ts` `mapToContext` 不再设 `skipTestCases`
- [ ] 全文 grep `skipTestCases` / `补全测试数据` / `仅生成题目描述` / `handleGenerateTestCases` / `solutionCpp` 各 0 处

## Schema 校验

- [ ] `lib/ai/quality-check.ts` 导出 `PROBLEM_SCHEMA` 常量
- [ ] `lib/ai/quality-check.ts` 导出 `checkJsonAgainstSchema(parsedProblem)` 函数
- [ ] `lib/ai/quality-check.ts` 导出 `checkTestCasesAgainstSchema(parsedTestCases)` 函数
- [ ] `lib/ai/generator.ts` 解析后调用 `checkJsonAgainstSchema`，缺失字段 push 到 `qualityIssues`
- [ ] `lib/ai/generator.ts` 调用 `checkTestCasesAgainstSchema` 校验 testCases
- [ ] `app/admin/ai-generation/page.tsx` 结果区支持红色 chip 显示 schema 错误（与黄色自检提示区分）
- [ ] 红色 chip 提示文案格式：`题目 #N 缺失字段：title, testCases`

## 端到端验证

- [ ] 重启 dev server
- [ ] 用户输入主题"高精加"、难度"普及"、数量"1 道"
- [ ] 点"开始生成"按钮
- [ ] 5-15 秒后结果卡片直接显示：标题、描述、样例、tags、**testCases**（无需再点"补全"）
- [ ] "创建此题目"按钮可用，点进去后 [app/admin/problems/create/page.tsx](file:///e:/桌面/oj/app/admin/problems/create/page.tsx) 自动填充所有字段（含 testCases 间接通过 query string 携带）

## 代码质量

- [ ] `npx tsc --noEmit` 0 错误
- [ ] `git status` 无未提交变更
- [ ] AI 出题页只剩 1 个主操作按钮（"开始生成"）+ 1 个重试按钮（结果卡片上）
- [ ] AI 出题页生成设置区域无"拆分 / 一次性"切换开关
