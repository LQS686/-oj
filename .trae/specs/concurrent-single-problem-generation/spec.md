# AI 出题并发生成 + 单题模式 Spec

## Why

当前 AI 出题功能有两个需要改善的体验问题：

1. **生成数量选择冗余**：UI 上有"1/2/3 道"3 档选择，但根据"业务决策 2026-06"，AI 出题场景下 1 次调用 = 1 道题最稳定，count>1 极易因 JSON 截断、重复 key 等原因失败。让用户选择反而是诱导他们走不稳的路径。
2. **串行阻塞 UX**：当前 `setLoading(true)` 会禁用"开始生成"按钮直到当前任务完成（30-150 秒）。用户想同时配置不同主题 / 难度的多组题时必须等，效率低。

## What Changes

- **移除** AI 出题页的"生成数量"选择器（1/2/3 道 3 个按钮）
- **硬编码** `count = 1`：前端 / API / ParamGen Prompt 全部固定为 1
- **改造** 串行轮询为并发生成：`pollingLogId: string | null` → `activeJobs: Map<logId, JobState>`，每个 job 独立轮询
- **改造** "开始生成"按钮：可重复点击，**每次点击立即创建新任务并加入 `activeJobs`**，与已有任务互不阻塞
- **改造** 结果展示区：单卡片 → 多卡片堆叠（每个 job 一张卡，含独立轮询状态 / 思考文本 / 质量自检 / 跳转链接）
- **复用** `lib/ai/queue.ts` 现有的 `maxConcurrent: 2` 并发上限，无需改后端

## Impact

