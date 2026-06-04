# AI 出题端到端验证 - 任务清单

## 任务总览

分 4 个阶段：根因定位 → 解析器简化（极简版） → 离线单元测试 → 端到端实跑。

## 阶段一：根因定位

### 任务1: 复现并捕获 AI 原始响应
- [x] 1.1: 在 `lib/ai/generator.ts` 的 `tryGenerate()` 中，主响应解析前增加 `logger.debug` 打印 `content.length` + `content.substring(0, 200)` + `hasThinkBlock` + `hasMarkdown`
- [x] 1.2: 通过用户日志捕获到原始响应（logId 6a200a725d3e5c1de9648e48）
- [x] 1.3: 根因分析：原 7 步"打补丁式"修复是反模式，应当依赖 `response_format: { type: 'json_object' }` 强制 JSON 输出

## 阶段二：解析器简化（用户反馈后重做方向）

### 任务2: 重写 response-parser.ts 为极简版 [lib/ai/response-parser.ts](file:///e:/桌面/oj/lib/ai/response-parser.ts)
- [x] 2.1: 删除 7 步策略链（direct / remove-markdown / fix-escapes / fix-commas / aggressive / extract）
- [x] 2.2: 保留 `stripThinkBlocks` 与 6 个辅助函数作为调试工具
- [x] 2.3: `safeJsonParse` 简化为：剥 think 块 → `JSON.parse`
- [x] 2.4: 失败时抛 `AI_PARSE_FAILED` + 附原始内容预览（截前 500 字）+ 解析错误信息

### 任务3: baseParams 增加 max_tokens [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)
- [x] 3.1: `baseParams` 增加 `max_tokens: 8192`，防止 JSON 被截断
- [x] 3.2: 确认 `response_format: { type: 'json_object' as const }` 已存在
- [x] 3.3: 确认 prompts 包含 "json" 字样（DeepSeek 官方要求）

### 任务4: generator 解析前 debug 日志 [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)
- [x] 4.1: 解析前打印 `logger.debug('[generateProblems] raw AI response', { length, preview, hasThinkBlock, hasMarkdown })`
- [x] 4.2: 外层 catch 透传 `AI_PARSE_FAILED` code + info
- [x] 4.3: 删除本地 `safeJsonParse`（已迁到 response-parser.ts）
- [x] 4.4: 重生成时降温度 + 追加提示，捕获 `code: 'AI_PARSE_FAILED'` 而非依赖 message 字符串

## 阶段三：离线单元测试

### 任务5: 解析器单元测试 [scripts/test-response-parser.ts](file:///e:/桌面/oj/scripts/test-response-parser.ts) (重写)
- [x] 5.1: 测试 1：纯合法 JSON
- [x] 5.2: 测试 2：完整题目的 JSON
- [x] 5.3: 测试 3a-c：think 块泄漏（3 种变体）
- [x] 5.4: 测试 4：缺逗号（应抛 AI_PARSE_FAILED）
- [x] 5.5: 测试 5：尾随逗号（应抛 AI_PARSE_FAILED）
- [x] 5.6: 测试 6：完全非法文本（应抛 AI_PARSE_FAILED）
- [x] 5.7: 测试 7-8：空字符串 / 非字符串（应抛 AI_PARSE_FAILED）
- [x] 5.8: stripThinkBlocks 独立测试 6 个用例

### 任务6: 单元测试执行
- [x] 6.1: `npx tsx scripts/test-response-parser.ts` — 16 个用例全部通过
- [x] 6.2: `npx tsc --noEmit` — 0 错误

## 阶段四：端到端实跑

### 任务7: 端到端测试脚本 [scripts/e2e-ai-generation.ts](file:///e:/桌面/oj/scripts/e2e-ai-generation.ts) (新建)
- [x] 7.1: 读取环境变量 `DEEPSEEK_API_KEY`，缺则提示用户配置
- [x] 7.2: ParamGen 模式：mode=parametric, difficulty=普及, topic=['动态规划'], count=1
- [x] 7.3: Clone 模式：mode=text_based, textModeType=clone
- [x] 7.4: Similar 模式：mode=text_based, textModeType=similar
- [x] 7.5: TestData 模式：mode=test_data
- [x] 7.6: 每种模式断言：返回结构 + 必填字段 + 必填数组长度
- [x] 7.7: 失败时打印原始 AI 响应前 500 字 + 解析失败原因

### 任务8: 端到端验证
- [ ] 8.1: 用户重启 dev server，运行 `npx tsx scripts/e2e-ai-generation.ts`
- [ ] 8.2: 4 种模式全部成功
- [ ] 8.3: admin → AI 出题页面手动触发 ParamGen，确认不再 500
- [ ] 8.4: admin → AI 出题页面手动触发 Clone，确认正常

### 任务9: 前端错误展示加固 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [x] 9.1: [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) 透传 `AI_PARSE_FAILED` code 到日志
- [x] 9.2: 日志 error 字段含 "AI 返回格式异常" 友好提示
- [x] 9.3: 前端展示由日志 error 字段直接驱动，无需额外修改

## 任务依赖关系

```
任务1 (根因定位)
  └── 任务2 (解析器简化)
       └── 任务3 (max_tokens)
       └── 任务4 (debug 日志)
            └── 任务5 (单元测试)
                 └── 任务6 (执行)
                      └── 任务7 (e2e 脚本)
                           └── 任务8 (e2e 验证)
                                └── 任务9 (前端)
```

## 验证标准

### 解析器
- [x] 16 个单元测试用例全部通过
- [x] think 标签剥离功能就位
- [x] 失败时日志含可诊断信息

### 端到端
- [ ] 4 种生成模式均能返回结构化结果
- [ ] 用户原报错场景复测通过
- [ ] 解析失败时前端显示友好错误

### 代码质量
- [x] TypeScript 编译 0 错误
- [x] 不破坏现有 14 个任务
- [x] 解析器从 ~200 行简化为 ~70 行（核心 safeJsonParse）

## 完成标准

所有 9 个任务勾选完成，单元测试 + 端到端测试通过，TypeScript 0 错误。
