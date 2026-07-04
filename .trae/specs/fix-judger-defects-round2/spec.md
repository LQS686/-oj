# 评测机缺陷修复与优化（第二轮）Spec

## Why
上一轮 `optimize-judger-timeout-memory` 完成了时间统计与内存采集的基础改造，但全面检查发现评测机仍存在多处严重缺陷：stdin 管道 EPIPE 可致 Worker 崩溃、输出文件读取竞态可误判 WA、Java 提交因 class 文件命名不匹配必然 RE、临时文件与编译产物从未清理、runner.sh 的 ulimit 配置存在冲突且缺少 fork bomb 防护、编译器无沙箱可被恶意源码 DoS、队列无死任务检测可死锁。这些问题影响评测正确性、稳定性与安全性。

## What Changes
- 修复 stdin 管道 EPIPE 未处理导致的 Worker 崩溃（P0）
- 修复输出文件读取竞态：改用 `close` 事件替代 `exit` 事件（P0）
- 修复 Java 提交 class 文件名不匹配：解析源码 `public class` 名命名文件（P0）
- 解释型语言（Python/Java/JS）在 Linux 下套用 runner.sh 硬限制，缓解 codeAnalyzer 被绕过后的风险（P0）
- judger 在 finally 中调用 cleanup 清理编译产物（P1）
- runner.sh 修正：栈限制独立于 VSS 限制（默认 64MB）、新增 `ulimit -u 64`（防 fork bomb）、`ulimit -c 0`（禁 core dump）（P1）
- Docker 模式采集 CPU 时间与峰值内存：容器内运行 `/usr/bin/time -v` 输出到文件解析（P1）
- 编译器加沙箱：Linux 下编译也走 runner.sh（限制内存/CPU/文件大小），过滤 stderr 中的服务端绝对路径（P1）
- 队列新增死任务检测：active 超过 300s 强制标记 failed（P1）
- 队列启动时扫描 DB 中 `status='Judging'` 的提交重新入队（P1）
- 队列 executeJob 的 `.catch` 补全 job 状态更新，避免 import 失败导致死锁（P1）
- comparator 长行截断修复：截断后跳过剩余字符至行尾（P1）
- comparator 浮点比较严格化：parseFloat 后校验 token 格式，非法字符判 WA（P1）
- comparator compareIgnoreSpaces 的 PE 检测对齐 LemonLime：每次 token 相等都检查行号（P2）
- judger 的 `exceedsTimeLimit` 改用 executor 的 CPU 时间判定（Linux），消除墙钟时间版本（P2）
- maxConcurrent 默认改为 1（可通过环境变量配置），消除 CPU 争抢导致的计时不准（P2）

## Impact
- Affected specs: `optimize-judger-timeout-memory`（exceedsTimeLimit 语义调整）、`refactor-judger-traditional`（comparator/compiler 改动）
- Affected code:
  - `lib/judge/executor.ts`（stdin EPIPE、close 事件、解释型语言 runner、Docker 资源采集）
  - `lib/judge/compiler.ts`（Java class 名、编译沙箱、stderr 路径过滤）
  - `lib/judge/judger.ts`（cleanup、exceedsTimeLimit 改 CPU 时间）
  - `lib/judge/queue.ts`（死任务检测、重启恢复、catch 补全、maxConcurrent 可配）
  - `lib/judge/comparator.ts`（长行截断、浮点严格化、PE 检测对齐）
  - `lib/judge/runner.sh`（栈独立、-u、-c）
  - `lib/judge/worker.ts`（setInterval 清理）

## ADDED Requirements

### Requirement: 评测任务死任务检测与恢复
系统 SHALL 检测卡住的评测任务（active 状态超过 300s），强制标记为 failed 并释放槽位，防止队列死锁。

#### Scenario: 评测任务挂起
- **WHEN** 评测任务的 Promise 超过 300s 未 resolve
- **THEN** 任务被标记为 failed，processing 槽位释放，failed 事件触发

#### Scenario: Worker 重启
- **WHEN** Worker 进程启动
- **THEN** 扫描 DB 中 `status='Judging'` 的提交，重新入队评测

### Requirement: 编译器沙箱
系统 SHALL 在 Linux 非容器模式下对编译过程施加资源限制（内存、CPU、文件大小），并过滤编译错误信息中的服务端绝对路径。

#### Scenario: 编译恶意源码
- **WHEN** 选手提交含深层模板递归的 C++ 源码
- **THEN** 编译器被 ulimit 限制内存与 CPU，超限后编译失败，不影响服务端

#### Scenario: 编译错误信息泄露
- **WHEN** 编译失败返回 stderr
- **THEN** stderr 中的绝对路径被替换为相对路径（如 `solution.cpp`），不泄露服务端目录结构

### Requirement: 解释型语言硬限制
系统 SHALL 对 Python/Java/JavaScript 提交在 Linux 下套用 runner.sh 硬限制（内存、CPU、栈、进程数），与编译型语言一致。

