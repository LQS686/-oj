# AI 题目测试数据输出自动修正 - 验收清单

## 阶段一：核心逻辑

- [x] [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) PARAM_GEN 模式在 `prisma.problem.create()` **之前**调用 `compileCode()` 编译标程
- [x] 优先使用 `problem.solution_cpp`，缺失时回退 `problem.solution_python`
- [x] AI 同时返回两种语言时，只用 solution_cpp（不尝试 Python）
- [x] 编译成功时对每个 test case 调 `executeCode()` 跑真实输出
- [x] 跑成功的 test case `output` 被覆盖为 `result.output.trim()`
- [x] 跑失败的 test case（timeout / runtimeError / exitCode !== 0）保留 AI 原 output
- [x] `finally` 块调 `cleanup(compileResult.compiledPath)` 清理编译产物
- [x] 编译失败时跳过输出覆盖，记录 `correctionStats.skipped = 'compile_failed'`
- [x] 无 solution_cpp 且无 solution_python 时跳过输出覆盖，记录 `correctionStats.skipped = 'no_solution'`
- [x] 执行参数与 `test_data` 模式一致：`timeLimit: 2000, memoryLimit: 256`

## 阶段二：统计与日志

- [x] `correctionStats` 字段包含 `{ total, passed, failed, corrected, avgTime, avgMemory }`（成功路径）
- [x] 编译失败时 `correctionStats` 为 `{ skipped: 'compile_failed', compileError }`
- [x] 无 solution 时 `correctionStats` 为 `{ skipped: 'no_solution' }`
- [x] `correctionStats` 字段写入 `aiGenerationLog.result`（与 `thought` / `problems` 共存）
- [x] 编译失败时 `logger.warn` 记录编译错误详情（含 compileError / stderr）
- [x] 单点失败时 `logger.warn` 记录具体 case index + 失败原因（timeout / runtimeError / exitCode）
- [x] 统计使用现有 `stats` 结构（避免引入新的统计变量）

## 阶段三：安全检查（可选）

- [x] 标程运行前调 `validateCodeSafety` 预检（如果可用）
- [x] 安全检查失败时 `correctionStats = { skipped: 'unsafe_code', reason }`
- [x] 任务 3 的"如果不可用"分支已处理（不影响主流程，用 try/catch 降级）

## 阶段四：端到端验证

- [ ] **场景 1**：input=`1 1`，AI 推断 output=`3`，标程 `return 2` → DB 中 output === `'2'`
- [ ] **场景 2**：标程编译失败（语法错）→ DB 中 output 与 AI 原值一致
- [ ] **场景 3**：标程对 10 个点中前 5 个正确、后 5 个 RE → 前 5 个 output 被覆盖，后 5 个保留 AI 原值
- [ ] **场景 4**：AI 同时返回 solution_cpp + solution_python → 使用 solution_cpp
- [ ] **场景 5**：AI 没返回任何 solution → DB 中 output 与 AI 原值一致
- [ ] **场景 6**：执行参数 `timeLimit: 2000, memoryLimit: 256` 生效（TLE 行为正确）
- [ ] **场景 7**：`/tmp` 编译产物在执行完成后被清理（`cleanup()` 生效）
- [x] `npx tsc --noEmit` 0 错误
- [ ] `aiGenerationLog.result.correctionStats` 在日志中可查询
- [ ] 端到端：触发 AI 出题 → 完成后查看 testCase.output → 来源标程而非 AI

## 代码质量

- [x] `npx tsc --noEmit` 0 错误
- [x] 复用已有 `compileCode` / `executeCode` / `cleanup` helper（**不**新写）
- [x] 复用已有 `stats` 统计结构
- [x] 修正逻辑放在 `prisma.problem.create()` **之前**（题目入库时已是修正后的 output）
- [x] 错误处理不影响主流程（标程执行失败时题目仍能正常入库）
- [x] 编译产物清理在 `finally` 块执行（异常路径也清理）
