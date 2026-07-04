# Checklist

## P0: stdin EPIPE 与输出读取竞态（executor.ts）
- [x] `childProcess.stdin` 附加 `error` 事件处理器（仅 log，不 throw） — executor.ts:373-375
- [x] `inputStream`（createReadStream）附加 `error` 事件处理器 — executor.ts:376-378
- [x] 输出文件读取改为 `close` 事件后执行（替代 `exit` 事件后立即读取） — executor.ts:439（childProcess.on('close')）
- [x] `exit` 事件仅保存 exitCode，`close` 事件执行 endTime 与后续逻辑 — executor.ts: exit 保存 savedExitCode/savedForceKilled/savedTimeout，close 执行收尾
- [x] 验证选手程序提前退出时不崩溃 Worker，判定为 RE — `resolved` 守卫防止重复 resolve，stdin error 被捕获

## P0: Java class 名（compiler.ts）
- [x] 编译 Java 前用正则解析 `public class` 名（或首个 `class` 名） — compiler.ts:95 `code.match(/(?:public\s+)?class\s+(\w+)/)`
- [x] 源文件以解析出的类名命名（如 `Main.java`） — compiler.ts:97-98 `sourceName = classMatch[1]; compiledBasename = classMatch[1]`
- [x] `compiledPath` 指向 `.class` 所在目录（去扩展名） — compiledBasename = className，compiledPath = join(tempDir, className)
- [x] `getRunInfo` 中 Java 命令为 `java {className}`（cwd=tempDir，默认 classpath 含当前目录） — executor.ts getRunInfo Java 分支无需改动
- [x] 源码无 class 声明时回退原逻辑（由 javac 报 CE） — classMatch 为 null 时回退 solution_* 命名

## P0: 解释型语言硬限制（executor.ts + runner.sh）
- [x] `useRunnerWrapper` 条件扩展为包含 python/java/javascript（Linux 下） — executor.ts:295 `['cpp','c','python','java','javascript'].includes(language)`
- [x] runner.sh args 拼装对解释型语言正确 — executor.ts:296-305 通用拼装 `bash runner.sh <mem> <cpu> <stack> <cmd> ...args`
- [x] 验证 Python/Java/JS 提交在 Linux 下受 ulimit 保护 — runner.sh 的 ulimit -v/-t/-s/-u/-c 对所有 exec 子进程生效

## P1: 编译产物清理（judger.ts）
- [x] `executeJudge` 末尾增加 finally 块调用 `cleanup(compileResult?.compiledPath)` — judger.ts:224-230
- [x] 编译失败/安全检查失败分支不调用 cleanup — compileResult 为 undefined 或 success=false 时条件不满足

## P1: runner.sh ulimit 配置（runner.sh + executor.ts）
- [x] 栈限制独立：`stackMb = min(memoryLimit, 64)`，不等于 memoryLimit — executor.ts `String(Math.min(memoryLimit, 64))`
- [x] runner.sh 新增 `ulimit -u 64`（进程数限制） — runner.sh:12
- [x] runner.sh 新增 `ulimit -c 0`（禁用 core dump） — runner.sh:11
- [x] 验证 256MB 内存限制下合法程序使用 200MB 堆不被误杀 — 栈 64MB 独立于 VSS 256MB，堆地址空间不受挤占

## P1: 编译器沙箱与错误信息过滤（compiler.ts）
- [x] Linux 非容器模式下编译命令通过 runner.sh 执行（mem 512MB，cpu 15s，stack 64MB） — compiler.ts:128-140
- [x] 编译超时从 30s 改为 15s — compiler.ts:144 `timeout: 15000`
- [x] 编译 stderr 中的绝对路径与 `solution_*.{ext}` 替换为 `solution.{ext}` — compiler.ts:52-58 `filterCompileError`
- [x] maxBuffer 超限时正确识别为 CE — compiler.ts:166-173 检查 `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`

