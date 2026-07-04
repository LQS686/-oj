# Tasks

- [x] Task 1: 改进 `lib/judge/executor.ts` 的时间统计与超时窗口
  - [x] SubTask 1.1: 新增 `computeExtraTime(timeLimit, extraTimeRatio)` 辅助函数，实现 `ceil(max(2000, timeLimit * 2) * extraTimeRatio)`
  - [x] SubTask 1.2: `ExecuteOptions` 增加可选 `extraTimeRatio?: number`；`ExecuteResult` 增加可选 `cpuTime?: number`（CPU 时间，ms）与 `exceedsTimeLimit?: boolean`（程序完成但 CPU 时间 > timeLimit 标记，用于触发重测）
  - [x] SubTask 1.3: Linux 非容器模式：子进程退出后通过 `process.resourceUsage()` 差值（评测前后 `ru_utime+ru_stime`）或 `/proc/[pid]/stat` 解析 utime/stime 计算 CPU 时间（毫秒）；优先使用 CPU 时间，失败回退墙钟时间
  - [x] SubTask 1.4: Windows 模式：保留墙钟时间测量，但记录 `cpuTime = time`（标注平台限制）
  - [x] SubTask 1.5: 超时 setTimeout 窗口改为 `timeLimit + extraTime`（替代固定 `+1000`）
  - [x] SubTask 1.6: 程序正常退出时，若 `cpuTime > timeLimit` 但未超 `timeLimit + extraTime`，设置 `exceedsTimeLimit = true`，`timeout = false`（供 judger 触发重测）

- [x] Task 2: 改进 `lib/judge/executor.ts` 的内存统计
  - [x] SubTask 2.1: Linux 非容器模式：子进程退出后通过 `process.resourceUsage()` 差值（`ru_maxrss`）获取峰值内存（KB）；`ru_maxrss` 是进程级累计，需用差值（评测后 - 评测前）隔离子进程
  - [x] SubTask 2.2: Windows 模式：子进程退出前通过 `tasklist /fi "PID eq <pid>" /fo csv` 或 PowerShell `Get-Process` 获取 `PeakWorkingSetSize`；若获取失败，记录日志并返回 0
  - [x] SubTask 2.3: 移除 `pidusage` 轮询逻辑与 `pidusage` 依赖导入
  - [x] SubTask 2.4: 移除 `getEstimatedBaseMemory` 伪造回退函数；内存采集失败时 `peakMemoryKB = 0`，日志记录警告
  - [x] SubTask 2.5: Docker 模式：移除失效的 `getDockerContainerMemory`；改为在 `docker run` 命令中加 `--memory-swap=${memoryLimit}m`（已有），通过容器退出码（137=OOM/MLE）判定 MLE；内存值记为 0（Docker 模式无法精确采集子进程峰值，日志标注）

- [x] Task 3: 改进 `lib/judge/executor.ts` 的硬资源限制
  - [x] SubTask 3.1: Linux 非容器模式：编写 wrapper 脚本 `lib/judge/runner.sh`，使用 `ulimit -v <memoryLimitKB>` + `ulimit -t <cpuSec>` + `ulimit -s <stackKB>` 限制子进程，然后 exec 选手程序；executor.ts 调用 `bash runner.sh <compiledPath> <args>`
  - [x] SubTask 3.2: Windows 模式：使用 `Job Object` API（通过 `ffi-napi` 或调用 PowerShell `Start-Process` + Job Object cmdlet）设置 `JOB_OBJECT_LIMIT_PROCESS_MEMORY`；若原生调用复杂，回退为现有轮询检测但保留峰值采集改进
  - [x] SubTask 3.3: 确保硬限制不影响编译器/解释器自身内存（仅作用于选手程序子进程）

