# AI 题目测试数据输出自动修正规范

## Why

当前 AI 出题（PARAM_GEN 模式）流程中，AI 生成的测试数据（test_cases）的 `output` 字段完全由 AI **推断**生成，但 AI 经常"幻觉"出错误的 output（计算结果错、浮点精度错、边界条件错、漏输出空行）。这些错误的 output 入库后会直接被用于评测用户提交，导致大量误判 WA。

**已有 `test_data` 模式**（[lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) line 102-187）已实现了这一逻辑：用用户提供的 solutionCode 真实运行覆盖 AI 推断的 output。但 **PARAM_GEN 模式**（AI 自动出题）**没有**这个步骤 —— AI 给的 solution_cpp 已经在手上，**没有**用它去覆盖 AI 推断的 output。

**目标**：在题目入库前，**真实运行标程**（`problem.solution_cpp` 优先，`solution_python` 兜底）针对每个 test case 的 input 计算真实 output，**覆盖** AI 推断的 output。**核心原则**：测试数据的 output 只能由标程"算"出来，不能由 AI"猜"出来。

## What Changes

- 复用 `lib/ai/queue.ts` 中已有的 `compileCode` + `executeCode` + `cleanup` helper（`test_data` 模式已验证可用）
- 在 PARAM_GEN 路径的题目创建前，**新增**"标程执行 + 输出覆盖"步骤
- 标程编译失败 → 跳过该题目的输出修正，保留 AI 原 output
- 单个测试点失败（TLE/RE/非零退出）→ 跳过该点，保留 AI 原 output；其他通过的点正常覆盖
- 修正统计写入 `aiGenerationLog.result.correctionStats` 字段
- 复用现有 `stats` 结构（`{ total, passed, failed, avgTime, avgMemory }`）

## Impact

