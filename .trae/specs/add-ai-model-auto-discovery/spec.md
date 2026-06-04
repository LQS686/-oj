# AI 模型自动发现 & 全量修复规范

## Why

当前 AI 模型管理 (`app/admin/ai-models/page.tsx`) 与 AI 调用链路 (`lib/ai/`, `app/api/admin/ai/`) 存在以下痛点：

1. **添加服务商流程繁琐**：用户必须手动输入每个模型的 `name`、`model`、参数等，无法利用服务商已经定义好的模型清单。
2. **国产模型支持薄弱**：`lib/ai/factory.ts` 仅硬编码了 4 个服务商的默认 baseUrl（openai/deepseek/moonshot/aliyun），无法覆盖智谱 GLM、百川、千问、Yi、月之暗面 Kimi、DeepSeek Reasoner 等国产主流模型。
3. **高级参数缺失**：`AiModel` 模型仅有 `maxTokens` / `temperature` / `timeout`，但实际场景常常需要 `topP` / `frequencyPenalty` / `presencePenalty` / `responseFormat` / `stop` / `thinkingBudget`（推理模型）等参数。
4. **调用链 bug**：`runThinkingStep` 内的温度公式 `0.7 + (config.thinkingLevel * 0.1)` 在高等级时可能超过 2.0 触发部分服务商（如 OpenAI）拒绝；`safeJsonParse` 多次 `JSON.parse` 抛出后被 `try/catch` 吃掉并继续下一次，错误日志被淹没。
5. **API key 兼容性**：`factory.ts` 在 `enableThinking && thinkingProvider` 切换时可能复用主模型 apiKey，导致思维链请求打到非预期服务商。
6. **测试接口脆弱**：`/api/admin/ai/test` 在加密 key 与解密失败时仅返回 500，不区分「未配置 key」与「服务商拒绝」。
7. **DeepSeek 模型名变更**：截至 2026/06，DeepSeek 已发布 v4 系列（`deepseek-v4-flash` / `deepseek-v4-pro`），旧的 `deepseek-chat` / `deepseek-reasoner` 将于 2026/07/24 弃用。系统必须支持 v4 新模型名与 `thinking` / `reasoning_effort` 参数，并保留旧 ID 兼容。同时 DeepSeek 已支持 Anthropic 兼容协议（`/anthropic` 路径），需在服务商字典中标注。

## What Changes

### 1. 服务商创建后自动发现模型
- 新增 `POST /api/admin/ai/providers/[id]/discover-models`：调用服务商的 `GET /v1/models` 列出所有可用模型，按 slug 默认映射到 `deepseek-reasoner` / `qwen-max` / `glm-4-plus` 等已知推理模型，标记为 `thinking`。
- 前端 `app/admin/ai-models/page.tsx` 添加服务商后，自动打开「自动发现」抽屉，展示模型勾选列表（含 名称 / ID / 类型 / 推荐参数），用户可勾选要加入的模型，批量写入 `AiModel` 表。

### 2. 国产模型 baseUrl 字典 & Provider 元数据
- 新增 `lib/ai/providers.ts` 注册主流国产服务商的 `slug` / `baseUrl` / `defaultModels` / `capabilities`：
  - **DeepSeek** (deepseek-chat / deepseek-reasoner)
  - **通义千问 / DashScope** (qwen-turbo / qwen-plus / qwen-max / qwen-long / qwq-plus)
  - **智谱 GLM** (glm-4-flash / glm-4-plus / glm-4-air / glm-zero-preview)
  - **月之暗面 Moonshot / Kimi** (moonshot-v1-8k / moonshot-v1-32k / moonshot-v1-128k / kimi-k2-0711-preview)
  - **百川** (baichuan2-turbo / baichuan3-turbo / baichuan4)
  - **零一万物 Yi** (yi-large / yi-medium / yi-vision)
  - **StepFun** (step-1-8k / step-1-32k / step-1v-8k)
- `factory.ts` 改为基于 `lib/ai/providers.ts` 字典查表，不再硬编码 switch。
- 前端「添加服务商」下拉改为多选预设，slug 自动填充，baseUrl 自动回填。

### 3. 高级配置参数扩展
- 扩展 `AiModel` Prisma 模型（使用 `Json` 字段，**BREAKING** schema 变化需 `prisma db push`）：
  - 新增 `params Json @default("{}")` 字段，存放 `topP` / `frequencyPenalty` / `presencePenalty` / `responseFormat` / `stop` / `thinkingBudget` 等 KV。
