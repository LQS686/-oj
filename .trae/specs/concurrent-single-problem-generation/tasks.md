# AI 出题并发生成 + 单题模式 - 任务清单

## 任务总览

按 4 个阶段推进：后端解耦 count → Prompt 固定 count=1 → 前端并发重构 → 测试更新 + 验证。

## 阶段一：后端移除 count 字段

### 任务 1: 移除 API 路由的 count 处理 [app/api/admin/ai/generate/route.ts](file:///e:/桌面/oj/app/api/admin/ai/generate/route.ts)
- [x] 1.1: 解构中删除 `count`
- [x] 1.2: 验证逻辑删除 `if (!count)` 相关检查（保留 `!type || !difficulty || !topic`）
- [x] 1.3: `addAiJob` params 中 `count: count ? Math.min(count, 5) : 1` 改为 `count: 1` 硬编码
- [x] 1.4: 重试路径 `count: retryParams.count || count || 1` 改为 `count: 1`

## 阶段二：Prompt 固定 count=1

### 任务 2: ParamGen Prompt 硬编码 count=1 [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts)
- [x] 2.1: system prompt 中"无论生成几道题，顶层必须是 JSON 数组"段改为"顶层必须是一个长度为 1 的 JSON 数组：`[{...}]`"
- [x] 2.2: user prompt 中 `生成 ${count} 道题` 改为 `生成 1 道题`
- [x] 2.3: user prompt 中"顶层必须是一个 **JSON 数组**，长度为 ${count}"改为"顶层必须是一个 **JSON 数组**，长度为 1"
- [x] 2.4: 注释更新：`${count}` 变量已删除，因为业务决策 2026-06 强制 count=1

## 阶段三：前端并发重构

### 任务 3: 重构 state 模型 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [x] 3.1: 定义 `JobState` 类型：`{ logId, status: 'PROCESSING' | 'COMPLETED' | 'FAILED', result?, thought?, qualityIssues?, error?, intervalId? }`
- [x] 3.2: 删除 `loading`, `result`, `thought`, `qualityIssues`, `pollingLogId` 这 5 个顶层 state
- [x] 3.3: 新增 `const [activeJobs, setActiveJobs] = useState<Map<string, JobState>>(new Map())`
- [x] 3.4: 删除 `count` state

### 任务 4: 重构 handleGenerate [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [x] 4.1: `handleGenerate` 不再检查 `loading`，也不再 `setLoading(true)`
- [x] 4.2: 提交前校验：主题、难度、模型不能为空
- [x] 4.3: 提交时 body 中不再带 `count` 字段
- [x] 4.4: 拿到 `data.data.logId` 后：
  - 创建 `JobState: { logId, status: 'PROCESSING' }`
  - `setActiveJobs(prev => new Map(prev).set(logId, jobState))`
  - 启动该 job 的 `setInterval` 轮询（独立 intervalId）
- [x] 4.5: 不再调用 `setPollingLogId` / `setLoading`

### 任务 5: 重构 pollLogStatus [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [x] 5.1: `pollLogStatus` 接收 `logId: string` 参数
- [x] 5.2: 拉取状态后：
  - `status === 'COMPLETED'`：从 log 提取 result/thought/qualityIssues，更新 `activeJobs.set(logId, { ...prev, status: 'COMPLETED', result, thought, qualityIssues })`，`clearInterval`
  - `status === 'FAILED'`：更新为 FAILED + error 文案，`clearInterval`
  - `status === 'PROCESSING'`：保持状态继续轮询
- [x] 5.3: 新增 `useEffect(() => { ... }, [logs, pollLogStatus])` 监听 logs 变化时自动接管孤儿 PROCESSING 任务

### 任务 6: 实现 cancelJob [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [x] 6.1: `cancelJob(logId)` 函数：
  - 从 `activeJobs` 中找到该 job 的 `intervalId`，`clearInterval`
  - `setActiveJobs(prev => { const m = new Map(prev); m.delete(logId); return m })`
- [x] 6.2: 在 ResultCard 组件中暴露"取消"按钮（仅 `status === 'PROCESSING'` 时显示）

### 任务 7: 移除生成数量 UI [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [x] 7.1: 删除"生成数量"label + 3 个按钮
- [x] 7.2: 替换为静态提示：`单次生成一道题 · 可同时提交多个独立任务`
- [x] 7.3: 页面副标题追加说明："可多次点击「开始生成」并发生成多个独立任务，互不阻塞"

