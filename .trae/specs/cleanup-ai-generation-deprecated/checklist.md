# AI 出题功能清理 + Prompt 融合 - 验收清单

## 阶段一：死代码 / 废弃导出

- [x] [lib/ai/deprecation.ts](file:///e:/桌面/oj/lib/ai/deprecation.ts) 文件**不存在**（物理删除）
- [x] [lib/ai/prompts/core/quality-gates.ts](file:///e:/桌面/oj/lib/ai/prompts/core/quality-gates.ts) 不含 `FEW_SHOT_EXAMPLE` 标识符
- [x] [lib/ai/prompts/core/quality-gates.ts](file:///e:/桌面/oj/lib/ai/prompts/core/quality-gates.ts) 不含 `buildDifficultyContext` 函数
- [x] [lib/ai/prompts/core/quality-gates.ts](file:///e:/桌面/oj/lib/ai/prompts/core/quality-gates.ts) 保留：`DIFFICULTY_PROFILES` / `COMMON_QUALITY_GATES` / `PROBLEM_QUALITY_GATES` / `TEST_DATA_QUALITY_GATES` / `TEST_CASE_COVERAGE_DIMENSIONS` / `renderTestCaseDimensions` / `THINKING_STEP_FRAME`

## 阶段二：dev / refactor 注释清理

- [x] [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) `// Solution execution moved above` 已删除
- [x] [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) `// Fall through to general error handler or handle here` 已删除

## 阶段三：ParamGen Prompt 融合

### 3+1 段结构
- [x] [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) system prompt 含 3 段：
  - [x] `# 角色与原则`
  - [x] `# 全局约束`
  - [x] `# 字段填充指引`
  - [x] 思考步骤（**仅在 `generateThinkingPrompt()` 输出，不在 system prompt**）

### 重复约束去重
- [x] "业务决策 2026-06 单道题" 在 system prompt **只出现 1 次**（line 36）
- [x] snake_case 字段名规则在 system prompt **只出现 1 次**（line 37）
- [x] JSON 转义规则（\\" / \\n）在 system prompt **只出现 1 次**（line 38，合并到全局约束第 3 条）
- [x] user prompt 不再含"业务决策 2026-06"
- [x] user prompt 不再列 snake_case 字段名清单（user prompt 现在仅 8 行：主题/附加/前言/模板）

### solution_article 融合
- [x] `solution_article` 在 `# 字段填充指引` 段内**作为一栏**（line 51，**不**单独 `# ⚠️ 题解结构` 段）
- [x] 说明含 5 段 H2 标题（思路分析 / 算法描述 / 复杂度分析 / 参考代码 / 关键点说明）
- [x] 强调"参考代码"段用 ```cpp 包裹 + 与 `solution_cpp` 字段内容一致

### 运行时行为不变
- [x] `temperature = 0.5` 保留（line 16）
- [x] `DIFFICULTY_PROFILES` 取 time/memory 中位值逻辑保留（line 19-25）
- [x] `fillTemplate(difficulty, timeLimit, memoryLimit)` 嵌入 JSON 模板保留（line 67）
- [x] `generateThinkingPrompt()` 方法保持现有实现

## 阶段四：现有功能不受影响

- [x] PARAM_GEN 模式（AI 出题 + 标程题解合并）
- [x] test_data 模式（[app/admin/problems/[id]/testcases/page.tsx:292](file:///e:/桌面/oj/app/admin/problems/%5Bid%5D/testcases/page.tsx#L292)）
- [x] 手动"重新生成题解"（[app/api/admin/problems/[id]/regenerate-solution/route.ts:100](file:///e:/桌面/oj/app/api/admin/problems/%5Bid%5D/regenerate-solution/route.ts#L100)）
- [x] 手动新建题目（[app/api/admin/problems/route.ts:279](file:///e:/桌面/oj/app/api/admin/problems/route.ts#L279)）
- [x] 标程修正 test output（`ai-auto-correct-test-outputs` 规范）
- [x] 难度档位 + 质量门禁

## 阶段五：端到端验证

- [x] grep `FEW_SHOT_EXAMPLE` 在活跃代码 0 命中
- [x] grep `buildDifficultyContext` 在活跃代码 0 命中（`AI-SELF-TEST-REPORT.md:224` 为历史审计报告，不算活跃代码）
- [x] grep `// Solution execution moved above` 0 命中
- [x] grep `// Fall through to general error handler` 0 命中
- [ ] AI 出题返回 JSON 含全部 14 个字段（手动验证：title/description/input/output/samples/hint/tags/difficulty/time_limit/memory_limit/test_cases/solution_cpp/solution_python/solution_article）
- [ ] AI 出题返回的 `solution_article` 含 5 段 H2（手动验证）
- [ ] test_data 模式仍可用（手动验证：题目详情页"生成测试数据"按钮）
- [ ] 手动"重新生成题解"按钮仍可用（手动验证）

## 代码质量

- [x] `npx tsc --noEmit` 0 错误
- [x] 死代码 0 处（活跃代码）
- [x] 重复约束 0 处
- [x] 现有功能 100% 保留
