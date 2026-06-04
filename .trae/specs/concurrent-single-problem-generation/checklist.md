# AI 出题并发生成 + 单题模式 - 验收清单

## 阶段一：后端移除 count 字段

- [x] [app/api/admin/ai/generate/route.ts](file:///e:/桌面/oj/app/api/admin/ai/generate/route.ts) 解构中已删除 `count`
- [x] [route.ts](file:///e:/桌面/oj/app/api/admin/ai/generate/route.ts) 验证逻辑不再检查 `count`
- [x] [route.ts](file:///e:/桌面/oj/app/api/admin/ai/generate/route.ts) `addAiJob` params 中 `count: 1` 硬编码
- [x] [route.ts](file:///e:/桌面/oj/app/api/admin/ai/generate/route.ts) 重试路径 `count: 1` 硬编码

## 阶段二：Prompt 固定 count=1

- [x] [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) system prompt 提到"长度为 1 的 JSON 数组"
- [x] [generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) user prompt "生成 1 道题"
- [x] [generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) user prompt "顶层必须是 JSON 数组，长度为 1"
- [x] 全文 grep `${count}` in [paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) 0 处

## 阶段三：前端并发重构

### State 模型
- [x] [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 定义 `JobState` 类型
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 删除 `loading`, `result`, `thought`, `qualityIssues`, `pollingLogId` 顶层 state
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 新增 `activeJobs: Map<string, JobState>`
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 删除 `count` state

### handleGenerate
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) `handleGenerate` 不再检查 `loading`
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 提交 body 不带 `count`
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 拿到 logId 后创建 JobState 并启动独立 setInterval

### pollLogStatus
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) `pollLogStatus` 接收 `logId: string` 参数
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) COMPLETED 时更新 activeJobs 并 clearInterval
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) FAILED 时更新 activeJobs 并 clearInterval

### cancelJob
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) `cancelJob(logId)` 函数已实现
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) ResultCard 中 PROCESSING 状态显示"取消"按钮

### UI 改动
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) "生成数量"label + 3 个按钮已删除
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 静态提示"单次生成一道题 · 可同时提交多个独立任务"已显示
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 结果区改为多卡片堆叠
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) ResultCard 支持 PROCESSING / COMPLETED / FAILED 3 种状态

### useEffect 清理
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 组件卸载时清理所有 interval
- [x] [page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 切回页面时自动恢复 PROCESSING 任务的轮询

## 阶段四：测试与验证

### test-3-static-page.ts
- [x] [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 删除"数量 1/2/3"用例
- [x] [test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 删除"`{n} 道` 模板 + [1, 2, 3] 数组"检查
- [x] [test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增反向断言：`2 道`、`3 道`、阿拉伯数字+道、`[1, 2, 3]` 都不出现
- [x] [test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增"单次生成一道题"提示文案检查
- [x] [test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 新增并发提示文案检查（"再生成一道"、"N 个进行中"、"取消此任务"）

### test-4-e2e.ts
- [x] [scripts/test-4-e2e.ts](file:///e:/桌面/oj/scripts/test-4-e2e.ts) 删除"ParamGen count=2"用例
- [x] [test-4-e2e.ts](file:///e:/桌面/oj/scripts/test-4-e2e.ts) 新增"并发：2 个 generateProblems 互不阻塞"用例（Promise.all）

### 验证
- [x] `npx tsc --noEmit` 0 错误
- [x] `npx tsx scripts/test-1-parser.ts` 21/21 通过
- [x] `npx tsx scripts/test-2-normalize.ts` 15/15 通过
- [x] `npx tsx scripts/test-3-static-page.ts` 29/29 通过
- [x] `npx tsx scripts/test-4-e2e.ts` 6/6 通过（并发用例 54s 完成 2 个任务，证实并行而非串行）

## 端到端手工验证

- [ ] 重启 dev server（待用户验证）
- [ ] 打开 `/admin/ai-generation` 页面（待用户验证）
- [ ] 确认不再有"生成数量"选择器（待用户验证）
- [ ] 看到"单次生成一道题 · 可同时提交多个独立任务"提示（待用户验证）
- [ ] 输入主题"动态规划"，点"开始生成"（待用户验证）
- [ ] **不**等完成，立即修改主题为"图论"，再点"开始生成"（待用户验证）
- [ ] 观察到 2 张结果卡片同时存在，分别显示"正在生成..."或各自的结果（待用户验证）
- [ ] 一张卡片 COMPLETED 后，另一张继续轮询（待用户验证）
- [ ] 点击 PROCESSING 卡片的"取消"按钮，卡片消失（待用户验证）
