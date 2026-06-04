# AI 出题功能端到端验证 — 极简 JSON 解析

## Why

用户接入 DeepSeek v4 API Key 后端到端验证 AI 出题时遇到 `SyntaxError: Expected ',' or ']' after array element in JSON at position 25`。原 7 步"打补丁式" JSON 修复是反模式 — DeepSeek 官方提供 `response_format: { type: 'json_object' }` 强制 JSON 输出，应当让 API 层做正确的事，解析器只剥 `<think>` 块即可。

本次重做的方向：
1. **不修 JSON** — 解析失败就抛错 + 日志原始内容，让用户/模型自己改 prompt
2. **剥 think 块** — DeepSeek v4 thinking 模式下 `<think>...</think>` 会泄漏到 content
3. **加 max_tokens** — DeepSeek 官方建议：合理设置 max_tokens 防止 JSON 被截断

## What Changes

- [重写] [lib/ai/response-parser.ts](file:///e:/桌面/oj/lib/ai/response-parser.ts) — 极简版：`safeJsonParse` 只做"剥 think 块 → JSON.parse"，无 7 步修复。保留辅助函数作为调试工具
- [修改] [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts) — `baseParams` 增加 `max_tokens: 8192`，防止 JSON 被截断
- [重写] [scripts/test-response-parser.ts](file:///e:/桌面/oj/scripts/test-response-parser.ts) — 16 个极简测试用例
- [新增] [scripts/e2e-ai-generation.ts](file:///e:/桌面/oj/scripts/e2e-ai-generation.ts) — 4 种模式端到端测试

## Impact

- Affected specs: `deepseek-ai-call-optimization`（已完成的 14 个任务不受影响）
- Affected code:
  - [lib/ai/response-parser.ts](file:///e:/桌面/oj/lib/ai/response-parser.ts) — `safeJsonParse` 简化
  - [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts) — `baseParams.max_tokens`
  - [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) — 透传 `AI_PARSE_FAILED` code 到日志

## ADDED Requirements

### Requirement: 解析器只剥 think 块并直接 JSON.parse
The system SHALL 在调用 DeepSeek v4 时只做两件事：剥 `<think>...</think>` 块，然后直接 `JSON.parse`。不再做任何"打补丁式"修复（拼接、逗号修补、尾随逗号移除等）。

#### Scenario: 响应含 <think> 块
- **WHEN** DeepSeek v4 Pro 返回 `<think>推理过程</think>{"problems": [...]}` 格式
- **THEN** 解析器剥 <think> 块后正确解析 JSON

#### Scenario: 响应是纯合法 JSON
- **WHEN** `response_format: { type: 'json_object' }` 生效，模型返回纯 JSON
- **THEN** 解析器直接 `JSON.parse` 通过

#### Scenario: 响应是非法 JSON
- **WHEN** 模型返回任何形式的不合法 JSON（缺逗号、尾随逗号、含 prose 等）
- **THEN** 解析器抛 `AI_PARSE_FAILED` 错误，附上原始内容前 500 字 + 解析错误信息
- **AND** 错误信息应指导用户修改 prompt 或切换模型

### Requirement: baseParams 必须含 response_format + max_tokens
The system SHALL 在调用 DeepSeek 时强制 `response_format: { type: 'json_object' }` 和 `max_tokens: 8192`，遵守 DeepSeek 官方建议。

#### Scenario: 正常调用
- **WHEN** 出题函数构造 baseParams
- **THEN** 必须包含 `response_format: { type: 'json_object' as const }`
- **AND** 必须包含 `max_tokens: 8192`（或更高）
- **AND** system / user prompt 必须含 "json" 字样（DeepSeek 官方要求）

### Requirement: 解析失败时给出可诊断错误
The system SHALL 在 JSON 解析失败时，记录原始内容预览（截前 500 字）到日志，并返回包含具体原因的友好错误给前端。

#### Scenario: 解析失败
- **WHEN** `JSON.parse` 抛错
- **THEN** 日志记录 `contentLength` + `contentPreview` + `parseError` + `strippedThinkBlock`
- **AND** API 返回 `{ success: false, error: { code: 'AI_PARSE_FAILED', message: '...' } }`

## MODIFIED Requirements

无

## REMOVED Requirements

### Requirement: 7 步 JSON 修复策略
**Reason**: 反模式。DeepSeek 官方 `response_format: { type: 'json_object' }` 已经能保证模型输出合法 JSON。复杂的修复策略掩盖了真实问题（prompt 设计错误、max_tokens 不足等），让代码难以维护。

**Migration**: 已简化为"剥 think 块 → JSON.parse"。如遇解析失败，应修改 prompt / 增加 max_tokens / 切换模型，而不是在解析器上打补丁。