- [x] Task 4: 修复 `lib/judge/judger.ts` 的重测逻辑与移除预热
  - [x] SubTask 4.1: 移除 `executeJudge` 中的预热执行块（`job.testCases.length > 0` 时的 warmup `executeCode` 调用）
  - [x] SubTask 4.2: `runOnce` 返回值增加 `exceedsTimeLimit: boolean`（从 `executeResult.exceedsTimeLimit` 透传）
  - [x] SubTask 4.3: 修复重测循环逻辑：首次运行后，若 `verdict.status === 'TLE' && verdict.exceedsTimeLimit && verdict.outputCorrect`（即程序在 extraTime 窗口内完成、输出正确但 CPU 时间超限），触发重测；若 `verdict.status === 'TLE' && !verdict.exceedsTimeLimit`（程序被强制杀死，超出 extraTime 窗口），不重测
  - [x] SubTask 4.4: 重测最多 `rejudgeTimes` 次，取首次通过（timeUsed <= timeLimit 且输出正确）的结果；全部失败则保留首次 TLE 判定

- [x] Task 5: 扩展 `lib/judge/queue.ts` 与环境变量配置
  - [x] SubTask 5.1: 在 `lib/judge/queue.ts` 顶部新增环境变量解析：`const DEFAULT_EXTRA_TIME_RATIO = parseFloat(process.env.JUDGE_EXTRA_TIME_RATIO || '0.1')`、`const DEFAULT_REJUDGE_TIMES = parseInt(process.env.JUDGE_REJUDGE_TIMES || '1', 10)`
  - [x] SubTask 5.2: `addJudgeJob` 入队时，若 `data.extraTimeRatio` 未设置则填充 `DEFAULT_EXTRA_TIME_RATIO`；若 `data.rejudgeTimes` 未设置则填充 `DEFAULT_REJUDGE_TIMES`
  - [x] SubTask 5.3: 更新 `.env.example` 与 `.env`，补充 `JUDGE_EXTRA_TIME_RATIO=0.1` 与 `JUDGE_REJUDGE_TIMES=1` 配置项及注释说明

- [x] Task 6: 更新入队逻辑透传 `extraTimeRatio`/`rejudgeTimes`
  - [x] SubTask 6.1: `lib/submission/service.ts` 的 `submitCode` 调用 `addJudgeJob` 时不传 `extraTimeRatio`/`rejudgeTimes`（由 queue.ts 注入默认值）
  - [x] SubTask 6.2: `lib/class/service.ts`、`lib/contest/service.ts` 同步处理（不传，依赖默认值）
  - [x] SubTask 6.3: 验证三处 service 文件中 `addJudgeJob` 调用不再硬编码 `rejudgeTimes: 0` / `extraTimeRatio: 0`（若有则移除，改由 queue.ts 默认值控制）

- [x] Task 7: 验证向后兼容与端到端流程
  - [x] SubTask 7.1: 确认未设置环境变量时，旧题目评测结果合理（extraTimeRatio=0.1，rejudgeTimes=1）
  - [x] SubTask 7.2: 确认 Linux 平台 CPU 时间采集正常（非负、不大于墙钟时间）
  - [x] SubTask 7.3: 确认 Windows 平台墙钟时间测量正常（与重构前行为一致）
  - [x] SubTask 7.4: 确认内存采集失败时返回 0 而非伪造值，日志有警告
  - [x] SubTask 7.5: TypeScript 编译通过（`npx tsc --noEmit`）
  - [x] SubTask 7.6: ESLint 通过（`npx eslint lib/judge --max-warnings 0`）

# Task Dependencies
- Task 1、Task 2、Task 3 可并行（均修改 executor.ts 不同部分，但存在合并冲突风险，建议 Task 1+2 合并一个 agent，Task 3 独立）
- Task 4 依赖 Task 1（需要 `exceedsTimeLimit` 字段）
- Task 5 独立（仅 queue.ts + .env）
- Task 6 依赖 Task 5（依赖 queue.ts 默认值注入）
- Task 7 依赖 Task 1-6 全部完成