- **Affected specs**: AI 出题相关 (comprehensively-test-ai-generation / auto-verify-and-publish-ai-problems)
- **Affected code**:
  - [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) — 主要改动点
  - [app/api/admin/ai/generate/route.ts](file:///e:/桌面/oj/app/api/admin/ai/generate/route.ts) — 移除 count 字段
  - [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) — 提示词硬编码 count=1
  - [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) — 移除"数量 1/2/3"测试用例
  - [scripts/test-4-e2e.ts](file:///e:/桌面/oj/scripts/test-4-e2e.ts) — 删除 count=2 端到端用例

## ADDED Requirements

### Requirement: AI 出题单次调用固定生成 1 道题
The system SHALL 在所有 AI 出题调用中固定 `count = 1`，不允许用户选择 1/2/3 道。

#### Scenario: 用户点击"开始生成"
- **WHEN** 用户填写主题 + 难度 + 附加要求 + 点击"开始生成"
- **THEN** 系统提交 1 个生成任务，AI 调用后产出 1 道题并发布到公开题库
- **AND** UI 上不再有"生成数量"选择器

### Requirement: 并发生成互不阻塞
The system SHALL 允许用户连续点击"开始生成"多次，每次创建独立任务，**正在生成的任务不会阻塞新任务的提交**。

#### Scenario: 用户在已有任务运行时再次点击"开始生成"
- **WHEN** 当前已有 1 个或多个 `status=PROCESSING` 的任务在后台运行
- **AND** 用户再次点击"开始生成"按钮
- **THEN** 立即创建新任务（无需等旧任务完成）
- **AND** 旧任务的轮询和结果显示不受影响
- **AND** 每个任务有独立的 `logId` / `result` / `thought` / `qualityIssues` 状态

#### Scenario: 单个任务完成
- **WHEN** `activeJobs` 中某个任务 `status=COMPLETED`
- **THEN** 该任务的结果卡片展示题目标题 / 描述 / 样例 / tags / "在题库中查看"按钮
- **AND** 其它仍在 `PROCESSING` 的任务继续轮询，互不干扰

#### Scenario: 单个任务失败
- **WHEN** `activeJobs` 中某个任务 `status=FAILED`
- **THEN** 该任务的结果卡片显示错误信息和"重试"按钮
- **AND** 其它任务不受影响

### Requirement: 任务取消
The system SHALL 允许用户取消单个正在生成的任务（从 `activeJobs` 移除并停止轮询）。

#### Scenario: 用户点击某个任务的"取消"按钮
- **WHEN** 用户对某个 `status=PROCESSING` 的任务点击"取消"
- **THEN** 该任务从 `activeJobs` 移除
- **AND** 停止该任务的 `setInterval` 轮询
- **AND** 后端任务继续在 `lib/ai/queue.ts` 中跑完（不主动 abort API 调用，避免半成品状态），结果丢弃不展示

## MODIFIED Requirements

### Requirement: AI 出题 Prompt 固定 1 道题
**原行为**：ParamGen user prompt 末尾包含 `${count}` 变量，系统 prompt 提到"无论生成几道题，顶层必须是 JSON 数组，长度为 ${count}"。

**新行为**：
- ParamGen system prompt：硬编码"顶层必须是一个长度为 1 的 JSON 数组：`[{...}]`"，删除 count 变量
- ParamGen user prompt：硬编码"生成 1 道题"，删除 count 变量
- 模板提示用户输出单个对象即可（虽然 AI 可能仍输出数组，但 extractProblems 会正确处理）

### Requirement: API 路由不再处理 count 字段
**原行为**：[route.ts](file:///e:/桌面/oj/app/api/admin/ai/generate/route.ts) 解构 `count`，`Math.min(count, 5)` 限速，作为参数透传到 queue / prompt。

**新行为**：
- 解构中删除 `count`
- `addAiJob` params 中 `count: 1` 硬编码
- 移除 `if (!count)` 验证
- 数据库 `aiGenerationLog.params` 存储的 `count` 仍为 1（兼容历史数据，但不再作为有效输入）

## REMOVED Requirements

### Requirement: 生成数量选择器（1/2/3 道按钮）
**Reason**：业务决策 2026-06，单次 AI 调用只生成 1 道题最稳定，count>1 易触发 JSON 截断 / 重复 key bug。

**Migration**：
- 删除 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 中"生成数量"标签 + 3 个按钮（line 670-684 区域）
- 页面副标题新增提示"单次生成 1 道题，可同时提交多个独立任务"
- 删除 [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts) 中"✅ 关键 UI: 数量 1/2/3"和"`{n} 道` 模板 + [1, 2, 3] 数组"的 2 个用例
- 删除 [scripts/test-4-e2e.ts](file:///e:/桌面/oj/scripts/test-4-e2e.ts) 中"ParamGen count=2 — topic=图论（关键回归）"用例

### Requirement: 单任务全局 loading 状态
**Reason**：`loading: boolean` 改为按任务维度的 `activeJobs: Map<logId, JobState>`，每个任务有自己的 loading / result / thought。

**Migration**：
- `const [loading, setLoading] = useState(false)` 删除
- `const [pollingLogId, setPollingLogId] = useState<string | null>(null)` 改为 `const [activeJobs, setActiveJobs] = useState<Map<string, JobState>>(new Map())`
- `handleGenerate` 不再检查 `loading`，每次点击都创建新 job 并 push 到 `activeJobs`
- `pollLogStatus` 改为接收 `logId` 参数，每个 job 独立的 `setInterval`
- `cancelJob(logId)` 函数：从 `activeJobs` 移除 + `clearInterval`
- 结果区 JSX：从 `{result && ...}` 单卡片改为 `{Array.from(activeJobs.values()).map(job => <ResultCard job={job} ... />)}`
- `getWorkflowStep(loading, result)` 改为 `getWorkflowStep(activeJobs.size > 0)`（只看是否有 active 任务，不看具体哪个）

### Requirement: 单一 `result` / `thought` / `qualityIssues` state
**Reason**：每个任务需要独立的 result / thought / qualityIssues 状态。

**Migration**：
- `const [result, setResult] = useState<...>(null)` → 进入 `JobState` 结构
- `const [thought, setThought] = useState<...>(null)` → 进入 `JobState` 结构
- `const [qualityIssues, setQualityIssues] = useState<...>([])` → 进入 `JobState` 结构
- `JobState` 类型：`{ logId, status: 'PROCESSING' | 'COMPLETED' | 'FAILED', result?, thought?, qualityIssues?, error? }`