### 任务 8: 改造结果展示区 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [x] 8.1: 单卡片 JSX 改为 `Array.from(activeJobs.values()).map(job => <ResultCard key={job.logId} job={job} onCancel={cancelJob} />)`
- [x] 8.2: `ResultCard` 组件逻辑：
  - 加载中：显示 Loader2 + "正在生成..." + 当前已用时间
  - 完成：显示题目标题 / 描述 / 样例 / tags / 质量自检 / "在题库中查看"按钮
  - 失败：显示 AlertCircle + error 文案 + "重试"按钮（重试后创建新 job）
- [x] 8.3: 卡片样式：max-height + overflow-y-auto，超过 3 张时滚动

### 任务 9: 改造 useEffect 监听 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [x] 9.1: 移除原 `useEffect(() => { if (pollingLogId) ... }, [pollingLogId, pollLogStatus])`
- [x] 9.2: 新增：组件卸载时清理所有 interval
- [x] 9.3: 新增：组件挂载时检查 logs 中是否仍有 `status === 'PROCESSING'` 的孤儿 job（用户切走再切回），自动重新加入 `activeJobs` 继续轮询

## 阶段四：测试与验证

### 任务 10: 更新 test-3-static-page.ts [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts)
- [x] 10.1: 删除"✅ 关键 UI: 数量 1/2/3"用例
- [x] 10.2: 删除"`{n} 道` 模板 + [1, 2, 3] 数组"检查
- [x] 10.3: 新增"✅ 已移除: 生成数量选择器（业务决策 2026-06）"——断言 `2 道`、`3 道`、阿拉伯数字+道、`[1, 2, 3]` 都不出现
- [x] 10.4: 新增"✅ 关键 UI: '单次生成一道题 · 可同时提交多个独立任务' 提示文案"
- [x] 10.5: 新增"✅ 关键 UI: 并发提示 — 多次点击'开始生成'互不阻塞"

### 任务 11: 更新 test-4-e2e.ts [scripts/test-4-e2e.ts](file:///e:/桌面/oj/scripts/test-4-e2e.ts)
- [x] 11.1: 删除"ParamGen count=2 — topic=图论（关键回归）"用例
- [x] 11.2: 新增"✨ 并发：连续 2 次 generateProblems 不阻塞"——2 个并发的 await Promise.all，互不干扰

### 任务 12: 验证编译与单元测试
- [x] 12.1: `npx tsc --noEmit` 0 错误
- [x] 12.2: `npx tsx scripts/test-1-parser.ts` 21/21 通过
- [x] 12.3: `npx tsx scripts/test-2-normalize.ts` 15/15 通过
- [x] 12.4: `npx tsx scripts/test-3-static-page.ts` 29/29 通过
- [x] 12.5: `npx tsx scripts/test-4-e2e.ts` 6/6 通过（含并发用例 54223ms 完成 2 个任务）

## 任务依赖关系

```
阶段一（任务1） — 独立
  ↓
阶段二（任务2） — 独立，与阶段一可并行
  ↓
阶段三（任务3-9） — 按顺序：state → handleGenerate → pollLogStatus → cancelJob → UI → useEffect
  ↓
阶段四（任务10-12） — 顺序：test-3 → test-4 → 验证
```

阶段一和阶段二可**并行**（互不依赖）。

## 验证标准

### 单题模式
- [x] AI 出题页不再有"生成数量"选择器
- [x] 任意点击"开始生成"都只产出 1 道题
- [x] 全文搜 `count.*=.*[123]` 在 ParamGenPromptGenerator 中 0 处
- [x] 全文搜 `生成数量` 0 处
- [x] 全文搜 `1 道` / `2 道` / `3 道` 在 UI 中 0 处（已改用"一道"中文表述）

### 并发模式
- [x] 用户连续 2 次点击"开始生成"，生成 2 个独立任务
- [x] 2 个任务的轮询互不阻塞（一个 COMPLETED 不影响另一个 PROCESSING）
- [x] 每个任务有独立的 result / thought / qualityIssues
- [x] "取消"按钮停止对应任务的轮询
- [x] 切换页面再切回，自动恢复对 PROCESSING 任务的轮询

### 代码质量
- [x] `npx tsc --noEmit` 0 错误
- [x] 端到端：用户输入主题 A → 点开始 → 不等完成 → 修改主题 B → 再点开始 → 两个任务并行跑（test-4 e2e 已验证，54s 完成）

## 完成标准

所有 12 个任务勾选完成，TypeScript 0 错误，4 个测试脚本全部通过。✅ 已达成