- 前端模型编辑表单增加「高级参数」折叠区，支持 KV 增删改。
- `lib/ai/factory.ts` 把 `params` 透传到 `client.chat.completions.create`。

### 4. 修复 AI 调用链路 bug
- `runThinkingStep` 温度公式改为 `Math.min(0.95, 0.5 + config.thinkingLevel * 0.1)` 并加 `topP` 缩放，避免超过 2.0。
- `safeJsonParse` 改为累计错误日志（`logger.warn`），最后抛出时附带原始内容片段（截前 500 字）。
- `factory.ts` 修正 `thinkingProvider` 切换时的 apiKey 选择：当 `thinkingProvider` 与主 `provider` 不一致时，必须使用 `thinkingApiKey`，不允许回退到主 `apiKey`。
- `/api/admin/ai/test` 区分错误类型：`MISSING_API_KEY` (400) / `INVALID_PROVIDER` (400) / `PROVIDER_REJECTED` (502)，前端能针对性展示。

### 5. 文档化新模型发现流程
- 「添加服务商」表单中：填写 slug/baseUrl/apiKey 后点击「保存并发现模型」→ 后端拉取 → 抽屉展示勾选列表 → 批量创建。
- 「模型卡片」显示「自动发现来源」徽章，便于用户识别是手动还是自动。

## Impact

- Affected specs: AI 管理、AI 调用
- Affected code:
  - `app/admin/ai-models/page.tsx` (添加模型发现抽屉、高级参数编辑)
  - `app/api/admin/ai/providers/[id]/discover-models/route.ts` (新增)
  - `app/api/admin/ai/providers/route.ts` (POST 改为可选 slug 预设填充)
  - `app/api/admin/ai/models/route.ts` (PUT 支持 params 字段)
  - `app/api/admin/ai/models/[id]/route.ts` (PUT 接受 params)
  - `app/api/admin/ai/test/route.ts` (错误分类)
  - `lib/ai/providers.ts` (新增：服务商字典)
  - `lib/ai/factory.ts` (基于字典 + 透传 params)
  - `lib/ai/config.ts` (透传 params 字段)
  - `lib/ai/generator.ts` (温度公式修复 + JSON 错误日志)
  - `prisma/schema.prisma` (AiModel 新增 `params Json`)
- 数据迁移：现有 AiModel 记录无 `params` 字段时，Prisma 默认为 `{}`，无需手动迁移。

## ADDED Requirements

### Requirement: 添加服务商后可一键自动发现模型
**当管理员在 AI 模型管理页保存一个新服务商后，系统应能通过调用服务商的 `GET /v1/models` 接口拉取该服务商支持的所有模型，并展示给管理员勾选添加。**

#### Scenario: 成功发现模型
- **WHEN** 管理员在「添加服务商」表单中填写 slug=deepseek、apiKey=sk-xxx 并点击「保存并发现模型」
- **THEN** 系统保存服务商成功后，调用 `POST /api/admin/ai/providers/[id]/discover-models` 返回包含 `deepseek-v4-flash`、`deepseek-v4-pro`（v4 系列优先）的模型列表的勾选抽屉，管理员可勾选并批量入库。若服务商仍返回旧 ID `deepseek-chat` / `deepseek-reasoner`，抽屉需展示「将于 2026/07/24 弃用，建议改用 v4 系列」提示。

#### Scenario: 服务商未提供 /models 接口
- **WHEN** 服务商不支持模型列表接口（如某些代理网关）
- **THEN** 后端返回 `{ success: true, data: [], reason: 'NOT_SUPPORTED' }`，前端展示「该服务商未提供模型列表，请手动添加」并保留「手动添加」入口

#### Scenario: API Key 无效
- **WHEN** 调用发现接口时返回 401
- **THEN** 后端返回 `{ success: false, error: 'INVALID_API_KEY' }`，前端展示「API Key 无效，请检查后重试」

### Requirement: 支持国产主流模型预设
**系统应在添加服务商时提供国产主流模型（DeepSeek/通义千问/智谱/月之暗面/百川/Yi/StepFun）的 slug 与 baseUrl 预设。**

