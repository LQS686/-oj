# AI 出题端到端验证 - 验证清单

## 阶段一：根因定位

### 任务1: 复现 AI 原始响应
- [x] [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts) `tryGenerate()` 增加 `content.length` + `content.substring(0, 200)` debug 日志
- [x] 通过用户日志捕获到原始响应（logId 6a200a725d3e5c1de9648e48）
- [x] 根因：7 步"打补丁式"修复是反模式，应依赖 `response_format: { type: 'json_object' }`

## 阶段二：解析器简化（用户反馈后重做方向）

### 任务2: 重写 response-parser 极简版
- [x] [lib/ai/response-parser.ts](file:///e:/桌面/oj/lib/ai/response-parser.ts) 已重写
- [x] 删除 7 步策略链
- [x] `safeJsonParse` 简化为：剥 think 块 → `JSON.parse`
- [x] 6 个辅助函数保留为内部工具

### 任务3: baseParams 增加 max_tokens
- [x] [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts) `baseParams.max_tokens = 8192`
- [x] `response_format: { type: 'json_object' as const }` 保留
- [x] prompts 包含 "json" 字样

### 任务4: generator debug 日志
- [x] 解析前打印 debug 日志
- [x] 外层 catch 透传 `AI_PARSE_FAILED` code + info
- [x] 删除本地 `safeJsonParse`
- [x] 重生成机制识别 `code` 而非 message 字符串

## 阶段三：离线单元测试

### 任务5: 解析器单元测试
- [x] [scripts/test-response-parser.ts](file:///e:/桌面/oj/scripts/test-response-parser.ts) 已重写
- [x] 16 个测试用例（合法 JSON / think 块 / 非法 JSON 应抛错）

### 任务6: 单元测试执行
- [x] `npx tsx scripts/test-response-parser.ts` — 16/16 全部通过
- [x] `npx tsc --noEmit` — 0 错误

## 阶段四：端到端实跑

### 任务7: e2e 测试脚本
- [x] [scripts/e2e-ai-generation.ts](file:///e:/桌面/oj/scripts/e2e-ai-generation.ts) 已新建
- [x] 4 种生成模式 + 断言

### 任务8: e2e 验证（需用户操作）
- [ ] 用户重启 dev server 后跑 `npx tsx scripts/e2e-ai-generation.ts`
- [ ] ParamGen 模式成功
- [ ] Clone 模式成功
- [ ] Similar 模式成功
- [ ] TestData 模式成功
- [ ] 用户原报错场景（logId 6a200a725d3e5c1de9648e48）复测通过

### 任务9: 前端错误展示
- [x] [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) 透传 `AI_PARSE_FAILED` code
- [x] 日志 error 字段含 "AI 返回格式异常" 友好提示

## 最终验证

### 代码质量
- [x] TypeScript 编译无错
- [x] 16 个解析器单元测试通过
- [x] 解析器从 ~200 行简化为 ~70 行（核心 safeJsonParse）

### 用户验收
- [ ] 4 种 e2e 模式通过
- [ ] 用户原报错场景重跑成功
- [ ] admin → AI 出题页面手动测试 4 种模式均可用
- [ ] 解析失败时前端显示友好错误

## 完成标准

所有检查项已勾选，单元测试通过，TypeScript 0 错误，用户验收通过。