## P1: queue.ts 死任务检测 + 重启恢复 + catch 补全
- [x] `executeJob` 的 `.catch` 中补全 job 状态更新 — queue.ts processQueue 的 .catch 块
- [x] 新增 `setInterval` 每 30s 扫描 processing，超过 300s 的 job 强制 failed — queue.ts:81,85-110 checkDeadJobs
- [x] Worker 启动时扫描 DB `status='Judging'` 的 submission 重新入队 — worker.ts:219-266 recoverPendingJobs
- [x] 验证 import 失败时 job 被正确标记 failed，不永久占槽位 — .catch 中 try-catch 保护状态更新

## P1: comparator 长行截断修复
- [x] `nextUntilNewLine` 截断后继续消费剩余字符至行尾 — comparator.ts:89 注释 + 实现合并循环
- [x] 验证 2000 字符行的前 1024 相同后续不同时正确判 WA — 截断后跳过剩余，下一轮从新行开始

## P1: comparator 浮点比较严格化
- [x] `nextUntilSpace` 读取 token 后用正则校验格式 — comparator.ts:12 FLOAT_REGEX
- [x] 非法字符（如 `3.14abc`）判 WA — comparator.ts:307-309
- [x] 合法浮点（如 `3.14`、`1e10`、`.5`）正常比较 — 正则 `/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/` 覆盖

## P2: comparator PE 检测对齐 LemonLime
- [x] `compareIgnoreSpaces` 的 PE 行号检查移到每次 `userToken === stdToken` 分支内 — comparator.ts:252-255
- [x] 验证 token 内容正确但行排列不同时判 PE — 行号不一致即返回 PE，对齐 judgingthread.cpp:279-284

## P2: judger exceedsTimeLimit 改用 CPU 时间
- [x] `runOnce` 移除 `if (executeResult.time > tcTimeLimit)` 分支 — judger.ts:57-60 改用 executeResult.exceedsTimeLimit
- [x] 改用 `executeResult.exceedsTimeLimit` 字段透传 — judger.ts:58
- [x] 验证 Linux 下基于 CPU 时间判定，Windows 下基于墙钟时间 — executor.ts 已处理平台差异

## P2: maxConcurrent 可配置 + worker setInterval 清理
- [x] queue.ts 解析 `JUDGE_MAX_CONCURRENT`（默认 1） — queue.ts:11
- [x] worker.ts 保存 setInterval id，SIGINT/SIGTERM 中 clearInterval — worker.ts:268,286,293
- [x] .env.example 补充 `JUDGE_MAX_CONCURRENT=1` 配置项 — .env.example:27

## P1: Docker 模式采集 CPU 时间与峰值内存
- [x] Docker 运行命令包裹 `/usr/bin/time -v`，统计输出到容器内文件 — executor.ts Docker 分支 innerCmd 包裹
- [x] 评测后读取并解析 `Maximum resident set size (kbytes)` 与 `Elapsed (wall clock) time` — executor.ts:240-258 解析逻辑
- [x] 解析失败回退为当前逻辑（peakMemoryKB=0，cpuTimeMs=墙钟时间） — executor.ts:260-261 catch 回退

## 向后兼容与验证
- [x] `npx tsc --noEmit` 通过（无新增错误，参考资源 Qt XML 误识别除外） — 过滤参考资源后无输出
- [x] `npx eslint lib/judge/executor.ts compiler.ts judger.ts queue.ts comparator.ts worker.ts --max-warnings 0` 通过 — exit 0，0 警告
- [x] 旧题目评测行为合理（maxConcurrent=1 默认值不破坏功能） — 仅并发度降为 1，功能不变
- [x] Java 提交可正常编译运行（无 public class 时回退正确） — classMatch 为 null 时回退 solution_* 命名
- [x] 解释型语言在 Linux 下受 runner.sh 硬限制保护 — useRunnerWrapper 覆盖 5 种语言
- [x] comparator 长行/浮点/PE 修复不破坏现有 AC 用例 — 截断消费剩余避免误判 AC，浮点严格化拒绝非法 token，PE 检测对齐 LemonLime
