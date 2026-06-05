# AI 出题功能清理 + Prompt 融合优化规范

## Why

最近几轮迭代（`simplify-ai-generation-flow` / `ai-auto-correct-test-outputs` / `unify-ai-problem-and-solution`）后，AI 出题相关代码留下了**三类问题**：

1. **死代码 / 废弃代码**：`lib/ai/deprecation.ts`（0 引用）、`FEW_SHOT_EXAMPLE`（被新 `fillTemplate` 取代）、`buildDifficultyContext`（已定义未使用）、`lib/ai/queue.ts` 里的 2 条 dev 注释（refactor trail / placeholder）。继续保留会污染代码库、误导后续开发者。

2. **Prompt 碎片化 / 重复约束**：[lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) system prompt 现在有 6 段：
   - `# 你的任务`
   - `# ⚠️ 字段名固定规则`
   - `# ⚠️ 单道题输出约束`
   - `# ⚠️ 响应长度与字段密度`
   - `# 字段填充指引`
   - `# ⚠️ 题解结构`（上一轮 `unify-ai-problem-and-solution` **直接追加** 到末尾，**没有融合**到现有结构里）
   
   user prompt 又重复了"业务决策 2026-06 单道题"和"snake_case 字段名"两条约束。AI 看到的 prompt 越冗长越割裂，越容易**忽略关键规则**（如转义、引号、solution_article 的 5 段式）。

3. **dev 注释残留**：`lib/ai/queue.ts:205` `// Solution execution moved above` 是重构 trail，`lib/ai/queue.ts:294` `// Fall through to general error handler or handle here` 是开发占位。

**目标**：直接删除死代码与 dev 注释，对 ParamGen system prompt 做**一次完整梳理**（不是再 append 一段，而是把 `solution_article` 融合到 `# 字段填充指引` 段，把重复的"业务决策 2026-06 / snake_case / 转义规则"统一到顶部），输出**更紧凑、层次更清晰**的 prompt。

## What Changes

