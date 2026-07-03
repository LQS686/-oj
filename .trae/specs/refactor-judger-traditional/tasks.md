# Tasks

- [x] Task 1: 新建共享类型模块 `lib/judge/types.ts`
  - [ ] SubTask 1.1: 定义 `ResultState` 联合类型（AC/WA/TLE/MLE/RE/CE/SE/PC/PE/OLE/CSP）与显示文案映射
  - [ ] SubTask 1.2: 定义 `CompileState` 枚举（CompileSuccessfully/NoValidSourceFile/CompileError/CompileTimeLimitExceeded/InvalidCompiler）
  - [ ] SubTask 1.3: 定义 `ComparisonMode` 联合类型（default/strict/ignore-spaces/real-number）
  - [ ] SubTask 1.4: 定义 `CompareInput`、`CompareResult`、`JudgeVerdict` 接口

- [x] Task 2: 新建流式比较模块 `lib/judge/comparator.ts`
  - [ ] SubTask 2.1: 实现缓冲流读取器 `BufferedStreamReader`（128KB 缓冲，支持 nextUntilNewLine/nextUntilSpace/行号追踪）
  - [ ] SubTask 2.2: 实现 `compareDefault`（NOI 模式：去行末空格 + 去文末空行后逐行匹配，向后兼容）
  - [ ] SubTask 2.3: 实现 `compareStrict`（逐字节逐行精确匹配）
  - [ ] SubTask 2.4: 实现 `compareIgnoreSpaces`（token 化比较，token 序列相同但行分布不同返回 PE）
  - [ ] SubTask 2.5: 实现 `compareRealNumbers`（浮点数按 eps = 10^(-realPrecision) 比较，message 含行号与期望/实际值）
  - [ ] SubTask 2.6: 导出统一入口 `compareOutput(input, options)` 按 `comparisonMode` 分派

- [x] Task 3: 改进 `lib/judge/compiler.ts` 返回 CompileState
  - [ ] SubTask 3.1: `CompileResult` 增加 `compileState: CompileState` 字段
  - [ ] SubTask 3.2: 空代码/不支持语言时返回 `NoValidSourceFile`
  - [ ] SubTask 3.3: 编译超时返回 `CompileTimeLimitExceeded`，编译器缺失返回 `InvalidCompiler`
  - [ ] SubTask 3.4: 保留 `success`/`compiledPath`/`error` 字段以保持调用方兼容

- [x] Task 4: 改进 `lib/judge/executor.ts` 返回细粒度状态
  - [ ] SubTask 4.1: `ExecuteResult` 增加 `cannotStart: boolean` 标记 spawn 失败
  - [ ] SubTask 4.2: spawn 抛错时设置 `cannotStart=true` 而非笼统 runtimeError
  - [ ] SubTask 4.3: 保持现有 timeout/memoryExceeded/runtimeError/output/time/memory 字段不变

- [x] Task 5: 重构 `lib/judge/judger.ts` 为编排器
  - [ ] SubTask 5.1: 移除内联 `compareOutput` 函数，改为调用 `comparator.compareOutput`
  - [ ] SubTask 5.2: 编译阶段读取 `compileResult.compileState`，失败时短路返回 CE 并在 message 标注细分原因
  - [ ] SubTask 5.3: 执行阶段读取 `executeResult.cannotStart`，标记 CSP 状态
  - [ ] SubTask 5.4: 比较阶段根据 `comparisonMode` 分派，PE/OLE 等新状态透传到 testResults
  - [ ] SubTask 5.5: 单测点限制覆盖：`testCase.timeLimit ?? job.timeLimit`、`testCase.memoryLimit ?? job.memoryLimit`
  - [ ] SubTask 5.6: 临界 TLE 重测：循环最多 `rejudgeTimes` 次，仅当临界超时且原结果有得分时触发