- Affected code:
  - [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) (PARAM_GEN 路径，line 299-377 区域)
  - [app/api/admin/ai/generate/route.ts](file:///e:/桌面/oj/app/api/admin/ai/generate/route.ts) (无改动，调用方无需感知)
- Affected specs: 与 `auto-verify-and-publish-ai-problems` **互补**而非冲突 —— 那个 spec 关注"标程反向修正"（solution auto-fix），本 spec 关注"标程正向修正 output"（test output correction）

## ADDED Requirements

### Requirement: PARAM_GEN 模式自动修正测试点输出
The system SHALL 在 AI 出题（PARAM_GEN 模式）题目入库前，真实运行标程对每个测试点的 input 计算实际 output，**覆盖** AI 推断的 output。

#### Scenario: 标程编译成功且所有测试点通过
- **WHEN** AI 返回的 `solution_cpp` 编译成功，且对**所有** test case 的 input 跑出正常输出
- **THEN** **所有** test case 的 `output` 字段被覆盖为标程实际输出（`result.output.trim()`）
- **AND** 题目按原流程入库（`prisma.problem.create()` 使用修正后的 testCases）
- **AND** `aiGenerationLog.result.correctionStats = { total, passed: total, failed: 0, corrected: total, avgTime, avgMemory }`

#### Scenario: 标程编译失败
- **WHEN** AI 返回的 `solution_cpp` 编译失败（`compileResult.success === false`）
- **THEN** **跳过**该题目的输出修正流程
- **AND** 所有 test case 保留 AI 推断的 output（**不**覆盖）
- **AND** `aiGenerationLog.result.correctionStats = { skipped: 'compile_failed', compileError: '...' }`
- **AND** `logger.warn` 记录编译错误详情
- **AND** 题目仍正常入库（标程错 ≠ 测试数据错，标程将在题解生成阶段重新生成）

#### Scenario: 部分测试点失败
- **WHEN** 标程编译成功，但某个测试点超时（TLE）/ 运行时错误（RE）/ 非零退出（exitCode !== 0）
- **THEN** 该失败的测试点**保留** AI 推断的 output
- **AND** 其他通过的测试点 output 被覆盖
- **AND** `correctionStats.failed` += 1
- **AND** `logger.warn` 记录具体哪个 case index 失败 + 失败原因

#### Scenario: 无标程可用
- **WHEN** AI 没有返回 `solution_cpp` **且**没有返回 `solution_python`（极少数情况）
- **THEN** **跳过**输出修正，保留所有 AI 推断的 output
- **AND** `correctionStats = { skipped: 'no_solution' }`
- **AND** 题目正常入库

#### Scenario: 优先使用 C++ 标程
- **WHEN** AI 同时返回了 `solution_cpp` 和 `solution_python`
- **THEN** **优先**使用 `solution_cpp`（更严格、更快），不尝试 Python
- **AND** 只在 `solution_cpp` 缺失时回退到 `solution_python`

### Requirement: 复用已有执行 helper
The system SHALL **复用** `lib/ai/queue.ts` 中已有的 `compileCode` / `executeCode` / `cleanup` helper（已在 `test_data` 模式中验证可用），**严禁**新写编译/执行逻辑或绕过 judge 系统。

#### Scenario: 代码复用
- **WHEN** PARAM_GEN 模式需要运行标程
- **THEN** 调用同文件顶部已 import 的 `compileCode()` + `executeCode()` helper
- **AND** `compileResult.compiledPath` 传给 `executeCode()`
- **AND** 在 `finally` 块调用 `cleanup(compileResult.compiledPath)` 清理编译产物（即使中途抛错也要清理）
- **AND** 执行参数与 `test_data` 模式一致：`timeLimit: 2000, memoryLimit: 256`

### Requirement: 修正结果可追溯
The system SHALL 把输出修正的统计信息持久化到 `AiGenerationLog.result.correctionStats` 字段，供前端展示和事后排查。

#### Scenario: 日志字段写入
- **WHEN** PARAM_GEN 模式题目创建完成
- **THEN** `aiGenerationLog.result` 包含 `correctionStats` 字段，结构如下：
  ```ts
  type CorrectionStats =
    | { total: number; passed: number; failed: number; corrected: number; avgTime: number; avgMemory: number }
    | { skipped: 'compile_failed' | 'no_solution'; compileError?: string }
  ```
- **AND** 日志的 `result` 字段已存在的 `thought` 字段不受影响

## MODIFIED Requirements
（无现有规范需要修改 —— `auto-verify-and-publish-ai-problems` spec 关注的是不同方向）

## REMOVED Requirements
（无）

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 标程有 bug → 输出错的"标准答案"，污染题库 | 属于 `auto-verify-and-publish-ai-problems` spec 范围（3 次标程反向修正循环），本 spec 不重复处理；本 spec 仅做"算 output"的第一步 |
| 标程运行慢 → 题目创建慢 | 复用 `test_data` 模式的超时配置：`timeLimit: 2000, memoryLimit: 256` |
| 标程恶意代码 → 沙箱逃逸 | 复用 `test_data` 模式的沙箱执行（`lib/judge/executor.ts` 已有隔离）；可选地追加 `lib/judge/codeAnalyzer.ts` 的 `validateCodeSafety` 预检（不影响主流程） |
| 编译产物未清理 → 磁盘泄漏 | `finally` 块强制 `cleanup(compileResult.compiledPath)` |
| AI 出题流程整体变慢 | 每次出题 1 道（业务决策 2026-06），单题标程执行通常 < 5s；用户已接受 test_data 模式的等待 |

## 验证标准

- [ ] PARAM_GEN 模式下，标程运行成功后，DB 中 `testCase.output` 与标程实际输出**完全一致**（含 trim 处理）
- [ ] 标程编译失败时，DB 中 `testCase.output` 与 AI 推断的 output **一致**（无修正）
- [ ] 部分测试点失败时，DB 中通过的测试点 output 已被覆盖，失败的点保留 AI 原值
- [ ] 无 solution code 时，DB 中 output 与 AI 原值一致
- [ ] `aiGenerationLog.result.correctionStats` 字段正确填充
- [ ] 编译产物被 `cleanup()` 清理（`/tmp` 下无残留可执行文件）
- [ ] `npx tsc --noEmit` 0 错误
- [ ] 端到端：触发 AI 出题 → 完成后查看 testCase.output → 来源标程而非 AI

## 验收清单

见 [checklist.md](file:///e:/桌面/oj/.trae/specs/ai-auto-correct-test-outputs/checklist.md)