#### Scenario: 管理员选择预设
- **WHEN** 管理员在「添加服务商」表单中从预设下拉选择「通义千问」
- **THEN** slug 自动填充为 `dashscope`、baseUrl 自动填充为 `https://dashscope.aliyuncs.com/compatible-mode/v1`

### Requirement: 模型支持高级参数配置
**每个 AI 模型应能配置 topP、frequencyPenalty、presencePenalty、responseFormat、stop、thinkingBudget 等高级参数。对于支持 thinking 参数的 DeepSeek v4 模型，应能透传 `thinking: { type: "enabled" }` 与 `reasoning_effort`（low/medium/high）。**

#### Scenario: 管理员配置高级参数
- **WHEN** 管理员在模型编辑表单中展开「高级参数」并填写 `topP=0.9`
- **THEN** 保存后该模型在 `params` 字段持久化 `{ topP: 0.9 }`，后续 AI 调用透传该参数

#### Scenario: DeepSeek v4 开启思考模式
- **WHEN** 管理员为 deepseek-v4-flash 模型启用「思考模式」开关并选择 `reasoning_effort=high`
- **THEN** 调用 `client.chat.completions.create` 时携带 `thinking: { type: "enabled" }, reasoning_effort: "high"`

### Requirement: 修复 AI 调用链 bug
**AI 调用应能正确处理 thinking 模式切换、温度边界、JSON 解析失败。**

#### Scenario: thinking 温度边界
- **WHEN** thinkingLevel=5（最高）
- **THEN** 实际温度应 ≤ 0.95（不是 1.2），不触发 OpenAI 类型服务的 2.0 上限

#### Scenario: JSON 解析失败
- **WHEN** AI 返回非 JSON 内容
- **THEN** 系统记录原始内容前 500 字到日志后抛出明确错误

#### Scenario: thinkingProvider 与 provider 不一致
- **WHEN** 用户配置主 provider=openai，thinking provider=deepseek
- **THEN** thinking 请求必须使用 deepseek 的 apiKey，而非误用 openai 的 key

### Requirement: 测试接口错误分类
**`POST /api/admin/ai/test` 应区分 4 类错误，便于前端提示。**

#### Scenario: 缺少 API Key
- **THEN** 返回 400 + `MISSING_API_KEY`

#### Scenario: 服务商拒绝
- **THEN** 返回 502 + `PROVIDER_REJECTED` + 原始错误消息

## MODIFIED Requirements

### Requirement: AiModel 表新增 params Json 字段
- **BREAKING**: 现有 `AiModel` schema 增加 `params Json @default("{}")`，需 `npx prisma db push` 应用
- 现有记录的 `params` 默认 `{}`，运行时通过 `?? {}` 兜底
- PUT `/api/admin/ai/models/[id]` 接受 `params` 字段

### Requirement: factory.ts 切换为字典驱动
- 原 `switch (provider)` 替换为 `getProviderMeta(slug)` 查表
- 默认 baseUrl 来自 `lib/ai/providers.ts` 字典

## REMOVED Requirements
无。

## 技术细节

### `lib/ai/providers.ts` 数据结构
```ts
export interface ProviderMeta {
  slug: string
  name: string
  // 同时支持 OpenAI 兼容 与 Anthropic 兼容 两种 baseUrl
  // 当某服务商两种都提供时，前端可让用户选择
  baseUrl: string             // OpenAI 兼容
  anthropicBaseUrl?: string   // Anthropic 兼容 (可选)
  apiFormat: 'openai' | 'anthropic' | 'both'  // API 协议类型
  defaultModels: Array<{
    name: string
    model: string
    type: 'generation' | 'thinking'
    description?: string
    // DeepSeek v4 系列支持 thinking 参数控制
    supportsThinkingParam?: boolean
  }>
  supportsListModels: boolean // 是否提供 GET /v1/models
}

export const PROVIDERS: Record<string, ProviderMeta> = {
  deepseek: {
    slug: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    anthropicBaseUrl: 'https://api.deepseek.com/anthropic',
    apiFormat: 'both',
    supportsListModels: true,
    defaultModels: [
      // ⚠️ 2026/07/24 北京时间 23:59 起，deepseek-chat 与 deepseek-reasoner 弃用
      // 出于兼容考虑：
      //   deepseek-chat    = deepseek-v4-flash 非思考模式
      //   deepseek-reasoner = deepseek-v4-flash 思考模式
      { name: 'DeepSeek V4 Flash (非思考)', model: 'deepseek-v4-flash', type: 'generation', supportsThinkingParam: true },
      { name: 'DeepSeek V4 Pro',             model: 'deepseek-v4-pro',   type: 'generation', supportsThinkingParam: true },
      // 旧 ID 仍保留为别名，供存量数据兼容
      { name: 'DeepSeek Chat (兼容别名)',     model: 'deepseek-chat',    type: 'generation' },
      { name: 'DeepSeek Reasoner (兼容别名)', model: 'deepseek-reasoner', type: 'thinking' }
    ]
  },
  // ... 其他国产模型
}

export function getProviderMeta(slug: string): ProviderMeta | undefined {
  return PROVIDERS[slug]
}
```