### 1. 删除死代码 / 废弃导出
- **删除文件**：[lib/ai/deprecation.ts](file:///e:/桌面/oj/lib/ai/deprecation.ts) — 整个文件 0 引用
- **删除导出**：[lib/ai/prompts/core/quality-gates.ts](file:///e:/桌面/oj/lib/ai/prompts/core/quality-gates.ts) 第 198-229 行 `FEW_SHOT_EXAMPLE`（被 `fillTemplate` 取代）
- **删除导出**：[lib/ai/prompts/core/quality-gates.ts](file:///e:/桌面/oj/lib/ai/prompts/core/quality-gates.ts) 第 232-245 行 `buildDifficultyContext`（0 引用）

### 2. 清理 dev / refactor 注释
- **删除** [lib/ai/queue.ts:205](file:///e:/桌面/oj/lib/ai/queue.ts#L205) `// Solution execution moved above`
- **删除** [lib/ai/queue.ts:294](file:///e:/桌面/oj/lib/ai/queue.ts#L294) `// Fall through to general error handler or handle here`

### 3. ParamGen Prompt 融合重构 [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts)

**重写原则**：
- 6 段合并为 **4 段**（角色 / 全局约束 / 字段填充 / 思考步骤）
- "业务决策 2026-06 单道题" **只在 system prompt 出现 1 次**（不再在 user prompt 重复）
- snake_case 规则、JSON 转义规则 **各只出现 1 次**（合并到"全局约束"段顶部）
- `solution_article` 融合到 `# 字段填充指引` 段（不再单独 `# ⚠️ 题解结构` 段）

**重写后结构**（精简后约 60 行，原 90 行）：

```
[System Prompt]
1. 角色与原则（你是 JSON 填空机器人 + 6 条硬规则）
2. 全局约束（业务决策 / snake_case / 转义 / 单道题 4 条不可违反）
3. 字段填充指引（每个字段 1-2 行；solution_article 融入此段，不再独立成段）
4. 思考步骤（仅思考阶段使用，运行时通过 generateThinkingPrompt 单独输出）
```

**User Prompt**（精简后约 20 行，原 30 行）：
- 删除"业务决策 2026-06 单次调用"（已在 system 出现过）
- 删除"字段名必须用 snake_case：test_cases / time_limit ..."（已在 system 出现过）
- 保留：主题/难度/类型上下文 + JSON 模板嵌入

### 4. 不动的部分
- **TestDataGen** 模式（[lib/ai/prompts/test-data/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/test-data/generator.ts)）：`app/admin/problems/[id]/testcases/page.tsx:292` 仍调用 `mode: 'test_data'`，前端"生成测试数据"按钮依赖，**保留**
- **`enqueueSolutionJob`** 仍被 `app/api/admin/problems/route.ts:279` 和 `app/api/admin/problems/[id]/regenerate-solution/route.ts:100` 调用，**保留**
- **`lib/ai/solution-queue.ts` / `lib/ai/solution-generator.ts`**：**保留**
- **TestDataGen 的 system prompt**：业务独立，**不在本次范围**

## Impact

- Affected code:
  - [lib/ai/deprecation.ts](file:///e:/桌面/oj/lib/ai/deprecation.ts) (整文件删除)
  - [lib/ai/prompts/core/quality-gates.ts](file:///e:/桌面/oj/lib/ai/prompts/core/quality-gates.ts) (删除 2 个未用导出)
  - [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) (删除 2 条注释)
  - [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) (system prompt + user prompt 重写)
- Affected specs:
  - `unify-ai-problem-and-solution`（上一轮在 paramgen prompt 追加的 `solution_article` 段落要重写，**不是 append**）
  - `simplify-ai-generation-flow`（已实施）
  - `ai-auto-correct-test-outputs`（已实施）
- 不影响其他模块（`enqueueSolutionJob` / `TestDataGen` / `quality-check.ts` / `response-parser.ts` / `providers.ts` 等不动）

## ADDED Requirements

### Requirement: 死代码 / dev 注释彻底删除（不留注释代替删除）
The system SHALL 直接删除以下死代码与 dev 注释，**不**用 `// removed` / `// deprecated` / `// @ts-ignore` 等方式注释保留。

#### Scenario: 死代码 / dev 注释被物理删除
- **WHEN** 完成本规范
- **THEN** 下列项在代码库中**0 出现**（grep 验证）：
  - `lib/ai/deprecation.ts` 文件不存在
  - `FEW_SHOT_EXAMPLE` 标识符 0 出现
  - `buildDifficultyContext` 标识符 0 出现
  - `// Solution execution moved above` 0 出现
  - `// Fall through to general error handler or handle here` 0 出现

### Requirement: ParamGen Prompt 融合重构（4 段 + 1 份 user）
The system SHALL 重写 [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) 的 `systemPrompt` / `userPrompt`，结构为 4 段融合。

#### Scenario: 重复约束只在 system prompt 出现 1 次
- **WHEN** AI 收到 system prompt
- **THEN** 下列规则在 system prompt **各只出现 1 次**（不重复）：
  - 业务决策 2026-06 单道题
  - snake_case 字段名规则（test_cases / time_limit / memory_limit / solution_cpp / solution_python / solution_article）
  - JSON 转义规则（\\" / \\n）
- **AND** user prompt **不**再重复这些规则

#### Scenario: solution_article 融合到字段填充指引
- **WHEN** 字段填充指引段被 AI 解析
- **THEN** `solution_article` 字段说明在 `# 字段填充指引` 段内**作为一栏**出现，**不**单独成段
- **AND** 说明包含 5 段 H2 标题（思路分析 / 算法描述 / 复杂度分析 / 参考代码 / 关键点说明）
- **AND** 强调"参考代码"段用 ```cpp 包裹 + 与 solution_cpp 字段内容一致

#### Scenario: 思考步骤仅在 generateThinkingPrompt 输出
- **WHEN** 业务未触发 thinking 步骤
- **THEN** system prompt **不**包含"思考步骤"段（`THINKING_STEP_FRAME` 内容仅在 `generateThinkingPrompt()` 输出，避免在 system prompt 占 token）

### Requirement: 删除内容不破坏现有功能
The system SHALL 在删除死代码 / 重写 prompt 后，**不破坏**以下已实施功能。

#### Scenario: 现有功能不受影响
- **WHEN** 完成所有清理
- **THEN** 仍可用：
  - PARAM_GEN 模式（AI 出题 + 标程题解合并）
  - test_data 模式（"生成测试数据"按钮，[app/admin/problems/[id]/testcases/page.tsx:292](file:///e:/桌面/oj/app/admin/problems/%5Bid%5D/testcases/page.tsx#L292)）
  - 手动"重新生成题解"（[app/api/admin/problems/[id]/regenerate-solution/route.ts:100](file:///e:/桌面/oj/app/api/admin/problems/%5Bid%5D/regenerate-solution/route.ts#L100)）
  - 手动新建题目（[app/api/admin/problems/route.ts:279](file:///e:/桌面/oj/app/api/admin/problems/route.ts#L279)）
  - 标程修正 test output（`ai-auto-correct-test-outputs` 规范）
  - 难度档位 + 质量门禁（`COMMON_QUALITY_GATES` / `PROBLEM_QUALITY_GATES` 保留）

## MODIFIED Requirements

### Requirement: ParamGen Prompt 结构
**原行为**（重构前）：
- 6 段：`# 你的任务` / `# ⚠️ 字段名固定规则` / `# ⚠️ 单道题输出约束` / `# ⚠️ 响应长度与字段密度` / `# 字段填充指引` / `# ⚠️ 题解结构`（上一轮 append）
- user prompt 重复"业务决策 2026-06"和"snake_case"两条
- 字段填充指引中无 `solution_article` 说明

**新行为**（重构后）：
- 4 段：`# 角色与原则` / `# 全局约束` / `# 字段填充指引` / 思考步骤（仅 thinking prompt）
- 重复规则去重，全部集中在 `# 全局约束` 段
- `solution_article` 融入 `# 字段填充指引`
- user prompt 只承担：上下文注入 + JSON 模板嵌入

**Migration**：
- 改写 [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) 的 `generate()` 方法 systemPrompt 字符串
- 改写 userPrompt 字符串（去除重复）
- 保持 `temperature = 0.5` / `finalCount = 1` / `DIFFICULTY_PROFILES` 取中位值等运行时行为不变
- 保持 `generateThinkingPrompt()` 行为不变（只是 system prompt 不再含思考步骤）

## REMOVED Requirements

### Requirement: lib/ai/deprecation.ts 模块
**Reason**：0 引用文件（grep 验证），最初设计意图（"模型 ID 弃用检测"）与当前架构不匹配（[lib/ai/providers.ts](file:///e:/桌面/oj/lib/ai/providers.ts) + [app/api/admin/ai/models](file:///e:/桌面/oj/app/api/admin/ai/models) 已覆盖弃用场景）。
**Migration**：直接删除文件，不留 stub。

### Requirement: FEW_SHOT_EXAMPLE 常量
**Reason**：[lib/ai/prompts/paramgen/json-template.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/json-template.ts) 的 `SINGLE_PROBLEM_TEMPLATE` / `fillTemplate` 已完整取代（AI 填空式生成不需要 few-shot 范例）。
**Migration**：删除 export，不留 stub。

### Requirement: buildDifficultyContext 函数
**Reason**：0 引用，DIFFICULTY_PROFILES 已通过 `timeLimitRange` / `memoryLimitRange` 中位值直接注入 prompt，函数本身不增加价值。
**Migration**：删除 export；DIFFICULTY_PROFILES 保留（仍在用）。

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 删除 `deprecation.ts` 误删了某处隐藏引用 | 实施前 grep 整个 `e:\桌面\oj` 确认 0 引用（包括 `*.md` 文档） |
| Prompt 重写后 AI 行为变化（字段名拼写 / 转义忘记） | 端到端：触发 AI 出题验证返回 JSON 仍包含全部 14 个字段（REQUIRED_FIELDS） |
| 删 `FEW_SHOT_EXAMPLE` 后 AI 写不出 5 段式 solution_article | system prompt 内 `# 字段填充指引` 段已写明 5 段 H2 结构与 solution_cpp 一致要求 |
| 删除 `buildDifficultyContext` 影响某个未发现的调用 | 实施前 grep 整个 `e:\桌面\oj` 确认 0 引用 |
| 删除 dev 注释引入理解成本 | 注释无业务含义（"moved above" / "fall through"），删除后代码自解释 |

## 验证标准

- [ ] `lib/ai/deprecation.ts` 文件**不存在**
- [ ] `FEW_SHOT_EXAMPLE` 在仓库中 0 出现
- [ ] `buildDifficultyContext` 在仓库中 0 出现
- [ ] `// Solution execution moved above` 0 出现
- [ ] `// Fall through to general error handler or handle here` 0 出现
- [ ] `lib/ai/prompts/paramgen/generator.ts` system prompt 含 4 段结构（角色 / 全局约束 / 字段填充指引 / 思考步骤）
- [ ] system prompt "业务决策 2026-06 单道题" **只出现 1 次**
- [ ] system prompt snake_case 规则 **只出现 1 次**
- [ ] system prompt 转义规则 **只出现 1 次**
- [ ] `solution_article` 在 `# 字段填充指引` 段内（**不**单独成段）
- [ ] user prompt 不再含"业务决策 2026-06"
- [ ] user prompt 不再列 snake_case 字段名清单
- [ ] `npx tsc --noEmit` 0 错误
- [ ] 端到端：AI 出题 1 道 → 返回 JSON 含全部 14 个字段（title/description/input/output/samples/hint/tags/difficulty/time_limit/memory_limit/test_cases/solution_cpp/solution_python/solution_article）
- [ ] 端到端：题解的 solution_article 含 5 段 H2
- [ ] test_data 模式仍可用（[app/admin/problems/[id]/testcases/page.tsx](file:///e:/桌面/oj/app/admin/problems/%5Bid%5D/testcases/page.tsx) 不报错）
- [ ] 手动"重新生成题解"按钮仍可用

## 验收清单

见 [checklist.md](file:///e:/桌面/oj/.trae/specs/cleanup-ai-generation-deprecated/checklist.md)
