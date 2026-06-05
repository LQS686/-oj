# AI 题目 + 题解合并生成规范

## Why

当前 AI 出题（PARAM_GEN 模式）走的是**两段式链路**：
1. AI 调用 1：生成题目（含 `solution_cpp` / `solution_python` 标程）→ 入库 Problem
2. AI 调用 2：基于题目描述 + 标程生成 markdown 题解文章 → 入库 Solution

用户在 `app/admin/ai-generation` 截图里看到 **"2 个任务进行中"**（对应两个 `AiGenerationLog` 条目），引发困惑：
- 用户只想要 1 道题，为什么显示 2 个任务？
- 两个任务串行排队，第一段失败 → 第二段永远不触发；JSON 解析失败概率叠加
- 链路过长，调试和监控成本高

**目标**：**单次 AI 调用**同时返回题目 + 题解文章，题解直接写入 `Solution` 表，**1 个任务完成所有事情**。`enqueueSolutionJob` 队列**保留**供手动路径（手动新建题目 + 手动重新生成题解按钮）使用，但**不**在 AI 出题链路里被自动触发。

## What Changes

### 1. JSON 模板新增 `solution_article` 字段
- 在 [lib/ai/prompts/paramgen/json-template.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/json-template.ts) 的 `SINGLE_PROBLEM_TEMPLATE` 末尾追加 `solution_article` 字段
- 同步更新 `REQUIRED_FIELDS` 常量（把 `solution_article` 设为必填）

