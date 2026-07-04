# Tasks

- [x] Task 1: 修复 executor.ts 的 P0 bug（stdin EPIPE + 输出读取竞态）
  - [x] SubTask 1.1: 给 `childProcess.stdin` 和 `inputStream` 附加 `error` 事件处理器（仅 log，不 throw），防止选手程序提前退出时 EPIPE 崩溃 Worker
  - [x] SubTask 1.2: 将 `childProcess.stdout`/`stderr` 的 `pipe(outputStream)` 改为监听 `close` 事件（所有 stdio 流关闭后触发）再读取输出文件，替代当前在 `exit` 事件后立即读取，避免 stdout 缓冲未刷盘导致输出不完整
  - [x] SubTask 1.3: 在 `exit` 事件中保存 exitCode，但 endTime 与后续逻辑在 `close` 事件中执行；若 `close` 事件已由 exit 触发则复用保存的 exitCode

- [x] Task 2: 修复 compiler.ts 的 Java class 名问题（P0）
  - [x] SubTask 2.1: 编译 Java 前用正则 `/(?:public\s+)?class\s+(\w+)/` 解析源码中的主类名（取首个匹配）
  - [x] SubTask 2.2: 以解析出的类名命名 `.java` 源文件（如 `Main.java`），写入临时文件
  - [x] SubTask 2.3: `compiledPath` 指向 `.class` 文件所在目录（去 `.class` 扩展名），`getRunInfo` 中 Java 命令改为 `java -cp {dir} {className}`
  - [x] SubTask 2.4: 若源码无 `class` 声明（语法错误），回退为原逻辑（`solution_*` 命名），由 javac 报 CE

- [x] Task 3: 解释型语言套用 runner.sh 硬限制（P0）
  - [x] SubTask 3.1: executor.ts 的 `useRunnerWrapper` 条件扩展为 `isLinux && ['cpp','c','python','java','javascript'].includes(language)`
  - [x] SubTask 3.2: runner.sh 的 args 拼装对解释型语言：`bash runner.sh <mem_mb> <cpu_sec> <stack_mb> <解释器命令> <源文件参数>`
  - [x] SubTask 3.3: 验证 `getRunInfo` 对解释型语言返回的 command/args 可被 runner.sh 正确 exec

- [x] Task 4: judger.ts 调用 cleanup 清理编译产物（P1）
  - [x] SubTask 4.1: 在 `executeJudge` 的 try-catch 末尾增加 finally 块，调用 `cleanup(compileResult?.compiledPath)`（若编译成功）
  - [x] SubTask 4.2: 验证编译失败/安全检查失败分支不调用 cleanup（无 compiledPath）

- [x] Task 5: 修正 runner.sh 的 ulimit 配置（P1）
  - [x] SubTask 5.1: 栈限制改为独立值：executor.ts 调用 runner.sh 时传入 `stackMb = min(memoryLimit, 64)`
  - [x] SubTask 5.2: runner.sh 新增 `ulimit -u 64`（进程数限制，防 fork bomb）
  - [x] SubTask 5.3: runner.sh 新增 `ulimit -c 0`（禁用 core dump）

- [x] Task 6: compiler.ts 编译沙箱与错误信息过滤（P1）
  - [x] SubTask 6.1: Linux 非容器模式下，编译命令通过 `bash runner.sh 512 15 64 <编译器命令> <args>` 执行
  - [x] SubTask 6.2: 编译超时从 30s 改为 15s
  - [x] SubTask 6.3: 对编译 stderr 做正则替换：将 `temp/judge/solution_*.{ext}` 与绝对路径替换为 `solution.{ext}`
  - [x] SubTask 6.4: 验证 maxBuffer 超限时 error.killed 被正确识别为 CE

- [x] Task 7: queue.ts 死任务检测 + 重启恢复 + catch 补全（P1）
  - [x] SubTask 7.1: `executeJob` 的 `.catch` 中补全 job 状态更新，防止 import 失败导致 job 永久占槽位
  - [x] SubTask 7.2: 新增死任务检测：`setInterval` 每 30s 扫描 `processing`，对 `startedAt` 超过 300s 的 job 强制标记 failed
  - [x] SubTask 7.3: Worker 启动时扫描 DB 中 `status='Judging'` 的 submission，重新调用 `addJudgeJob` 入队

