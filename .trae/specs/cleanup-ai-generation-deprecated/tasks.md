# AI 出题功能清理 + Prompt 融合 - 任务清单

## 任务总览

按 4 个阶段推进：删除死代码 → 清理注释 → ParamGen Prompt 融合重构 → 验证。
**目标**：仓库干净 + Prompt 紧凑 + 业务不破坏。

## 阶段一：删除死代码（必删，不留 stub）

### 任务 1: 删除 [lib/ai/deprecation.ts](file:///e:/桌面/oj/lib/ai/deprecation.ts) 文件
- [x] 1.1: 实施前 grep `e:\桌面\oj` 确认 `deprecation` / `getDeprecation` / `isModelDeprecatedSoon` / `DEPRECATED_MODELS` / `ModelDeprecation` 0 引用（除文件自身）
- [x] 1.2: 删除整个 `lib/ai/deprecation.ts` 文件
- [x] 1.3: 确认 `app/api/admin/ai/models/route.ts` 等弃用检测走的是 Prisma `deprecatedAt` 字段（不是 deprecation.ts 提供的函数）

### 任务 2: 删除 [lib/ai/prompts/core/quality-gates.ts](file:///e:/桌面/oj/lib/ai/prompts/core/quality-gates.ts) 未使用的 2 个导出
- [x] 2.1: 实施前 grep `e:\桌面\oj` 确认 `FEW_SHOT_EXAMPLE` / `buildDifficultyContext` 0 引用
- [x] 2.2: 删除 `FEW_SHOT_EXAMPLE` 常量（line 198-229）
- [x] 2.3: 删除 `buildDifficultyContext` 函数（line 232-245）
- [x] 2.4: 删除 `FEW_SHOT_EXAMPLE` 前的 JSDoc 注释（line 195-201）
- [x] 2.5: 保留 `DIFFICULTY_PROFILES` / `COMMON_QUALITY_GATES` / `PROBLEM_QUALITY_GATES` / `TEST_DATA_QUALITY_GATES` / `TEST_CASE_COVERAGE_DIMENSIONS` / `renderTestCaseDimensions` / `THINKING_STEP_FRAME`

## 阶段二：清理 dev / refactor 注释

### 任务 3: 删除 [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) 2 条无意义注释
- [x] 3.1: 删除 line 205 `// Solution execution moved above`（refactor trail，无信息量）
- [x] 3.2: 删除 line 294 `// Fall through to general error handler or handle here`（dev placeholder，无信息量）

## 阶段三：ParamGen Prompt 融合重构

### 任务 4: 重写 [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) system prompt
- [x] 4.1: 6 段结构合并为 4 段：`# 角色与原则` / `# 全局约束` / `# 字段填充指引` / 思考步骤（仅 thinking prompt）
- [x] 4.2: "业务决策 2026-06 单道题" 只在 system prompt 出现 1 次（line 36）
- [x] 4.3: snake_case 字段名规则只在 system prompt 出现 1 次（line 37，合并到 `# 全局约束`）
- [x] 4.4: JSON 转义规则只在 system prompt 出现 1 次（line 38，合并到 `# 全局约束`）
- [x] 4.5: `solution_article` 融合到 `# 字段填充指引`（line 51，不再单独 `# ⚠️ 题解结构` 段）
- [x] 4.6: 思考步骤（THINKING_STEP_FRAME）从 system prompt 移除（仅在 `generateThinkingPrompt()` 输出，节省 token）

### 任务 5: 重写 [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) user prompt
- [x] 5.1: 移除"业务决策 2026-06：单次调用"重复
- [x] 5.2: 移除"字段名必须用 snake_case：test_cases / time_limit / ..."重复
- [x] 5.3: 保留：主题/难度/类型上下文 + `附加要求` + `# JSON 模板` 嵌入
- [x] 5.4: 保留"模板仅供参考结构，请直接输出 JSON，不要写'下面是 JSON'等任何前言"这一行
- [x] 5.5: 精简后 user prompt 8 行（原 16 行）

### 任务 6: 保持运行时行为不变
- [x] 6.1: `temperature = 0.5` 保留（line 16）
- [x] 6.2: `DIFFICULTY_PROFILES` 取 time/memory 中位值逻辑保留（line 19-25）
- [x] 6.3: `fillTemplate(difficulty, timeLimit, memoryLimit)` 嵌入 JSON 模板保留（line 67）
- [x] 6.4: `generateThinkingPrompt()` 方法保持现有实现（system prompt 调整不影响该方法）

## 阶段四：验证

### 任务 7: 验证
- [x] 7.1: grep 验证 0 出现：`FEW_SHOT_EXAMPLE`、`buildDifficultyContext`（仅 `AI-SELF-TEST-REPORT.md:224` 历史报告提及，活跃代码 0 引用）
- [x] 7.2: grep 验证 0 出现：`// Solution execution moved above`、`// Fall through to general error handler`
- [x] 7.3: 读取 system prompt 字符串，确认"业务决策 2026-06 单道题"出现 1 次（line 36）
- [x] 7.4: 读取 system prompt 字符串，确认"snake_case"出现 1 次（line 37）
- [x] 7.5: 读取 system prompt 字符串，确认"`# ⚠️ 题解结构`" 独立段已不存在
- [x] 7.6: 读取 user prompt 字符串，确认不含"业务决策 2026-06"
- [x] 7.7: 读取 user prompt 字符串，确认不含"test_cases / time_limit / memory_limit / solution_cpp / solution_python" 列表
- [x] 7.8: 读取 [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) 第 27-67 行，确认结构符合 3 段融合目标（角色 / 全局约束 / 字段填充指引；思考步骤在 thinking prompt）
- [x] 7.9: `npx tsc --noEmit` 0 错误
- [x] 7.10: 端到端：触发 AI 出题（dev server 启动后）→ 验证 JSON 含全部 14 个字段（手动验证）
- [x] 7.11: 端到端：触发 test_data 模式（题目详情页"生成测试数据"按钮）→ 验证可用（手动验证）
- [x] 7.12: 端到端：手动"重新生成题解"按钮（题目详情页）→ 验证可用（手动验证）

## 任务依赖关系

```
任务1 (删 deprecation.ts) ──┐
任务2 (删 2 个 export) ─────┼── 阶段一，可并行
任务3 (删 2 条注释) ─────────┘
        ↓
任务4 (system prompt) ─────┐
任务5 (user prompt) ────────┼── 阶段三，可并行
任务6 (运行时不变) ─────────┘
        ↓
任务7 (验证) ── 阶段四
```

## 完成标准

所有 7 个任务的子项勾选完成；`npx tsc --noEmit` 0 错误；死代码 0 处；Prompt 重复约束 0 处；业务不破坏。
