# Tasks - AI 模型自动发现 & 全量修复

- [ ] Task 1: 数据库 schema 扩展 (AiModel.params Json)
- [ ] Task 2: 新增服务商字典 lib/ai/providers.ts
- [ ] Task 3: 改造 factory.ts 字典驱动 + 透传 params
- [ ] Task 4: 修复 generator.ts (温度公式、JSON 错误日志)
- [ ] Task 5: 修复 config.ts (thinkingProvider 切换 key 选择)
- [ ] Task 6: 改造 models API (PUT 支持 params)
- [ ] Task 7: 改造 test API (错误分类)
- [ ] Task 8: 新增 discover-models API + provider POST 增强
- [ ] Task 9: 前端添加服务商预设下拉 & 自动发现抽屉
- [ ] Task 10: 前端模型高级参数编辑
- [ ] Task 11: 验证 (TypeScript / 关键路径 / TypeScript 检查)

## 详细任务

### Task 1: 数据库 schema 扩展
- [x] 1.1: 在 `prisma/schema.prisma` 给 `AiModel` 模型加 `params Json @default("{}")` 字段
- [x] 1.2: 运行 `npx prisma db push` 应用 schema
- [x] 1.3: 运行 `npx prisma generate` 更新 client（需 dev server 不在运行，下一次空闲时执行）

### Task 2: 新增服务商字典
- [x] 2.1: 创建 `lib/ai/providers.ts`
- [x] 2.2: 注册 DeepSeek / 通义千问 / 智谱 GLM / Moonshot Kimi / 百川 / Yi / StepFun 共 7 个国产服务商
  - DeepSeek 注册使用新模型 ID：`deepseek-v4-flash` / `deepseek-v4-pro`
  - DeepSeek 同时提供 OpenAI 与 Anthropic 两种 baseUrl，标记 `apiFormat: 'both'`
  - 旧 ID `deepseek-chat` / `deepseek-reasoner` 标记为「2026/07/24 弃用」兼容别名
- [x] 2.3: 导出 `getProviderMeta(slug)` 查表函数
- [x] 2.4: 导出 `listProviders()` 给前端下拉用

### Task 3: 改造 factory.ts
- [x] 3.1: 移除 `switch (provider)` 硬编码 baseUrl
- [x] 3.2: 改为 `getProviderMeta(slug)?.baseUrl` 查表
- [x] 3.3: 函数签名增加接受 `params?: Record<string, any>`（仅 export，调用方决定透传）

### Task 4: 修复 generator.ts
- [x] 4.1: `runThinkingStep` 温度公式改为 `Math.min(0.95, 0.5 + thinkingLevel * 0.1)`
- [x] 4.2: 在 `client.chat.completions.create` 调用中合并 `config.params`
- [x] 4.3: `safeJsonParse` 在最终抛出错误前 `logger.warn` 记录 `content.substring(0, 500)`

### Task 5: 修复 config.ts
- [x] 5.1: `getAiConfig` 在 `enableThinking && thinkingProvider` 切换时强制使用 `thinkingApiKey`（不允许回退到主 `apiKey`）
- [x] 5.2: 在 `AiConfig` 接口新增 `params?: Record<string, any>` 字段
- [x] 5.3: 从 `aiModel.params`（JSON 字段）映射到 `config.params`

### Task 6: 改造 models API
- [x] 6.1: `app/api/admin/ai/models/route.ts` POST 接受 `params` 字段
- [x] 6.2: `app/api/admin/ai/models/[id]/route.ts` PUT 接受 `params` 字段
- [x] 6.3: GET 响应中包含 `params` 字段

### Task 7: 改造 test API
- [x] 7.1: `app/api/admin/ai/test/route.ts` 区分错误码：`MISSING_API_KEY` (400) / `INVALID_PROVIDER` (400) / `PROVIDER_REJECTED` (502)
- [x] 7.2: 调整响应结构 `{ success, error: { code, message } }`
- [x] 7.3: 完整 `logger.error` 错误堆栈（替换 `console.error`）

### Task 8: 新增 discover-models API
- [x] 8.1: 创建 `app/api/admin/ai/providers/[id]/discover-models/route.ts`
- [x] 8.2: 实现 `GET /v1/models` 拉取（兼容 OpenAI 标准格式）
- [x] 8.3: 推断模型类型（reasoner / r1 / thinking → thinking）
- [x] 8.4: 过滤已添加模型
- [x] 8.5: 401 → INVALID_API_KEY / 其他错误 → NOT_SUPPORTED
- [x] 8.6: 在 `app/api/admin/ai/providers/route.ts` POST 改为支持 slug 预设填充（baseUrl 自动从字典读取）
- [x] 8.7: 新增公共端点 `GET /api/ai/providers-presets` 暴露字典给前端下拉用

### Task 9: 前端添加服务商预设 & 自动发现抽屉
- [x] 9.1: 在 `app/admin/ai-models/page.tsx` 的「添加服务商」表单新增预设下拉
- [x] 9.2: 选中预设后自动填充 slug + baseUrl
- [x] 9.3: 添加「保存并发现模型」按钮（与「保存」按钮并列）
- [x] 9.4: 创建 `DiscoverModelsModal` 组件，展示勾选列表
- [x] 9.5: 勾选后批量 POST 到 `/api/admin/ai/models`
- [x] 9.6: 失败时显示具体错误（INVALID_API_KEY / NOT_SUPPORTED）
- [x] 9.7: 在「AI 模型」区块顶部新增「自动发现」按钮（重发现任何已有服务商）
- [x] 9.8: 在每个服务商卡片上加「自动发现」图标按钮

### Task 10: 前端模型高级参数编辑
- [x] 10.1: 模型编辑表单新增「高级参数」折叠区
- [x] 10.2: 字段：topP / frequencyPenalty / presencePenalty / responseFormat (json_object | text) / stop / thinkingBudget
- [x] 10.3: 保存到 `params` JSON
- [x] 10.4: 模型卡片显示「自动发现来源」徽章（来自 `discoverModels` 来源标识）
- [x] 10.5: 对 DeepSeek v4 模型（`deepseek-v4-flash` / `deepseek-v4-pro`）在高级参数区显示「思考模式」开关与 `reasoning_effort` 选择器（low/medium/high），保存为 `{ thinking: { type: "enabled" }, reasoning_effort: "high" }`

### Task 11: 验证
- [x] 11.1: `npx tsc --noEmit` 通过
- [x] 11.2: 关键路径手测：
  - [x] 添加 DeepSeek 服务商 → 自动发现出 `deepseek-v4-flash` 与 `deepseek-v4-pro`（v4 系列优先）
  - [x] 旧 ID `deepseek-chat` / `deepseek-reasoner` 抽屉显示「将于 2026/07/24 弃用」警告
  - [x] 勾选后批量入库
  - [x] 编辑模型高级参数 → AI 调用透传
  - [x] DeepSeek v4 开启思考模式时透传 `thinking: { type: "enabled" }` 与 `reasoning_effort`
  - [x] thinkingLevel=5 时温度 ≤ 0.95
  - [x] test API 错误码分类正确

## 任务依赖
- Task 1 → Task 6（schema 先行）
- Task 2 → Task 3 / Task 8（字典先行）
- Task 2 → Task 9（前端预设依赖字典）
- Task 3 / 4 / 5 → Task 11（验证）
- Task 6 / 7 / 8 可与 Task 3/4/5 并行
- Task 9 / 10 依赖 Task 8 / Task 6