### 2. Prompt 增补题解结构说明
- [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) 的 system prompt 增加"题解结构"段落
- 复用 [lib/ai/solution-generator.ts](file:///e:/桌面/oj/lib/ai/solution-generator.ts) 的 5 段式结构（思路分析 / 算法描述 / 复杂度分析 / 参考代码 / 关键点说明），保持两种来源的题解风格一致
- 强调"参考代码"段使用 markdown 代码块包裹，与 `solution_cpp` 内容一致（避免 AI 写两套代码）

### 3. PARAM_GEN 路径直接写 Solution（移除自动入队）
- [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) PARAM_GEN 循环中**移除** `enqueueSolutionJob` 调用
- 在 `prisma.problem.create()` 成功后，**直接**调 `prisma.solution.create()` 写一条题解记录：
  - `content = problem.solution_article`
  - `code = problem.solution_cpp || problem.solution_python || null`
  - `codeLanguage = 'cpp' | 'python' | null`（与 `code` 对应）
  - `language = codeLanguage`（兼容字段）
  - `isAiGenerated = true`
  - `isOfficial = true`
  - `sourceType = 'AI_OFFICIAL'`
  - `authorId = job.data.userId`
  - `title = \`AI 标程题解 - ${problem.title}\``
- 同题同源（`problemId + sourceType='AI_OFFICIAL'`）的旧记录先 `deleteMany`（保持"同题只有一份 AI 标程题解"）

### 4. 容错：题解字段缺失
- 若 `problem.solution_article` 为空字符串 / 缺失：
  - `logger.warn` 记录，但**不**阻断主流程
  - 题目仍然正常入库
  - 题解记录**不**创建（用户可在题目详情页手动点"重新生成题解"按钮触发备用路径）

### 5. `GeneratedProblem` 类型同步
- [lib/ai/prompts/core/types.ts](file:///e:/桌面/oj/lib/ai/prompts/core/types.ts) `GeneratedProblem` 接口新增 `solution_article?: string` 字段

### 6. token 上限评估
- 当前 ParamGen `max_tokens: 16384`（[lib/ai/generator.ts:293](file:///e:/桌面/oj/lib/ai/generator.ts#L293)）
- 估算：题目 JSON + 15 组 test_cases + 标程（C++ 30-80 行 + Python 20-40 行）≈ 5-8k tokens；题解 5 段 markdown ≈ 2-4k tokens
- **结论**：16384 tokens 足够，**不调整**；若实际运行中触发截断告警，再上调到 24576
- 在 spec 里写明评估依据，**避免**无脑调大（成本上升、延迟增加）

## Impact

- Affected code:
  - [lib/ai/prompts/paramgen/json-template.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/json-template.ts) (追加字段 + REQUIRED_FIELDS)
  - [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) (system prompt 增补题解结构)
  - [lib/ai/prompts/core/types.ts](file:///e:/桌面/oj/lib/ai/prompts/core/types.ts) (`GeneratedProblem.solution_article?`)
  - [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) (移除 `enqueueSolutionJob` 调用 + 改为直接 `prisma.solution.create()`)
- Affected specs: `ai-auto-correct-test-outputs`（之前在 PARAM_GEN 加的 `enqueueSolutionJob` 调用要回退；test data output 修正逻辑保留）
- 不影响 `enqueueSolutionJob` / `generateSolutionForProblem` 本身 — 手动路径仍可用
- 不影响前端的 `concurrent-single-problem-generation` — 任务数从 2 变 1，UI 行为更清晰

## ADDED Requirements

### Requirement: 单次 AI 调用同时生成题目 + 题解
The system SHALL 在 ParamGen 模式下，让 AI 在**一次**调用中同时返回题目字段与 `solution_article`（markdown 题解内容）。

#### Scenario: AI 完整返回题目 + 题解
- **WHEN** ParamGen 触发，AI 返回 JSON 含完整题目字段 + `solution_article`
- **THEN** 数据库创建 1 条 `Problem` 记录 + 1 条 `Solution` 记录
- **AND** `AiGenerationLog` 只有 1 条 `PENDING → COMPLETED` 记录
- **AND** UI 展示 "1 个任务进行中"（不再 "2 个任务"）

#### Scenario: AI 缺失 solution_article
- **WHEN** ParamGen 触发，AI 返回 JSON 但 `solution_article` 为空 / 缺失
- **THEN** `Problem` 记录正常创建
- **AND** `Solution` 记录**不**创建
- **AND** `AiGenerationLog.result.solutionStatus = 'missing'` 字段写入
- **AND** `logger.warn` 记录
- **AND** 题目详情页可点"手动重新生成题解"按钮触发备用 `enqueueSolutionJob` 路径

#### Scenario: 题解被截断（max_tokens 不足）
- **WHEN** AI 响应被 max_tokens 截断导致 JSON 不闭合 / `solution_article` 字段截断
- **THEN** `response-parser` 的截断检测触发（如已有 `isLikelyTruncated` 逻辑）→ 抛 `AI_PARSE_FAILED`
- **AND** 整个任务标记 FAILED，**不**入库半成品题目
- **AND** AiGenerationLog.result.parseFailed = true

### Requirement: 题解 5 段式结构
The system SHALL 在 ParamGen system prompt 中要求 AI 输出与 [lib/ai/solution-generator.ts](file:///e:/桌面/oj/lib/ai/solution-generator.ts) 一致的 5 段式题解结构：思路分析 / 算法描述 / 复杂度分析 / 参考代码 / 关键点说明，使用 H2 `##` 分隔。

#### Scenario: AI 输出 5 段题解
- **WHEN** ParamGen 完成
- **THEN** `problem.solution_article` 包含全部 5 个 H2 标题
- **AND** "参考代码"段使用 markdown ```cpp ... ``` 包裹完整 C++17 代码
- **AND** "参考代码"段内容与 `problem.solution_cpp` **完全一致**（避免双份标程）

### Requirement: 同一题目只有一份 AI 标程题解
The system SHALL 在创建新 Solution 记录前，对同 `problemId + sourceType='AI_OFFICIAL'` 的旧记录 `deleteMany`（避免重复题解堆积）。

#### Scenario: 同一题目被重新生成
- **WHEN** 用户对同一 AI 题目再次触发 ParamGen（或手动重跑 AI 出题）
- **THEN** 旧的 `sourceType='AI_OFFICIAL'` Solution 记录被删除
- **AND** 创建新的 Solution 记录
- **AND** 数据库中该题目的 AI 标程题解始终只有 1 条

### Requirement: PARAM_GEN 路径不再自动入队题解生成任务
The system SHALL 在 [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) PARAM_GEN 循环中**不**调用 `enqueueSolutionJob()`，避免产生第 2 个 `AiGenerationLog` 记录。

#### Scenario: PARAM_GEN 题目创建后
- **WHEN** `prisma.problem.create()` 成功
- **THEN** 立即 `prisma.solution.create()`（若 solution_article 存在）
- **AND** **不**调用 `enqueueSolutionJob`
- **AND** 1 个 AI 出题任务 = 1 个 AiGenerationLog

### Requirement: 手动路径不受影响
The system SHALL 保留 `enqueueSolutionJob` / `generateSolutionForProblem` 的全部功能，供以下手动路径使用：
- [app/api/admin/problems/route.ts:279](file:///e:/桌面/oj/app/api/admin/problems/route.ts#L279) — 手动新建题目 API
- [app/api/admin/problems/[id]/regenerate-solution/route.ts:100](file:///e:/桌面/oj/app/api/admin/problems/%5Bid%5D/regenerate-solution/route.ts#L100) — 手动重新生成题解按钮

#### Scenario: 管理员点击"重新生成题解"
- **WHEN** 管理员在题目详情页点"重新生成题解"按钮
- **THEN** 调用 `enqueueSolutionJob` → 创建 1 条 `AiGenerationLog`（用于前端轮询）
- **AND** `generateSolutionForProblem` 单独跑 1 次 AI 调用
- **AND** 该独立任务**不**依赖 PARAM_GEN 流程

## MODIFIED Requirements

### Requirement: AI 出题 ParamGen 链路
**原行为**：
- ParamGen → AI 返回题目 → `prisma.problem.create()` → 调 `enqueueSolutionJob()` → 独立 Solution Queue 跑 AI 调用 2 → 写 Solution

**新行为**：
- ParamGen → AI 返回题目 + 题解 → `prisma.problem.create()` + `prisma.solution.create()` 同步完成 → 1 个 AiGenerationLog 收尾

**Migration**：
- [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) 删除 `import { enqueueSolutionJob }` 行 + PARAM_GEN 内的 `enqueueSolutionJob({...})` 调用块（约 25 行）
- 替换为 `prisma.solution.create()` 块（约 30 行）
- 同步删除 `correctionStatsList.push(correctionStats)` 之后紧跟的 try/catch 块（那是我上一轮加的入队逻辑）

## REMOVED Requirements

### Requirement: AI 出题自动入队题解生成
**Reason**：产生第 2 个 AiGenerationLog 任务，与"单题模式"业务决策冲突；题解已在 AI 主调用中一并生成，无需二次调用。
**Migration**：
- [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) PARAM_GEN 路径移除 `enqueueSolutionJob` 调用
- `enqueueSolutionJob` / `generateSolutionForProblem` / `solution-queue.ts` 函数本身**保留**（供手动路径使用）

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| AI 单次输出字段更多 → JSON 截断概率上升 | 当前 `max_tokens: 16384` 经评估足够（题目 5-8k + 题解 2-4k = 7-12k，留 4-9k 余量）；若实测截断再上调到 24576 |
| AI 题解质量下降（一次性写题解 vs 拆开） | 5 段式结构 + 标程参考 + 难度档位上下文，给 AI 足够输入，质量不应下降；可在 prompt 中要求"参考 solution_cpp 写'参考代码'段" |
| 字段名拼写错误（AI 写 `solutionArticle` / `solution-article`） | 模板用 snake_case `solution_article`，prompt 显式提醒"必须用 snake_case，与模板 1:1" |
| 题解被截断导致 markdown 不完整 | `response-parser` 的 `isLikelyTruncated` 检测 + JSON parse 失败 → 整体任务 FAILED（不入库半成品） |
| `enqueueSolutionJob` 误删影响手动路径 | 仅删除 PARAM_GEN 内的调用，**不**删除函数本身；保留所有手动调用方 |

## 验证标准

- [ ] ParamGen 单次 AI 调用同时返回题目 + 题解（`solution_article` 字段存在）
- [ ] [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) PARAM_GEN 路径**不**调用 `enqueueSolutionJob`
- [ ] ParamGen 完成 → 数据库 1 条 `Problem` + 1 条 `Solution` + 1 条 `AiGenerationLog(COMPLETED)`
- [ ] UI "X 个任务进行中" 数字从 2 变 1
- [ ] 手动新建题目 API 仍然走 `enqueueSolutionJob` 路径（不受影响）
- [ ] 手动"重新生成题解"按钮仍然走 `enqueueSolutionJob` 路径（不受影响）
- [ ] AI 返回的 `solution_article` 含 5 段 H2 标题（思路分析 / 算法描述 / 复杂度分析 / 参考代码 / 关键点说明）
- [ ] "参考代码"段内容与 `solution_cpp` 一致
- [ ] AI 缺 `solution_article` 时不创建 Solution，Problem 正常入库，log 含 `solutionStatus='missing'`
- [ ] 同题重新生成时旧 `sourceType='AI_OFFICIAL'` Solution 被 deleteMany
- [ ] `npx tsc --noEmit` 0 错误
- [ ] 端到端：点击"开始生成" → 1 个任务 → 完成后"在题库中查看"能看到题解

## 验收清单

见 [checklist.md](file:///e:/桌面/oj/.trae/specs/unify-ai-problem-and-solution/checklist.md)
