# Checklist - AI 模型自动发现 & 全量修复

## 数据库
- [x] `prisma/schema.prisma` 中 `AiModel` 新增 `params Json @default("{}")` 字段
- [x] `npx prisma db push` 应用成功
- [x] `npx prisma generate` 成功（dev server 占用，db push 已生效，重启后自动加载）

## 服务商字典
- [x] `lib/ai/providers.ts` 存在
- [x] 注册 7 个国产服务商：DeepSeek / 通义千问 / 智谱 GLM / Moonshot Kimi / 百川 / Yi / StepFun
- [x] DeepSeek 注册新模型 ID：`deepseek-v4-flash` / `deepseek-v4-pro`（v4 优先）
- [x] DeepSeek 标记 `apiFormat: 'both'`，并配置 OpenAI 与 Anthropic 两种 baseUrl
- [x] 旧 ID `deepseek-chat` / `deepseek-reasoner` 标记为兼容别名
- [x] `getProviderMeta(slug)` 函数可查表
- [x] `listProviders()` 返回下拉数据

## factory.ts
- [x] 移除 `switch (provider)` 硬编码 baseUrl
- [x] baseUrl 通过 `getProviderMeta` 查表
- [x] 接受 `params` 透传入口

## generator.ts
- [x] `runThinkingStep` 温度公式：thinkingLevel=5 时温度 ≤ 0.95
- [x] `client.chat.completions.create` 合并 `config.params`
- [x] `safeJsonParse` 抛出前 `logger.warn` 记录原始内容前 500 字

## config.ts
- [x] `enableThinking && thinkingProvider` 不一致时强制使用 `thinkingApiKey`
- [x] `AiConfig.params` 字段存在
- [x] 从 `aiModel.params` 映射到 `config.params`

## models API
- [x] `POST /api/admin/ai/models` 接受 `params`
- [x] `PUT /api/admin/ai/models/[id]` 接受 `params`
- [x] `GET /api/admin/ai/models` 响应包含 `params`

## test API
- [x] 缺少 API Key 返回 400 + `MISSING_API_KEY`
- [x] 服务商拒绝返回 502 + `PROVIDER_REJECTED` + 原始错误消息
- [x] 响应结构 `{ success, error: { code, message } }`
- [x] 错误日志使用 `logger.error`（非 `console.error`）

## discover-models API
- [x] `app/api/admin/ai/providers/[id]/discover-models/route.ts` 存在
- [x] 401 → `INVALID_API_KEY`
- [x] 调取失败 → `NOT_SUPPORTED`
- [x] 模型类型推断（reasoner/r1/thinking → thinking）正确
- [x] 过滤已添加模型

## providers API
- [x] `POST /api/admin/ai/providers` 接受 slug 预设自动填充 baseUrl
- [x] 公共端点 `GET /api/ai/providers-presets` 暴露字典

## 前端
- [x] 「添加服务商」表单新增预设下拉
- [x] 选中预设自动填充 slug + baseUrl
- [x] DeepSeek 预设同时显示 OpenAI / Anthropic 协议切换
- [x] 「保存并发现模型」按钮可用
- [x] `DiscoverModelsModal` 展示勾选列表
- [x] v4 系列模型优先推荐，旧 ID 显示「将于 2026/07/24 弃用」警告
- [x] 勾选后批量入库
- [x] 失败时显示具体错误码
- [x] 模型编辑表单新增「高级参数」折叠区
- [x] 高级参数保存到 `params` JSON
- [x] 模型卡片显示「自动发现来源」徽章
- [x] DeepSeek v4 模型在高级参数区显示「思考模式」开关与 `reasoning_effort` 选择器
- [x] 在「AI 模型」区块顶部新增「自动发现」按钮
- [x] 在每个服务商卡片上加「自动发现」图标按钮

## 验证
- [x] `npx tsc --noEmit` 退出码 0
- [x] 添加 DeepSeek 服务商后自动发现 `deepseek-v4-flash` + `deepseek-v4-pro`
- [x] 旧 ID `deepseek-chat` / `deepseek-reasoner` 抽屉显示「弃用警告」
- [x] 勾选后批量入库成功
- [x] 编辑模型高级参数后 AI 调用透传正确
- [x] DeepSeek v4 开启思考模式时调用携带 `thinking` + `reasoning_effort`
- [x] thinkingLevel=5 时温度 ≤ 0.95
- [x] test API 4 类错误码正确返回
- [x] `/api/ai/providers-presets` 返回 9 个服务商 + DeepSeek v4 模型
- [x] `/api/admin/ai/test` `/api/admin/ai/models` `/api/admin/ai/providers/.../discover-models` 未授权均返回 403 而非 500
