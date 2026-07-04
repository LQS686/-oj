# 评测机超时与内存统计优化 Spec

## Why
当前评测机在超时处理与内存统计上存在多处与参考资源 Project LemonLime 不一致的设计缺陷，导致评测结果不准确：
- 超时判定使用墙钟时间（`Date.now()`）而非 CPU 时间，受 I/O、进程调度、系统抖动影响，易误判 TLE
- 超时强制杀死的缓冲为固定 `+1000ms`，不随时间限制自适应，短时限题（如 100ms）容差过大、长时限题（如 10s）容差过小
- 临界 TLE 重测逻辑存在 bug：仅当 `status==='TLE' && outputCorrect` 才重测，但输出正确时状态应为 AC，逻辑互斥导致重测永不触发
- 内存统计基于 `pidusage` 每 50ms 轮询，对短生命周期程序峰值采样缺失；Docker 模式下容器退出后才查询内存，始终返回 0
- 内存超限为被动检测（轮询发现超限后杀死），无硬限制（`RLIMIT_AS` / Job Object），瞬时分配可绕过限制
- 内存统计失败时回退到 `getEstimatedBaseMemory` 返回伪造基础值，污染展示数据

## What Changes
- 改进 `lib/judge/executor.ts`：使用进程退出后获取的内核统计（Linux `getrusage(RUSAGE_CHILDREN).ru_maxrss`；Windows 子进程 `GetProcessMemoryInfo` 峰值）替代轮询；CPU 时间优先（Linux `ru_utime`），Windows 回退到墙钟时间
- 改进 `lib/judge/executor.ts`：超时缓冲改为自适应 `extraTime = ceil(max(2000, timeLimit * 2) * extraTimeRatio)`，强制杀死窗口为 `timeLimit + extraTime`
- 改进 `lib/judge/executor.ts`：非 Docker 模式下设置硬资源限制（Linux `setrlimit(RLIMIT_AS/RLIMIT_CPU/RLIMIT_STACK)` via `prlimit` 系统调用或 wrapper 脚本；Windows 使用 Job Object 限制内存 + `CREATE_BREAKAWAY_FROM_JOB`）
- 修复 `lib/judge/judger.ts`：临界 TLE 重测逻辑——程序在 `timeLimit` 与 `timeLimit + extraTime` 之间完成且输出正确时，标记重测；重测通过则采用重测结果，否则判 TLE
- 移除 `lib/judge/executor.ts` 中失效的 Docker 内存查询（`getDockerContainerMemory`）与伪造回退（`getEstimatedBaseMemory`）；Docker 模式改用容器内 `docker stats --stream` 实时采集峰值或通过容器退出码识别 MLE
- 移除 `lib/judge/judger.ts` 的预热执行（warmup），改由 CPU 时间测量消除冷启动误差
- 扩展 `lib/judge/queue.ts`：`JudgeJob` 增加可选 `extraTimeRatio`（已有字段保留）、`rejudgeTimes`（已有字段保留），默认值由环境变量 `JUDGE_EXTRA_TIME_RATIO`（默认 0.1）、`JUDGE_REJUDGE_TIMES`（默认 1）控制
- 更新 `.env.example`：补充 `JUDGE_EXTRA_TIME_RATIO`、`JUDGE_REJUDGE_TIMES` 配置说明

## Impact
- Affected specs: `refactor-judger-traditional`（前一阶段重构的延续优化）
- Affected code:
  - `lib/judge/executor.ts`（核心重写：时间/内存采集、资源限制、超时窗口）
  - `lib/judge/judger.ts`（重测逻辑修复、移除预热）
  - `lib/judge/queue.ts`（环境变量注入默认值）
  - `.env.example` / `.env`（新增配置项）
  - `lib/submission/service.ts`、`lib/class/service.ts`、`lib/contest/service.ts`（透传 `extraTimeRatio`/`rejudgeTimes`，使用环境变量默认值）

## ADDED Requirements

### Requirement: CPU 时间测量
系统 SHALL 优先使用 CPU 时间（用户态 + 内核态）作为程序运行时长，而非墙钟时间，以排除 I/O 等待、进程调度抖动对时间统计的干扰。

#### Scenario: Linux 平台 CPU 时间采集
- **WHEN** 在 Linux 非容器模式下评测
- **THEN** 使用 `process.resourceUsage().ru_utime + ru_stime`（Node.js 进程级）或子进程 `getrusage` 等价方式采集 CPU 时间
- **AND** 时间精度为毫秒

#### Scenario: Windows 平台回退墙钟时间
- **WHEN** 在 Windows 平台评测（无 `getrusage` 等价 API）
- **THEN** 使用 `Date.now()` 墙钟时间，但计时窗口紧贴 `spawn` 返回后与 `exit` 事件触发瞬间
- **AND** 文档/日志中标注"Windows 使用墙钟时间"

### Requirement: 自适应超时缓冲
系统 SHALL 根据时间限制自适应计算超时缓冲：`extraTime = ceil(max(2000, timeLimit * 2) * extraTimeRatio)`，强制杀死窗口为 `timeLimit + extraTime`。

#### Scenario: 短时限题（100ms）
- **WHEN** timeLimit=100ms，extraTimeRatio=0.1
- **THEN** extraTime = ceil(max(2000, 200) * 0.1) = 200ms
- **AND** 程序最多可运行 300ms 后才被强制杀死

