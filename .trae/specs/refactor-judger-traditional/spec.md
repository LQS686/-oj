# 评测机模块化重构（传统题）Spec

## Why

当前 OJ 的评测机（`lib/judge/judger.ts`）是单文件实现，仅支持一种输出比较模式（NOI 忽略行末空格 + 文末空行），结果状态粗糙（仅 AC/WA/TLE/MLE/RE/CE/SE），且将整个输出一次性读入内存做字符串比较，对大输出不友好。

参考资源目录中的 `Project_LemonLime-0.3.6.2` 提供了成熟的 C++ 评测机实现：`TaskJudger`（编排）→ `JudgingThread`（单测点执行+比较）→ `ProcessRunner`（进程隔离执行）+ 多种比较模式 + 细粒度结果状态 + 流式缓冲比较 + 临界 TLE 重测机制。

本次重构借鉴 LemonLime 的架构思想，将评测机拆分为清晰模块，并补齐传统题所需的多种比较模式、细粒度状态、流式比较与重测能力。**仅针对传统题**（选手程序读 stdin、写 stdout、评测机比较输出），不涉及交互题/通信题/提交答案题。

## What Changes

- **重构 `lib/judge/` 为模块化架构**：
  - `types.ts`（新增）：共享类型 `ResultState`、`CompileState`、`ComparisonMode`、`JudgeVerdict` 等
  - `comparator.ts`（新增）：抽取输出比较逻辑，支持多种模式，使用 Node.js 流式缓冲读取
  - `judger.ts`（重构）：瘦身为编排器，调用 `compiler` / `executor` / `comparator`，类似 LemonLime 的 `TaskJudger`
  - `compiler.ts`（改进）：显式返回 `CompileState`，区分 `NoValidSourceFile` / `CompileError` / `CompileTimeLimitExceeded` / `InvalidCompiler`
  - `executor.ts`（改进）：返回更细粒度状态（`CannotStartProgram` / `FileError`）
  - `queue.ts` / `worker.ts` / `codeAnalyzer.ts` / `init.ts`：保持不变
- **新增多种比较模式（传统题）**：
  - `default`：当前 NOI 模式（忽略行末空格 + 文末空行），**向后兼容默认值**
  - `strict`：严格逐行精确匹配
  - `ignore-spaces`：基于 token 的比较，忽略所有空白差异（含行间差异视为 PresentationError）
  - `real-number`：浮点数比较，可配置精度 `realPrecision`（默认 3 位小数）
- **新增细粒度结果状态**：`PE`（PresentationError）、`OLE`（OutputLimitExceeded）、`CSP`（CannotStartProgram）、`PC`（PartlyCorrect）
- **流式缓冲比较**：使用 Node.js `ReadStream` + 固定缓冲区（128KB）逐块读取，避免大输出全量入内存
- **临界 TLE 重测机制**：当 `timeUsed > timeLimit` 但 `timeUsed ≤ timeLimit × (1 + extraTimeRatio)` 且原结果非 0 分时，触发重测（可配置次数，默认 0=关闭）
- **单测点限制覆盖**：`TestCase` 新增 `timeLimit`、`memoryLimit` 可空字段，允许覆盖题目默认限制
- **题目级比较配置**：`Problem` 新增 `comparisonMode`（默认 `default`）与 `realPrecision`（默认 3）字段

## Impact

- **Affected specs**：无直接关联 spec；与 `lib/problem/testcase-scoring.ts`（分数分配）正交，不修改
- **Affected code**：
  - `lib/judge/types.ts`（新）、`lib/judge/comparator.ts`（新）、`lib/judge/judger.ts`（重构）、`lib/judge/compiler.ts`（改进）、`lib/judge/executor.ts`（改进）
  - `lib/judge/queue.ts`：`JudgeJob` 增加可选字段 `comparisonMode`、`realPrecision`、`rejudgeTimes`、`extraTimeRatio`
  - `lib/submission/service.ts`、`lib/class/service.ts`、`lib/contest/service.ts`：入队时透传比较配置与单测点限制
  - `prisma/schema.prisma`：`Problem` 增加 `comparisonMode`、`realPrecision`；`TestCase` 增加 `timeLimit`、`memoryLimit`
  - `app/admin/problems/[id]/edit/page.tsx`、`app/admin/problems/create/page.tsx`：增加比较模式选择器（极简 UI）
  - `app/admin/problems/[id]/testcases/page.tsx`：可选的单测点限制输入（极简 UI）
  - `components/submission/JudgeStatus.tsx`：新增状态文案/颜色映射
- **向后兼容**：`comparisonMode` 默认 `default`，行为与当前完全一致；单测点限制可空，空值回退到题目级限制

## ADDED Requirements

### Requirement: 模块化评测架构

系统 SHALL 将评测机拆分为职责清晰的模块：`types.ts`（类型）、`comparator.ts`（输出比较）、`judger.ts`（编排）、`compiler.ts`（编译）、`executor.ts`（执行），各模块通过显式接口协作。

#### Scenario: 模块边界清晰
- **WHEN** 开发者查看 `lib/judge/` 目录
- **THEN** 比较逻辑位于 `comparator.ts`，编排逻辑位于 `judger.ts`，编译逻辑位于 `compiler.ts`，执行逻辑位于 `executor.ts`，共享类型位于 `types.ts`
- **AND** `judger.ts` 不直接包含输出比较代码，而是调用 `comparator.ts` 导出的函数

### Requirement: 多种输出比较模式

系统 SHALL 支持以下比较模式，由题目的 `comparisonMode` 字段决定：`default`（NOI 忽略行末空格+文末空行）、`strict`（严格逐行）、`ignore-spaces`（token 化忽略所有空白）、`real-number`（浮点数按精度比较）。

