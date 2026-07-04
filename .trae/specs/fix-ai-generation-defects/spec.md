# AI 生成功能缺陷修复 Spec

## Why

近期 AI 出题功能出现 JSON 截断（已临时修复 max_tokens）、题解生成无轮询、配置不生效等多类异常。全面扫描发现 8 项 P1 严重缺陷与 14 项 P2 中等问题，覆盖配置传递、错误处理、并发、数据一致性、thinking 模式、prompt 质量与端到端流程。本 spec 旨在系统性修复这些缺陷，确保 AI 相关功能端到端可用。

## What Changes

- 修复 `AiModel.maxTokens/temperature/timeout` 配置项实际生效（A1）
- 修复 `thinkingApiKey` 回退到主 `apiKey` 的安全违规（A2、A4）
- 题解生成 `safeJsonParse` 失败时增加梯度重试（B1）
- 新增题解生成状态查询 API，前端轮询自动刷新（B3 + H1）
- `problemNumber` 分配改为 unique 冲突重试，消除竞态（D1）
- `SolutionQueue` 增加 `maxConcurrent` 并发限制（D2）
- PARAM_GEN 创建 Problem 时同步保存 `stdCode/stdLang`（E1）
- thinking 步骤 content 读取顺序与生成步骤统一（F1、F2）
- `disableThinking` 改为删除 `thinking` 字段而非 `disabled` 值（F3）
- `stripThinkBlocks` 改为非贪婪匹配（I2）
- SolutionQueue `deleteMany + create` 包裹事务（I1）
- 自动发布改为质量门禁通过后再公开（H4）
- `retryAiGeneration` 的 `reduceTemperature || true` 改为 `??`（B2）
- AiQueue/SolutionQueue 增加超时保护与 stuck 检测（C1、C2）
- `AiQueue.executeJob` catch 块用 finally 确保 processing Map 清理（C3）

## Impact

- Affected specs: `verify-ai-generation-end-to-end`, `comprehensively-test-ai-generation`, `unify-ai-problem-and-solution`
- Affected code:
  - `lib/ai/config.ts` — getAiConfig 返回 maxTokens/temperature/timeout
  - `lib/ai/factory.ts` — thinkingApiKey 安全检查，buildChatParams 支持 disableThinking
  - `lib/ai/generator.ts` — 消费 maxTokens/temperature，统一 content 读取顺序
  - `lib/ai/solution-generator.ts` — 增加重试逻辑
  - `lib/ai/solution-queue.ts` — maxConcurrent，超时保护，事务
  - `lib/ai/queue.ts` — problemNumber 重试，超时保护，finally 清理，质量门禁
  - `lib/ai/response-parser.ts` — stripThinkBlocks 非贪婪
  - `lib/ai/service.ts` — retryAiGeneration reduceTemperature 修复
  - `app/api/admin/ai/solution/status/route.ts` — 新增题解状态查询端点
  - `app/admin/problems/[id]/edit/page.tsx` — 题解轮询
  - `app/admin/ai-generation/page.tsx` — 展示 correctionStats/solutionStatus

## ADDED Requirements

### Requirement: 题解生成状态查询 API
系统 SHALL 提供 `GET /api/admin/ai/solution/status?logId=xxx` 端点，返回题解生成任务的状态（PENDING/PROCESSING/COMPLETED/FAILED）、进度与错误信息。

#### Scenario: 题解生成中轮询
- **WHEN** 前端持有 logId 调用此端点
- **THEN** 返回 `{ status: 'PROCESSING', progress: '生成中' }`

#### Scenario: 题解生成完成
- **WHEN** 题解生成任务完成
- **THEN** 返回 `{ status: 'COMPLETED', solution: {...} }`

#### Scenario: 题解生成失败
- **WHEN** 题解生成任务失败
- **THEN** 返回 `{ status: 'FAILED', error: '错误信息' }`

### Requirement: 题解生成前端轮询
系统 SHALL 在 `regenerate-solution` 返回 logId 后，前端自动启动轮询，每 2s 查询状态，完成后自动刷新题解列表，失败时展示错误。

#### Scenario: 重新生成题解
- **WHEN** 用户点击"重新生成题解"
- **THEN** 前端调用 API 入队，获得 logId，启动 2s 轮询
- **WHEN** 轮询返回 COMPLETED
- **THEN** 自动 fetchSolutions，停止轮询，展示新题解
- **WHEN** 轮询返回 FAILED
- **THEN** 停止轮询，展示错误提示

### Requirement: AI 任务超时保护
系统 SHALL 为每个 AI 任务设置最大执行时间（默认 5 分钟，可配置），超时后标记为 FAILED 并清理资源。

#### Scenario: AI 任务超时
- **WHEN** 任务执行超过 5 分钟
- **THEN** 任务标记为 FAILED，error 字段含"执行超时"，processing Map 清理

### Requirement: SolutionQueue 并发限制
系统 SHALL 限制 SolutionQueue 的最大并发数为 2（可配置），避免触发 AI 提供商限流。

## MODIFIED Requirements

### Requirement: AI 模型配置传递
getAiConfig SHALL 返回 `maxTokens`、`temperature`、`timeout` 字段（来自 `AiModel` 表），generator SHALL 优先使用这些配置值，仅当未配置时使用默认值。

### Requirement: thinkingApiKey 安全约束
当 `enableThinking=true` 且 `thinkingProvider !== provider` 时，`thinkingApiKey` 为空 SHALL 抛出明确错误，绝不允许回退到主 `apiKey`。`testAiConnection` SHALL 遵循同样规则。

### Requirement: thinking 步骤 content 读取
thinking 步骤 SHALL 优先读取 `msg.content`（最终输出），仅当 content 为空时回退到 `msg.reasoning_content`，与生成步骤保持一致。

### Requirement: disableThinking 实现
重试时禁用 thinking SHALL 通过删除 `thinking` 字段实现，而非设置 `{ type: 'disabled' }`（可能不被 API 接受）。

### Requirement: problemNumber 分配
problemNumber 分配 SHALL 在 unique 约束冲突时自动重试（最多 3 次，每次重新查询最大值 +1），消除并发竞态。

### Requirement: PARAM_GEN 标程保存
PARAM_GEN 模式创建 Problem 时 SHALL 同步保存 `stdCode` 与 `stdLang`（来自 AI 生成的 `solution_cpp`/`solution_python`），便于后续重新生成测试数据。

### Requirement: 题解生成重试
`generateSolutionForProblem` SHALL 在 `safeJsonParse` 失败时执行 2 次内层重试（降温度 0.2 → 0.0 + 强提示），与 `generateProblems` 一致。

### Requirement: SolutionQueue 事务
SolutionQueue 删除旧题解 + 创建新题解 SHALL 包裹在 `prisma.$transaction` 中，失败时回滚，避免丢失旧题解。

### Requirement: stripThinkBlocks 非贪婪匹配
`stripThinkBlocks` SHALL 使用非贪婪正则 `/<think>[\s\S]*?<\/think>/gi`，避免误删多个独立 think 块之间的正文。

### Requirement: 自动发布质量门禁
PARAM_GEN 创建 Problem 时，若 `qualityIssues` 非空 SHALL 设为 `isPublic: false`（草稿态），仅质量通过时设为 `isPublic: true`。

## REMOVED Requirements

### Requirement: thinking 优先读 reasoning_content
**Reason**: thinking prompt 要求结构化设计分析，该分析在 `content` 中而非 `reasoning_content`（原始思维链）。优先读 reasoning_content 会丢弃结构化分析，质量下降。
**Migration**: 改为 `content || reasoning_content || ''`，与生成步骤一致。