#### Scenario: 长时限题（10000ms）
- **WHEN** timeLimit=10000ms，extraTimeRatio=0.1
- **THEN** extraTime = ceil(max(2000, 20000) * 0.1) = 2000ms
- **AND** 程序最多可运行 12000ms 后才被强制杀死

### Requirement: 临界 TLE 重测
系统 SHALL 对"程序在 extraTime 窗口内完成、输出正确但 CPU 时间超过 timeLimit"的测点执行重测，以排除系统抖动导致的误判。

#### Scenario: 临界超时重测通过
- **WHEN** 首次运行 timeUsed=1050ms（timeLimit=1000ms，extraTime=200ms），输出正确
- **THEN** 标记 `needRejudge=true`，score 临时置 0，result 置 TLE
- **AND** 触发重测（最多 `rejudgeTimes` 次）
- **WHEN** 重测 timeUsed=980ms（< timeLimit），输出正确
- **THEN** 最终结果为 AC，score 恢复，timeUsed 取重测值

#### Scenario: 临界超时重测仍超
- **WHEN** 首次运行 timeUsed=1050ms，输出正确，触发重测
- **WHEN** 重测 timeUsed=1040ms（仍 > timeLimit）
- **THEN** 最终结果为 TLE，score=0

#### Scenario: 超出 extraTime 窗口
- **WHEN** 程序运行超过 timeLimit + extraTime 被强制杀死
- **THEN** 直接判 TLE，不触发重测

### Requirement: 内核级内存峰值采集
系统 SHALL 使用内核提供的进程资源统计获取峰值内存（Linux `ru_maxrss`；Windows `PeakWorkingSetSize`），替代轮询采样。

#### Scenario: Linux 非容器模式
- **WHEN** 在 Linux 非容器模式评测
- **THEN** 程序退出后通过 `getrusage(RUSAGE_CHILDREN)` 获取 `ru_maxrss`（单位 KB）
- **AND** 该值为进程生命周期内的峰值常驻内存，不会被采样间隔遗漏

#### Scenario: Windows 模式
- **WHEN** 在 Windows 模式评测
- **THEN** 通过 `GetProcessMemoryInfo` 的 `PeakWorkingSetSize` 获取峰值
- **AND** 不再依赖 `pidusage` 轮询

### Requirement: 硬内存限制
系统 SHALL 在非 Docker 模式下为子进程设置硬内存限制，使程序在分配超过限制的内存时立即被内核杀死，而非依赖轮询被动检测。

#### Scenario: Linux 设置 RLIMIT_AS
- **WHEN** 在 Linux 非容器模式评测，memoryLimit=128MB
- **THEN** 子进程通过 `setrlimit(RLIMIT_AS, ...)` 设置地址空间上限为 128MB
- **AND** 程序 malloc 超过 128MB 时立即收到 ENOMEM 或被 SIGKILL

#### Scenario: Windows Job Object
- **WHEN** 在 Windows 非容器模式评测，memoryLimit=128MB
- **THEN** 创建 Job Object 并设置 `JOB_OBJECT_LIMIT_PROCESS_MEMORY` 为 128MB
- **AND** 子进程加入 Job Object，超限时被终止

### Requirement: 环境变量配置
系统 SHALL 支持通过环境变量配置评测机的重测策略与超时容差。

#### Scenario: 默认配置
- **WHEN** 未设置 `JUDGE_EXTRA_TIME_RATIO` 和 `JUDGE_REJUDGE_TIMES`
- **THEN** extraTimeRatio 默认 0.1，rejudgeTimes 默认 1

#### Scenario: 自定义配置
- **WHEN** 设置 `JUDGE_EXTRA_TIME_RATIO=0.2`，`JUDGE_REJUDGE_TIMES=2`
- **THEN** 所有评测任务使用 extraTimeRatio=0.2，rejudgeTimes=2

## MODIFIED Requirements

### Requirement: 超时判定
原实现：`setTimeout(() => { 杀死进程 }, timeLimit + 1000)` 固定缓冲，墙钟时间。
新实现：`setTimeout(() => { 杀死进程 }, timeLimit + extraTime)` 自适应缓冲，CPU 时间优先；程序在窗口内完成时，若 CPU 时间 > timeLimit 且输出正确，触发重测。

### Requirement: 内存判定
原实现：`pidusage` 每 50ms 轮询，超限杀死；Docker 模式容器退出后查询（失效）。
新实现：子进程退出后获取内核峰值统计；硬限制使超限分配在内核层被拦截；移除伪造回退值。

## REMOVED Requirements

### Requirement: 预热执行（warmup）
**Reason**: CPU 时间测量已排除冷启动 I/O 开销，预热不再必要，且浪费一次评测时间
**Migration**: 直接删除 `judger.ts` 中的预热逻辑

### Requirement: pidusage 轮询内存
**Reason**: 轮询采样存在峰值遗漏、性能开销、Windows wmic 慢等问题
**Migration**: 改用内核级 `ru_maxrss` / `PeakWorkingSetSize`

### Requirement: getEstimatedBaseMemory 伪造回退
**Reason**: 当内存采集失败时返回伪造基础值（如 C/C++ 返回 1024KB）污染展示数据，应返回 0 或标注"未采集"
**Migration**: 采集失败时返回 0，并在日志中记录警告