- [x] Task 6: 扩展 `lib/judge/queue.ts` 的 JudgeJob 类型
  - [ ] SubTask 6.1: `JudgeJob` 增加可选字段 `comparisonMode`、`realPrecision`、`rejudgeTimes`（默认 0）、`extraTimeRatio`（默认 0）
  - [ ] SubTask 6.2: `testCases` 数组项增加可选 `timeLimit`、`memoryLimit`
  - [ ] SubTask 6.3: `JudgeResult.status` 类型扩展为包含 `PC`、`PE`、`OLE`、`CSP`

- [x] Task 7: 更新 Prisma schema 与迁移
  - [ ] SubTask 7.1: `Problem` 增加 `comparisonMode String @default("default")`、`realPrecision Int @default(3)`
  - [ ] SubTask 7.2: `TestCase` 增加 `timeLimit Int?`、`memoryLimit Int?`
  - [ ] SubTask 7.3: 运行 `npx prisma generate` 同步类型

- [x] Task 8: 更新入队逻辑透传比较配置
  - [ ] SubTask 8.1: `lib/submission/service.ts` 的 `submitCode` 入队时携带 `comparisonMode`、`realPrecision`、单测点 `timeLimit`/`memoryLimit`
  - [ ] SubTask 8.2: `lib/class/service.ts`、`lib/contest/service.ts` 中调用 `addJudgeJob` 处同步透传
  - [ ] SubTask 8.3: `rejudgeTimes`/`extraTimeRatio` 暂用默认 0（关闭重测），后续可由环境变量配置

- [x] Task 9: 前端状态展示与极简配置 UI
  - [ ] SubTask 9.1: `components/submission/JudgeStatus.tsx` 增加 PE/OLE/CSP/PC 的文案与颜色映射
  - [ ] SubTask 9.2: `app/admin/problems/create/page.tsx` 与 `app/admin/problems/[id]/edit/page.tsx` 增加比较模式下拉选择（default/strict/ignore-spaces/real-number）+ realPrecision 输入（仅 real-number 模式显示）
  - [ ] SubTask 9.3: `app/admin/problems/[id]/testcases/page.tsx` 增加可选的单测点 timeLimit/memoryLimit 输入（留空=使用题目默认）
  - [ ] SubTask 9.4: 题目创建/更新 API 与 `lib/problem/service.ts` 接收并持久化 `comparisonMode`、`realPrecision`、单测点限制

- [x] Task 10: 验证向后兼容与端到端流程
  - [ ] SubTask 10.1: 确认未设置 `comparisonMode` 的旧题目评测结果与重构前完全一致（default 模式）
  - [ ] SubTask 10.2: 确认未设置单测点限制的旧测点回退到题目级限制
  - [ ] SubTask 10.3: TypeScript 编译通过（`npx tsc --noEmit`）
  - [ ] SubTask 10.4: ESLint 通过（`npx eslint lib/judge app/admin/problems --max-warnings 0`）

- [x] Task 11: 修复验证发现的 4 处问题
  - [ ] SubTask 11.1: 重构 `comparator.ts` 的 `BufferedStreamReader` 为 Node.js ReadStream + 128KB 缓冲流式读取（参考 LemonLime judgingthread.cpp）
  - [ ] SubTask 11.2: 修改 `judger.ts` CE 分支，message 拼接 `COMPILE_STATE_MESSAGES[compileState]` 前缀，并移除未使用的 `CompileState`、`ComparisonMode` 导入
  - [ ] SubTask 11.3: 修复 `lib/problem/service.ts` 的 `createProblemWithTestcases` 中 testCases 映射缺失 `timeLimit`/`memoryLimit` 字段
  - [ ] SubTask 11.4: 修复 `comparator.ts` 中未使用的 `ComparisonMode` 导入

# Task Dependencies
- Task 2 依赖 Task 1（comparator 使用 types）
- Task 3、Task 4 独立，可与 Task 2 并行
- Task 5 依赖 Task 1、2、3、4
- Task 6 依赖 Task 1
- Task 7 独立（仅 schema）
- Task 8 依赖 Task 6、7
- Task 9 依赖 Task 7
- Task 10 依赖 Task 5、6、8、9