**DeepSeek v4 关键调用说明**：
- `model`: `deepseek-v4-flash`（高性价比）/ `deepseek-v4-pro`（高质量）
- `thinking`: `{"type": "enabled"}` — 开启思考模式
- `reasoning_effort`: `"low" | "medium" | "high"` — 思考深度
- 旧 `deepseek-chat` / `deepseek-reasoner` 将于 2026/07/24 弃用，届时 deepseek-chat 自动映射到 v4-flash 非思考模式，deepseek-reasoner 映射到 v4-flash 思考模式
- 建议前端在「自动发现」抽屉中，对新发现的服务商默认推荐 `deepseek-v4-flash` + `deepseek-v4-pro`，旧 ID 仅在用户已有记录时保留
- baseUrl 取决于 API 协议：
  - OpenAI 兼容：`https://api.deepseek.com`
  - Anthropic 兼容：`https://api.deepseek.com/anthropic`

### `POST /api/admin/ai/providers/[id]/discover-models` 实现思路
```ts
// 1. 拉取服务商
const provider = await prisma.aiProvider.findUnique({ where: { id } })
if (!provider?.apiKey) return 400 MISSING_API_KEY

// 2. 调用服务商的 /v1/models
const apiKey = decrypt(provider.apiKey)
const baseUrl = provider.baseUrl || getProviderMeta(provider.slug)?.baseUrl
const res = await fetch(`${baseUrl}/models`, {
  headers: { Authorization: `Bearer ${apiKey}` }
})

if (res.status === 401) return 400 INVALID_API_KEY
if (!res.ok) return { success: true, data: [], reason: 'NOT_SUPPORTED' }

// 3. 解析响应（兼容 OpenAI 标准格式）
const { data } = await res.json()
const models = data.map(m => ({
  model: m.id,
  name: m.id,
  // DeepSeek v4 思考模式判断：reasoner / r1 / thinking 关键词
  // 注意 deepseek-v4-flash 通过 thinking 参数控制，非 ID 关键字
  type: m.id.includes('reasoner') || m.id.includes('r1') || m.id.includes('thinking') ? 'thinking' : 'generation',
  // DeepSeek v4 模型标记为 supportsThinkingParam
  supportsThinkingParam: provider.slug === 'deepseek' && (m.id.includes('v4') || m.id.includes('flash') || m.id.includes('pro')),
  // 旧 ID 添加弃用警告
  deprecated: provider.slug === 'deepseek' && (m.id === 'deepseek-chat' || m.id === 'deepseek-reasoner'),
  description: m.owned_by || ''
}))

// 4. 过滤掉已添加的
const existing = await prisma.aiModel.findMany({ where: { providerId: id } })
const existingSet = new Set(existing.map(e => e.model))
return { success: true, data: models.filter(m => !existingSet.has(m.model)) }
```

### 高级参数透传（DeepSeek v4 thinking 示例）
```ts
// lib/ai/factory.ts
return new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: false })
// 由调用方按需透传 params
```

```ts
// lib/ai/generator.ts runThinkingStep
const temperature = Math.min(0.95, 0.5 + config.thinkingLevel * 0.1)
const response = await client.chat.completions.create({
  model, messages, temperature,
  // DeepSeek v4 思考模式：通过 thinking 与 reasoning_effort 控制
  // 其他参数从 config.params 透传
  ...(config.params || {})
})

// 调用方示例（DeepSeek v4 启用思考）：
const params = {
  thinking: { type: 'enabled' },
  reasoning_effort: 'high'  // low | medium | high
}
```

### 错误日志示例
```ts
logger.warn('JSON Parse Failed', {
  error: e.message,
  contentPreview: content.substring(0, 500)
})
```