#### Scenario: default 模式向后兼容
- **WHEN** 题目 `comparisonMode` 为 `default` 或未设置
- **THEN** 比较行为与当前实现完全一致（去行末空格 + 去文末空行后逐行精确匹配）

#### Scenario: strict 模式
- **WHEN** 题目 `comparisonMode` 为 `strict`
- **AND** 选手输出与标准答案逐字节逐行完全相同
- **THEN** 判定 AC
- **WHEN** 选手输出与标准答案存在任意字节差异（含行末空格）
- **THEN** 判定 WA

#### Scenario: ignore-spaces 模式
- **WHEN** 题目 `comparisonMode` 为 `ignore-spaces`
- **AND** 选手输出与标准答案的 token 序列完全相同
- **THEN** 判定 AC
- **WHEN** token 序列相同但行分布不同（如多 token 挤在同一行）
- **THEN** 判定 PE（PresentationError）

#### Scenario: real-number 模式
- **WHEN** 题目 `comparisonMode` 为 `real-number`
- **AND** 选手输出与标准答案逐个浮点数比较，`|a-b| ≤ max(eps, eps×|b|)`（eps = 10^(-realPrecision)）
- **THEN** 判定 AC
- **WHEN** 任一对应浮点数差异超过容差
- **THEN** 判定 WA，message 包含行号与期望/实际值

### Requirement: 细粒度结果状态

系统 SHALL 支持以下结果状态：`AC`、`WA`、`TLE`、`MLE`、`RE`、`CE`、`SE`、`PC`（PartlyCorrect，部分正确，预留）、`PE`（PresentationError）、`OLE`（OutputLimitExceeded）、`CSP`（CannotStartProgram）。

#### Scenario: PresentationError 识别
- **WHEN** `ignore-spaces` 模式下 token 序列相同但行分布不同
- **THEN** 测点状态为 `PE`

#### Scenario: OutputLimitExceeded 识别
- **WHEN** 选手输出比标准答案多出非空白内容
- **THEN** 测点状态为 `OLE`

#### Scenario: CannotStartProgram 识别
- **WHEN** 可执行文件无法启动（spawn 失败）
- **THEN** 测点状态为 `CSP`，message 包含错误原因

### Requirement: 流式缓冲比较

系统 SHALL 使用流式读取（Node.js ReadStream + 128KB 缓冲区）逐块比较输出，避免将整个输出文件一次性读入内存。

#### Scenario: 大输出不撑爆内存
- **WHEN** 选手输出或标准答案超过 1MB
- **THEN** 比较过程内存占用保持在常数级（缓冲区大小量级）
- **AND** 比较结果与全量读取一致

### Requirement: 临界 TLE 重测

系统 SHALL 支持对临界超时的测点重测：当 `timeUsed > timeLimit` 且 `timeUsed ≤ timeLimit × (1 + extraTimeRatio)` 且原结果有得分时，触发重测，最多重测 `rejudgeTimes` 次，取最后一次结果。

#### Scenario: 临界超时重测通过
- **WHEN** `extraTimeRatio = 0.1`、`rejudgeTimes = 1`、`timeLimit = 1000`
- **AND** 首次运行 `timeUsed = 1050`（>1000 但 ≤1100）且输出正确
- **THEN** 触发重测
- **AND** 重测 `timeUsed = 980` 时判定 AC
- **AND** 重测 `timeUsed = 1080` 时仍判定 TLE

#### Scenario: 关闭重测
- **WHEN** `rejudgeTimes = 0`（默认）
- **THEN** 不触发任何重测，行为与当前一致

### Requirement: 单测点限制覆盖

系统 SHALL 允许每个 `TestCase` 覆盖题目的时间/内存限制：`TestCase.timeLimit` / `TestCase.memoryLimit` 非空时优先使用，为空时回退到 `Problem.timeLimit` / `Problem.memoryLimit`。

#### Scenario: 单测点覆盖时间限制
- **WHEN** 题目 `timeLimit = 1000`，某测点 `timeLimit = 2000`
- **THEN** 该测点按 2000ms 限制执行，其他测点仍按 1000ms

#### Scenario: 空值回退
- **WHEN** 测点 `timeLimit` 为 null
- **THEN** 该测点使用题目级 `timeLimit`

### Requirement: 题目级比较配置

系统 SHALL 在 `Problem` 上增加 `comparisonMode`（默认 `default`）与 `realPrecision`（默认 3）字段，供评测机读取。

#### Scenario: 新题目默认配置
- **WHEN** 创建新题目未指定 `comparisonMode`
- **THEN** 字段值为 `default`，评测行为与重构前一致

## MODIFIED Requirements

### Requirement: 传统题评测流程

系统 SHALL 按以下流程评测传统题：代码安全分析 → 编译（返回 `CompileState`）→ 逐测点执行（应用单测点限制覆盖）→ 流式比较输出（按题目 `comparisonMode`）→ 临界 TLE 重测（若启用）→ 汇总结果与状态。编译失败时短路返回 `CE` 并附带 `CompileState` 细分原因。

#### Scenario: 编译失败细分原因
- **WHEN** 源文件为空或无有效源文件
- **THEN** 返回 `CE`，message 标注 `NoValidSourceFile`
- **WHEN** 编译超时（>30s）
- **THEN** 返回 `CE`，message 标注 `CompileTimeLimitExceeded`
- **WHEN** 编译器不存在
- **THEN** 返回 `CE`，message 标注 `InvalidCompiler`

#### Scenario: 透传比较配置
- **WHEN** 提交代码入队
- **THEN** `JudgeJob` 携带题目的 `comparisonMode`、`realPrecision`、`rejudgeTimes`、`extraTimeRatio` 以及每个测点的 `timeLimit`、`memoryLimit` 覆盖值