#### Scenario: Python 提交 fork bomb
- **WHEN** 选手提交 `import os; [os.fork() for _ in range(1000)]`
- **THEN** runner.sh 的 `ulimit -u 64` 阻止 fork bomb，程序被 SIGKILL

## MODIFIED Requirements

### Requirement: 子进程输出采集
子进程退出后，系统 SHALL 等待所有 stdio 流关闭（`close` 事件）后再读取输出文件，确保 stdout 缓冲区完整刷盘。系统 SHALL 为 `childProcess.stdin` 和输入流附加 `error` 事件处理器，防止 EPIPE 导致 Worker 崩溃。

#### Scenario: 选手程序提前退出
- **WHEN** 选手程序在输入写入完成前退出
- **THEN** stdin 的 EPIPE 错误被捕获并 log，评测继续判定为 RE，Worker 不崩溃

#### Scenario: 选手程序输出大文件
- **WHEN** 选手程序输出超过管道缓冲区
- **THEN** 系统等待 close 事件后再读取，输出完整不误判 WA

### Requirement: Java 提交编译
系统 SHALL 在编译 Java 源码前解析 `public class` 名，以该名命名 `.java` 文件，确保 javac 产出的 `.class` 文件名与运行命令匹配。

#### Scenario: Java 提交含 public class
- **WHEN** 选手提交 `public class Main { ... }`
- **THEN** 源文件命名为 `Main.java`，编译产出 `Main.class`，运行命令 `java -cp {dir} Main`

#### Scenario: Java 提交无 public class
- **WHEN** 选手提交 `class Solution { ... }`（无 public 修饰）
- **THEN** 源文件命名为 `Solution.java`，运行命令 `java -cp {dir} Solution`

### Requirement: runner.sh 硬限制配置
runner.sh SHALL 独立设置栈限制（默认 64MB，不与 VSS 限制等同），新增 `ulimit -u 64`（进程数限制）和 `ulimit -c 0`（禁用 core dump）。VSS 限制保持为 memoryLimit。

#### Scenario: 合法程序使用大堆
- **WHEN** 选手程序在 256MB 内存限制下使用 200MB 堆
- **THEN** 栈限制 64MB 不挤占堆地址空间，程序正常运行

### Requirement: comparator 长行处理
comparator 的 `nextUntilNewLine` 在超过 maxLen 截断后 SHALL 继续消费剩余字符至行尾，避免下一轮读取从行中间开始导致逻辑行被拆分误判。

#### Scenario: 选手输出长行
- **WHEN** 选手输出一行 2000 字符，前 1024 与标准答案相同但后续不同
- **THEN** 截断后跳过剩余 976 字符，下一轮从新行开始，正确判 WA

### Requirement: comparator 浮点比较严格化
comparator 的浮点比较模式 SHALL 校验 token 格式（正则 `^[+-]?\d*\.?\d+([eE][+-]?\d+)?$`），非法字符（如 `3.14abc`）判 WA，不静默接受。

### Requirement: comparator PE 检测对齐 LemonLime
comparator 的 `compareIgnoreSpaces` 模式 SHALL 在每次 token 相等时（而非仅 EOF 时）检查行号差异，与 LemonLime 一致。

#### Scenario: 选手输出 token 正确但行排列不同
- **WHEN** 选手输出 `1 2\n3 4`，标准答案 `1 2 3 4`（同 token 不同行）
- **THEN** 判定 PE（而非继续匹配）

### Requirement: judger exceedsTimeLimit 判定
judger 的 `exceedsTimeLimit` SHALL 基于 executor 返回的 CPU 时间（Linux）或墙钟时间（Windows）判定，直接使用 `executeResult.exceedsTimeLimit` 字段，消除 judger 内部的墙钟时间版本。

### Requirement: 队列并发度可配置
队列的 `maxConcurrent` SHALL 通过环境变量 `JUDGE_MAX_CONCURRENT` 配置，默认 1（消除 CPU 争抢导致的计时不准）。

## REMOVED Requirements

### Requirement: judger 内部墙钟时间 exceedsTimeLimit 判定
**Reason**: 与 executor 的 CPU 时间版本重复，且 Linux 下墙钟含 I/O 等待与 LemonLime 语义不一致。executor 已计算基于 CPU 时间的 `exceedsTimeLimit`，judger 直接使用即可。
**Migration**: judger 的 `runOnce` 中移除 `if (executeResult.time > tcTimeLimit)` 判定，改用 `executeResult.exceedsTimeLimit`。

### Requirement: maxConcurrent 硬编码为 3
**Reason**: CPU 密集型评测下 3 并发争抢 CPU 导致墙钟时间膨胀，计时不准。LemonLime 默认 1。
**Migration**: 改为环境变量 `JUDGE_MAX_CONCURRENT`，默认 1，部署方可按 CPU 核心数调整。
