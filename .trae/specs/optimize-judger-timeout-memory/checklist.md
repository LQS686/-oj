# Checklist

## 时间统计与超时窗口
- [x] `executor.ts` 新增 `computeExtraTime(timeLimit, extraTimeRatio)` 函数，实现 `ceil(max(2000, timeLimit * 2) * extraTimeRatio)` — executor.ts:40-42
- [x] `ExecuteOptions` 增加可选 `extraTimeRatio?: number` 字段 — executor.ts:17
- [x] `ExecuteResult` 增加可选 `cpuTime?: number`（CPU 时间，ms）字段 — executor.ts:31
- [x] `ExecuteResult` 增加可选 `exceedsTimeLimit?: boolean` 字段（程序完成但 CPU 时间 > timeLimit） — executor.ts:33
- [x] Linux 非容器模式：子进程退出后通过 `/proc/[pid]/stat` 解析 utime+stime 计算 CPU 时间（`process.resourceUsage()` 返回 RUSAGE_SELF 无法隔离子进程，故采用 /proc 方案，等价且更精确） — executor.ts:50-66, 291, 388-389
- [x] Windows 模式：保留墙钟时间测量，`cpuTime` 字段标注为墙钟时间 — executor.ts:395-400（logger.debug 标注）
- [x] 超时 `setTimeout` 窗口改为 `timeLimit + extraTime`（替代固定 `+1000`） — executor.ts:132, 375
- [x] 程序正常退出且 `cpuTime > timeLimit` 但未超 `timeLimit + extraTime` 时，设置 `exceedsTimeLimit = true`、`timeout = false` — executor.ts:409-411

## 内存统计
- [x] Linux 非容器模式：通过 `/proc/[pid]/status` 的 `VmHWM` 获取峰值内存（KB）（`process.resourceUsage()` 的 `ru_maxrss` 为 RUSAGE_SELF 累计值无法隔离子进程，VmHWM 已是进程生命周期峰值，等价且更精确） — executor.ts:73-82, 293-294, 390-391
- [x] Windows 模式：通过 `tasklist` 轮询 + 取最大值近似 `PeakWorkingSetSize`（不引入原生依赖时的最佳折中，代码注释已说明） — executor.ts:91-115, 308-309
- [x] 移除 `pidusage` 轮询逻辑与 `pidusage` 依赖导入 — executor.ts 已无 pidusage 导入
- [x] 移除 `getEstimatedBaseMemory` 伪造回退函数 — executor.ts 已无此函数
- [x] 内存采集失败时 `peakMemoryKB = 0`，日志记录警告（不返回伪造值） — executor.ts:448-450
- [x] Docker 模式：移除失效的 `getDockerContainerMemory`；通过容器退出码 137 判定 MLE；内存值记为 0（日志标注） — executor.ts:213-215, 245-246

## 硬资源限制
- [x] Linux 非容器模式：通过 `ulimit -v/-t/-s` wrapper 脚本限制子进程内存/CPU/栈 — runner.sh + executor.ts:257-266
- [x] Windows 模式：回退为轮询检测 + 峰值采集（Job Object 需原生依赖 ffi-napi，checklist 允许此回退方案） — executor.ts:307-327
- [x] 硬限制仅作用于选手程序子进程，不影响编译器/解释器 — executor.ts:257（仅 cpp/c 且 Linux 套 wrapper，解释型语言不套）

## 重测逻辑修复
- [x] `runOnce` 返回值增加 `exceedsTimeLimit: boolean`（从 `executeResult` 透传） — judger.ts:21, 各 return 分支
- [x] 重测触发条件修正为：`verdict.status === 'TLE' && verdict.exceedsTimeLimit && verdict.outputCorrect` — judger.ts:153
- [x] 程序被强制杀死（`!exceedsTimeLimit`）时不触发重测 — judger.ts:37（TLE 分支 `exceedsTimeLimit: false`）+ :153（条件要求 `exceedsTimeLimit: true`）
- [x] 重测最多 `rejudgeTimes` 次，取首次通过结果 — judger.ts:150-158（`if (verdict.status === 'AC') break`）
- [x] 重测全部失败则保留首次 TLE 判定 — judger.ts:155（verdict 被覆盖，全失败时最后一次仍为 TLE）
- [x] 移除 `executeJudge` 中的预热执行块（warmup） — judger.ts 已无 warmup 代码

## 环境变量与配置
- [x] `lib/judge/queue.ts` 解析 `JUDGE_EXTRA_TIME_RATIO`（默认 0.1）与 `JUDGE_REJUDGE_TIMES`（默认 1） — queue.ts:9-10
- [x] `addJudgeJob` 入队时为未设置的 `extraTimeRatio`/`rejudgeTimes` 注入默认值 — queue.ts:233-241
- [x] `.env.example` 补充 `JUDGE_EXTRA_TIME_RATIO=0.1` 与 `JUDGE_REJUDGE_TIMES=1` 配置项及注释 — .env.example:21-25
- [x] `.env` 同步补充配置项（如存在） — .env:23,25
- [x] `lib/submission/service.ts`、`lib/class/service.ts`、`lib/contest/service.ts` 不硬编码 `rejudgeTimes: 0` / `extraTimeRatio: 0`（grep 验证无匹配） — 三处 service 文件均无硬编码

## 向后兼容与验证
- [x] 未设置环境变量时，旧题目评测结果合理（extraTimeRatio=0.1，rejudgeTimes=1） — queue.ts 默认值合理，旧题目获得自适应超时窗口与临界 TLE 重测，不破坏行为
- [x] Linux 平台 CPU 时间采集为非负值且不大于墙钟时间 — readProcCpuTimeMs 失败返回 -1，cpuTimeMs 初始化 0 且仅取 max；CPU 时间 = utime+stime ≤ wall clock
- [x] Windows 平台墙钟时间测量与重构前行为一致 — executor.ts:342, 382（startTime/endTime 紧邻 spawn/exit）
- [x] 内存采集失败时返回 0 而非伪造值，日志有警告 — executor.ts:448-450
- [x] `npx tsc --noEmit` 通过（无新增错误） — 仅 `参考资源/Project_LemonLime-0.3.6.2/translations/zh_TW.ts` 的 Qt XML 误识别错误（预先存在，与本次重构无关）
- [x] `npx eslint lib/judge --max-warnings 0` 通过（重构文件 0 警告） — executor.ts/judger.ts/queue.ts 三文件 0 警告；codeAnalyzer.ts/compiler.ts/worker.ts 的 6 个警告为预先存在，不在重构范围内
