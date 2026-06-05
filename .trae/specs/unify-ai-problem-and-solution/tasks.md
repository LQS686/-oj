# AI 题目 + 题解合并生成 - 任务清单

## 任务总览

按 4 个阶段推进：JSON 模板 → Prompt → queue.ts 改造 → 验证。
**核心目标**：PARAM_GEN 模式下，1 个 AI 调用 = 1 个 AiGenerationLog = 同时产出 Problem + Solution。

## 阶段一：JSON 模板 + 类型扩展

### 任务 1: JSON 模板新增 solution_article 字段 [lib/ai/prompts/paramgen/json-template.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/json-template.ts)
- [x] 1.1: 在 `SINGLE_PROBLEM_TEMPLATE` 末尾（`solution_python` 之后）追加 `solution_article` 字段
- [x] 1.2: `REQUIRED_FIELDS` 数组追加 `'solution_article'`
- [x] 1.3: 注释更新：模板新增 `solution_article` 字段，AI 必须填齐

### 任务 2: GeneratedProblem 类型扩展 [lib/ai/prompts/core/types.ts](file:///e:/桌面/oj/lib/ai/prompts/core/types.ts)
- [x] 2.1: `GeneratedProblem` 接口追加 `solution_article?: string` 字段

## 阶段二：Prompt 增补题解结构

### 任务 3: System prompt 增补题解结构说明 [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts)
- [x] 3.1: system prompt 末尾追加 "题解结构（5 段）" 段落，列出 5 个 H2 标题
- [x] 3.2: 强调 "参考代码" 段必须用 ```cpp ... ``` 包裹，内容与 `solution_cpp` 字段**完全一致**
- [x] 3.3: 强调"中文字符串中可能含双引号/反引号/换行，必须用 \\" 和 \\n 转义"

## 阶段三：queue.ts 改造

### 任务 4: PARAM_GEN 路径移除 enqueueSolutionJob，改为直接写 Solution [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts)
- [x] 4.1: **删除** PARAM_GEN 内的 `enqueueSolutionJob({...})` 调用块
- [x] 4.2: **删除** `import { enqueueSolutionJob } from './solution-queue'` 行（文件内已无引用）
- [x] 4.3: 在 `prisma.problem.create()` 成功之后，新增"直接创建 Solution"逻辑：
  - [x] 4.3.1: 检测 `problem.solution_article` 是否非空
  - [x] 4.3.2: 若非空 → `prisma.solution.deleteMany({ where: { problemId, sourceType: 'AI_OFFICIAL' } as any })`
  - [x] 4.3.3: `prisma.solution.create({ data: { ... } as any })`
  - [x] 4.3.4: 用 `as any` 兜底
- [x] 4.4: 若 `problem.solution_article` 为空 / 缺失：
  - [x] 4.4.1: `logger.warn` 记录
  - [x] 4.4.2: 不创建 Solution 记录
  - [x] 4.4.3: 不阻断主流程，Problem 仍正常入库

### 任务 5: AiGenerationLog 写入 solutionStatus 字段 [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts)
- [x] 5.1: PARAM_GEN 路径收集 `solutionResults: Array<{ problemNumber, status: 'created' | 'missing', solutionId? }>`
- [x] 5.2: 在 `prisma.aiGenerationLog.update()` 时把 `solutionStatus` 字段写入 `result` JSON
- [x] 5.3: 与 `correctionStats` 字段共存

## 阶段四：验证

### 任务 6: 验证
- [x] 6.1: 代码层面：queue.ts PARAM_GEN 路径**不**调用 `enqueueSolutionJob`（grep 验证 0 引用）
- [x] 6.2: 代码层面：手动新建题目 API 仍调 `enqueueSolutionJob`（[app/api/admin/problems/route.ts:279](file:///e:/桌面/oj/app/api/admin/problems/route.ts#L279) 保留）
- [x] 6.3: 代码层面：手动"重新生成题解"按钮仍调 `enqueueSolutionJob`（[app/api/admin/problems/[id]/regenerate-solution/route.ts:100](file:///e:/桌面/oj/app/api/admin/problems/%5Bid%5D/regenerate-solution/route.ts#L100) 保留）
- [x] 6.4: tsc --noEmit 0 错误
- [ ] 6.5: 端到端：UI 触发 AI 出题 → 完成后 "X 个任务进行中" 数字为 1（需在 dev server 手动验证）
- [ ] 6.6: 端到端：题目详情页能看到 AI 题解（`isAiGenerated=true, isOfficial=true, sourceType='AI_OFFICIAL'`）
- [ ] 6.7: 端到端：题解含 5 段 H2 标题 + 参考代码块
- [ ] 6.8: 端到端：AI 缺 `solution_article` 时日志含 `solutionStatus: [{ status: 'missing' }]`

## 任务依赖关系

```
任务1 (JSON 模板)
  ├── 任务2 (类型扩展) ── 与任务1 并行
  └── 任务3 (Prompt 增补) ── 与任务1 并行
        ↓
任务4 (queue.ts 改造) ── 任务1+2+3 完成后
  ├── 任务5 (日志字段) ── 与任务4 并行
  └── 任务6 (验证) ── 任务4+5 完成后
```

## 完成标准

所有 6 个任务的子项勾选完成；`npx tsc --noEmit` 0 错误；端到端流程 1 个任务产出 Problem + Solution；手动路径不受影响。