- [x] Task 8: comparator.ts 长行截断 + 浮点严格化 + PE 检测对齐（P1/P2）
  - [x] SubTask 8.1: `nextUntilNewLine` 截断后继续消费剩余字符至行尾
  - [x] SubTask 8.2: 浮点比较的 token 用正则校验格式，不匹配判 WA
  - [x] SubTask 8.3: `compareIgnoreSpaces` 的 PE 行号检查移到每次 `userToken === stdToken` 分支内（与 LemonLime 一致）

- [x] Task 9: judger.ts exceedsTimeLimit 改用 CPU 时间（P2）
  - [x] SubTask 9.1: `runOnce` 中移除 `if (executeResult.time > tcTimeLimit)` 判定 TLE 的分支，改用 `executeResult.exceedsTimeLimit` 字段透传
  - [x] SubTask 9.2: 验证 executor.ts 的 `exceedsTimeLimit` 判定逻辑正确（Linux 用 cpuTimeMs，Windows 用墙钟时间）

- [x] Task 10: queue.ts maxConcurrent 可配置 + worker.ts setInterval 清理（P2）
  - [x] SubTask 10.1: queue.ts 解析环境变量 `JUDGE_MAX_CONCURRENT`（默认 1），传入 `new JudgeQueue(N)`
  - [x] SubTask 10.2: worker.ts 保存 `setInterval` 返回的 id，在 SIGINT/SIGTERM 处理中 `clearInterval` 后再 `process.exit`
  - [x] SubTask 10.3: .env.example 与 .env 补充 `JUDGE_MAX_CONCURRENT=1` 配置项

- [x] Task 11: Docker 模式采集 CPU 时间与峰值内存（P1）
  - [x] SubTask 11.1: Docker 运行命令包裹 `/usr/bin/time -v`，统计输出到容器内 `/tmp/time_stats.txt`
  - [x] SubTask 11.2: 评测后通过 `docker cp` 读取并解析 `Maximum resident set size (kbytes)` 与 `Elapsed (wall clock) time`
  - [x] SubTask 11.3: 解析失败回退为当前逻辑（peakMemoryKB=0，cpuTimeMs=墙钟时间）

- [x] Task 12: 验证 tsc + eslint + 向后兼容
  - [x] SubTask 12.1: `npx tsc --noEmit` 通过（无新增错误，参考资源的 Qt XML 误识别错误除外）
  - [x] SubTask 12.2: `npx eslint lib/judge/executor.ts compiler.ts judger.ts queue.ts comparator.ts worker.ts --max-warnings 0` 通过
  - [x] SubTask 12.3: 确认旧题目评测行为合理（maxConcurrent=1 默认值不破坏功能）
  - [x] SubTask 12.4: 确认 Java 提交可正常编译运行（无 public class 时回退正确）
  - [x] SubTask 12.5: 确认解释型语言在 Linux 下受 runner.sh 硬限制保护
  - [x] SubTask 12.6: 确认 comparator 长行/浮点/PE 修复不破坏现有 AC 用例

# Task Dependencies
- Task 1、Task 2、Task 3 可并行（修改 executor.ts/compiler.ts 不同部分，Task 3 依赖 Task 5 的 runner.sh 改动）
- Task 4 独立（仅 judger.ts）
- Task 5 独立（runner.sh + executor.ts 调用），Task 3 与 Task 6 依赖 Task 5
- Task 6 独立（compiler.ts），依赖 Task 5（编译也走 runner.sh）
- Task 7 独立（queue.ts + worker.ts）
- Task 8 独立（comparator.ts）
- Task 9 依赖 Task 1（executor 的 exceedsTimeLimit 已稳定）
- Task 10 独立（queue.ts + worker.ts）
- Task 11 独立（executor.ts Docker 分支）
- Task 12 依赖 Task 1-11 全部完成
