# AI 题目测试数据输出自动修正 - 任务清单

## 任务总览

按 3 个阶段推进：核心逻辑 → 统计与日志 → 端到端验证。
**核心改动**：`lib/ai/queue.ts` PARAM_GEN 路径在 `prisma.problem.create()` 前**新增**标程执行 + 输出覆盖逻辑，**复用** `test_data` 模式的 helper。

## 阶段一：核心逻辑

### 任务 1: 在 PARAM_GEN 模式添加标程执行与输出覆盖
- [x] 1.1: 在 [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) PARAM_GEN 循环中（`for (const problem of problems)` 内，`prisma.problem.create()` 之前），检测是否有 `problem.solution_cpp` 或 `problem.solution_python`
- [x] 1.2: 优先取 `solution_cpp`（`problem.solution_cpp`），缺失时回退 `problem.solution_python`
- [x] 1.3: 调 `compileCode(code, language)` 编译标程
  - [x] 1.3.1: 编译失败 → `logger.warn` 记录 + 设 `correctionStats = { skipped: 'compile_failed', compileError }` + **跳过**输出覆盖 + 保留原 validTestCases
  - [x] 1.3.2: 编译成功 → 继续执行
- [x] 1.4: 在 `try { ... } finally { cleanup() }` 中遍历 validTestCases
  - [x] 1.4.1: 对每个 test case 调 `executeCode({ code, language, input: tc.input, timeLimit: 2000, memoryLimit: 256, compiledPath })`
  - [x] 1.4.2: timeout / runtimeError / exitCode !== 0 → `stats.failed++` + `logger.warn` + **保留**该点的 `tc.output`
  - [x] 1.4.3: 成功 → `stats.passed++` + 累加 `totalTime` / `totalMemory` + `tc.output = result.output.trim()` 覆盖原值
- [x] 1.5: 循环结束后计算 `stats.avgTime = Math.round(totalTime / stats.passed)`、`stats.avgMemory = Math.round(totalMemory / stats.passed)`（`stats.passed === 0` 时跳过）
- [x] 1.6: 设置 `correctionStats = { total, passed, failed, corrected: passed, avgTime, avgMemory }`（无 solution 时为 `{ skipped: 'no_solution' }`）

### 任务 2: 挂载 correctionStats 到 AiGenerationLog
- [x] 2.1: 在 `prisma.aiGenerationLog.update({ where: { id: job.id } })` 时把 `correctionStats` 加到 `result` 字段（line 391-402 区域）
- [x] 2.2: 与现有的 `thought`、`problems` 字段共存
- [x] 2.3: 用 `as any` 兜底（与文件内其他 result 字段处理一致）

## 阶段二：安全检查（可选增强）

### 任务 3: 标程安全预检
- [x] 3.1: 在调用 `compileCode` 之前，调 [lib/judge/codeAnalyzer.ts](file:///e:/桌面/oj/lib/judge/codeAnalyzer.ts) 的 `validateCodeSafety(code, language)` 预检
- [x] 3.2: 安全检查失败 → `correctionStats = { skipped: 'unsafe_code', reason: '...' }` + 跳过输出覆盖
- [x] 3.3: 如果 `validateCodeSafety` 在 `lib/ai/queue.ts` 上下文不可用（类型不兼容），本任务降级为可选项；主流程不受影响（已用 try/catch 包裹）

## 阶段三：端到端验证

### 任务 4: 验证
- [ ] 4.1: 单元验证：构造一个简单问题（input=`1 1`，AI 推断 output=`3`，标程写 `return 2`）→ 触发保存 → DB 中 testCase.output === `'2'`
- [ ] 4.2: 编译失败验证：标程故意写错（如 `int main() {` 不闭合）→ 触发保存 → DB 中 testCase.output 保持 AI 原值
- [ ] 4.3: 部分失败验证：标程对前 5 个点正确、对第 6 个点死循环 → 触发保存 → 前 5 个点 output 被覆盖，第 6 个点保留 AI 原值
- [ ] 4.4: 优先级验证：AI 同时返回 solution_cpp 和 solution_python → 使用 solution_cpp
- [ ] 4.5: 无 solution 验证：AI 没返回 solution_cpp/solution_python → 跳过修正，DB 中 output 与 AI 原值一致
- [x] 4.6: tsc --noEmit 0 错误
- [ ] 4.7: AiGenerationLog.result.correctionStats 字段正确填充
- [ ] 4.8: 编译产物被 cleanup（`/tmp` 下无残留）

## 任务依赖关系

```
任务1 (核心逻辑)
  ├── 任务2 (日志挂载) ── 任务1 的一部分时可同步完成
  ├── 任务3 (安全预检) ── 可与任务1 并行
  └── 任务4 (验证) ── 任务1+2+3 完成后
```

任务1 是关键路径；任务3 可选；任务4 收尾。

## 完成标准

所有任务的子项勾选完成；`npx tsc --noEmit` 0 错误；端到端测试覆盖至少 4 种场景（成功 / 编译失败 / 部分失败 / 无 solution）。
