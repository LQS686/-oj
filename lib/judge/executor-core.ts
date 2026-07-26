import { spawn, spawnSync } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import * as crypto from 'crypto'
import { logger } from '@/lib/logger'
import type { ExecuteOptions, ExecuteResult } from './executor-types'
import { computeExtraTime, readMemFileKB, readTimeFileMs } from './process-stats'
import {
  assertDockerJudgeEnabled,
  getRunInfo,
  getDockerImage,
  ensureDockerImage,
  getDockerRunCommand,
} from './docker'
import { ensureWinRunnerExe } from './win-runner-ensure'

const USE_DOCKER = process.env.USE_DOCKER === 'true' || false

// VULN-04 修复：Windows 本地评测无沙箱隔离，仅允许在显式确认的开发环境使用。
// 生产环境必须启用 USE_DOCKER=true。模块加载时一次性告警，避免每次评测刷日志。
if (!USE_DOCKER && process.platform === 'win32') {
  if (process.env.ALLOW_LOCAL_JUDGE_ON_WINDOWS !== '1') {
    throw new Error('Windows 本地评测需要在 .env 中设置 ALLOW_LOCAL_JUDGE_ON_WINDOWS=1 以显式确认风险。生产环境请设置 USE_DOCKER=true')
  }
  logger.warn('⚠️ [安全] Windows 本地进程评测已显式确认 (ALLOW_LOCAL_JUDGE_ON_WINDOWS=1)，无 Docker 沙箱隔离。生产环境必须设置 USE_DOCKER=true。')
}

export async function executeCode(options: ExecuteOptions): Promise<ExecuteResult> {
  // 安全校验：真正执行评测时才拦截，避免构建阶段误触发
  assertDockerJudgeEnabled()

  const {
    language,
    input,
    timeLimit,
    memoryLimit,
    compiledPath,
    extraTimeRatio = 0.1,
  } = options

  if (!compiledPath) {
    throw new Error('缺少编译路径')
  }

  const extraTime = computeExtraTime(timeLimit, extraTimeRatio)
  // 墙钟超时（hard timeout）：参考 HOJ/Hydro 的 clockLimit = 3 × cpuLimit
  // 1. timeLimit + extraTime 作为 CPU 时间窗口（用于精确判定 CPU TLE）
  // 2. timeLimit * 3 作为墙钟窗口（用于强制杀死 sleep 型死循环、IO 阻塞等）
  //    比例 3x 是 HOJ SandboxRun.java:353 和 Hydro sandbox.ts:104 的标准配置
  // 取两者最大值，确保：
  //   - CPU 满载死循环（while(1);）：在 cpuLimit 内被杀 → TLE
  //   - Sleep 型死循环（while(1) sleep(1);）：在 wallClockLimit 内被杀 → TLE
  //   - 正常 IO 阻塞程序：在 wallClockLimit 内完成，CPU 时间 < timeLimit → AC/WA
  const cpuTimeLimitMs = timeLimit + extraTime
  const wallClockLimitMs = Math.max(cpuTimeLimitMs, timeLimit * 3)
  const hardTimeoutMs = wallClockLimitMs

  const tempDir = join(process.cwd(), 'temp', 'judge')
  const timestamp = Date.now()
  const randomId = crypto.randomBytes(8).toString('hex')
  const inputPath = join(tempDir, `input_${timestamp}_${randomId}.txt`)
  const outputPath = join(tempDir, `output_${timestamp}_${randomId}.txt`)
  const errorPath = join(tempDir, `error_${timestamp}_${randomId}.txt`)

  try {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    }

    await writeFile(inputPath, input, 'utf-8')

    // 注意：startTime / endTime 放在 spawn/exit 紧邻位置，
    // 仅测量"进程实际运行"的时长，排除输入写出、流管道搭建、
    // 子进程创建（spawn overhead）以及输出读盘的 I/O 时间。
    // 这样可以避免首测点因冷启动被多算几百毫秒。
    let output = ''
    let error = ''
    let exitCode = 0
    let timeout = false
    let runtimeError = false
    let memoryExceeded = false
    let cannotStart = false
    let peakMemoryKB = 0
    let cpuTimeMs = 0
    let exceedsTimeLimit = false
    let startTime = 0
    let endTime = 0

    if (USE_DOCKER) {
      const containerId = `judge_${timestamp}_${randomId}`
      const baseImage = getDockerImage(language)
      const statsPath = join(tempDir, `stats_${timestamp}_${randomId}.txt`)

      // 首次评测前确保镜像已拉取，避免 docker run 隐式拉取被 hardTimeoutMs 杀死
      await ensureDockerImage(baseImage)

      // 内层命令：选手程序 stdout+stderr → output 文件
      const innerCmd = `cd /app/temp && ${getDockerRunCommand(language, compiledPath, inputPath)} > output_${timestamp}_${randomId}.txt 2>&1`
      // /usr/bin/time -v 包裹内层命令，统计信息重定向到独立 stats 文件
      // 注：/usr/bin/time 在部分基础镜像（如 ubuntu:22.04、openjdk:17 基于 oraclelinux）未安装，
      // 此时直接执行内层命令，避免选手输出文件不被写入而误判 WA
      const escapedInner = innerCmd.replace(/'/g, "'\\''")
      const wrappedCmd = `if command -v /usr/bin/time >/dev/null 2>&1; then /usr/bin/time -v sh -c '${escapedInner}' 2> /tmp/time_stats.txt; else sh -c '${escapedInner}'; fi; exit $?`

      // 移除 --rm，改为手动管理，以便在 exit 后 docker cp 读取 stats 文件
      // Sanitizer 运行时选项（与 runner.sh 保持一致，仅对启用 sanitizer 的二进制生效）：
      //   - halt_on_error=1 + abort_on_error=1：第一个错误立即 abort() → 退出码 134 → RE
      //   - detect_leaks=0：禁用 leak detection（OJ 不关心泄漏，开销大）
      //   - print_stacktrace=0：避免 stderr 污染选手输出文件
      //   - allocator_may_return_null=1：malloc 失败返回 NULL 而非 crash（容错）
      const sanitizerEnv = [
        '-e', 'ASAN_OPTIONS=halt_on_error=1:abort_on_error=1:detect_leaks=0:print_stacktrace=0:allocator_may_return_null=1',
        '-e', 'UBSAN_OPTIONS=halt_on_error=1:abort_on_error=1:print_stacktrace=0',
      ]
      const dockerRunCommand = [
        'run', '--name', containerId,
        '--memory', `${memoryLimit}m`,
        '--memory-swap', `${memoryLimit * 2}m`,
        '--cpus', '1',
        '--network', 'none',
        '--security-opt', 'no-new-privileges',
        '--cap-drop', 'ALL',
        '--read-only',
        '--tmpfs', '/tmp',
        '--tmpfs', '/app/temp',
        '--user', 'nobody',
        '--pids-limit', '100',
        '--ulimit', 'nofile=1024:1024',
        ...sanitizerEnv,
        baseImage,
        'bash', '-c',
        wrappedCmd
      ]

      logger.debug(`执行Docker命令`, { command: dockerRunCommand.join(' ') })

      const dockerProcess = spawn('docker', dockerRunCommand, {
        timeout: hardTimeoutMs,
        stdio: 'inherit'
      })

      // 仅在进程已 spawn、即将被等待时计时
      startTime = Date.now()

      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => {
          logger.debug(`Docker执行超时，强制终止容器`)
          timeout = true
          spawn('docker', ['rm', '-f', containerId], { detached: true, stdio: 'ignore' })
          dockerProcess.kill()
          endTime = Date.now()
          resolve()
        }, hardTimeoutMs)

        dockerProcess.on('exit', (code) => {
          clearTimeout(timeoutId)
          endTime = Date.now()
          exitCode = code || 0
          // 状态判定优先级：TLE > MLE > RE（参考 HOJ DefaultJudge.java:54-81）
          // timeout 标志由 setTimeout 设置，表示墙钟超时
          if (timeout) {
            // 已由墙钟超时定时器标记，保持 timeout = true（最终判 TLE）
            // 不再覆盖为 MLE/RE，避免 sleep 型死循环被误判
          } else if (code === 137) {
            // 137 = SIGKILL，通常是 Docker OOM Killer 触发（容器内存超 memoryLimit）
            // 参考 HOJ SandboxRun.java:140 与 Hydro signals.ts:9
            memoryExceeded = true
          } else if (code === 124 || code === 143) {
            // 124 = GNU timeout 命令的默认 TLE 退出码
            // 143 = SIGTERM（128+15），docker rm -f 默认信号
            timeout = true
          } else if (code !== 0) {
            // 其它非零退出码：runtime error（段错误/浮点异常/abort 等）
            runtimeError = true
          }
          resolve()
        })

        dockerProcess.on('error', (err) => {
          clearTimeout(timeoutId)
          endTime = Date.now()
          runtimeError = true
          cannotStart = true
          error = err.message
          resolve()
        })
      })

      // 评测后从容器中读取 /usr/bin/time 的统计文件
      // 容器尚未被删除（已移除 --rm），可 docker cp
      try {
        // P2 安全修复：改为 spawnSync 数组形式，避免命令拼接注入风险
        const cpResult = spawnSync('docker', ['cp', `${containerId}:/tmp/time_stats.txt`, statsPath], { timeout: 5000 })
        if (cpResult.status !== 0) {
          throw new Error(`docker cp 退出码: ${cpResult.status}`)
        }
        const statsContent = readFileSync(statsPath, 'utf-8')
        // 解析 Maximum resident set size (kbytes): NNN
        const memMatch = statsContent.match(/Maximum resident set size \(kbytes\): (\d+)/)
        if (memMatch) peakMemoryKB = parseInt(memMatch[1], 10)
        // 解析 CPU 时间 = User time + System time（秒 → 毫秒）
        // 注：Elapsed (wall clock) time 是墙钟时间，包含 I/O 等待，不应作为 cpuTime
        const userMatch = statsContent.match(/User time \(seconds\): ([\d.]+)/)
        const sysMatch = statsContent.match(/System time \(seconds\): ([\d.]+)/)
        if (userMatch && sysMatch) {
          cpuTimeMs = Math.round((parseFloat(userMatch[1]) + parseFloat(sysMatch[1])) * 1000)
        } else {
          // 回退：解析 Elapsed (wall clock) time 作为 cpuTimeMs（不精确但优于 0）
          const timeMatch = statsContent.match(/Elapsed \(wall clock\) time.*?: (.+)/)
          if (timeMatch) {
            const t = timeMatch[1].trim()
            // 格式如 0:01.23 或 1:23.45
            const parts = t.split(':')
            if (parts.length === 2) {
              const sec = parseFloat(parts[0]) * 60 + parseFloat(parts[1])
              cpuTimeMs = Math.round(sec * 1000)
            }
          }
        }
      } catch (err) {
        logger.debug('Docker 资源统计解析失败，回退为默认值', { error: err instanceof Error ? err.message : String(err) })
      } finally {
        // 清理容器
        spawn('docker', ['rm', '-f', containerId], { detached: true, stdio: 'ignore' })
        // 清理 stats 文件
        try {
          if (existsSync(statsPath)) await unlink(statsPath)
        } catch {
          // 忽略清理错误
        }
      }

      try {
        const fs = await import('fs/promises')
        const outputFile = join(tempDir, `output_${timestamp}_${randomId}.txt`)
        if (existsSync(outputFile)) {
          output = await fs.readFile(outputFile, 'utf-8')
        }
      } catch (err) {
        logger.error(`读取Docker输出失败`, err)
      }

      if (peakMemoryKB === 0) {
        logger.debug(`Docker模式: 资源统计未采集到（/usr/bin/time 可能未安装或容器已被超时清理）`)
      }

      // Docker 模式 CPU TLE 二次判定（参考 HOJ DefaultJudge.java:57）
      // 沙箱返回正常退出（exitCode=0），但 CPU 时间超过 timeLimit → 判 TLE
      // 此判定在 /usr/bin/time 统计解析完成后进行，确保使用精确的 CPU 时间
      if (!timeout && !memoryExceeded && !runtimeError && cpuTimeMs > timeLimit) {
        logger.debug(`Docker模式 CPU TLE: cpuTime=${cpuTimeMs}ms > timeLimit=${timeLimit}ms`)
        timeout = true
        if (cpuTimeMs > cpuTimeLimitMs) {
          // 超过 cpuTimeLimitMs（含 extraTime 窗口）→ 严格 TLE，不重测
          exceedsTimeLimit = false
        } else {
          // 在 timeLimit ~ cpuTimeLimitMs 之间 → 临界 TLE，可由 judger 触发重测
          exceedsTimeLimit = true
        }
      }
    } else {
      const runInfo = getRunInfo(language, compiledPath)
      const isLinux = process.platform === 'linux'
      const isWindows = process.platform === 'win32'
      const memFilePath = join(tempDir, `mem_${timestamp}_${randomId}.txt`)
      const timeFilePath = join(tempDir, `time_${timestamp}_${randomId}.txt`)
      // Windows：优先原生 win-runner.exe（GetProcessTimes + GetProcessMemoryInfo，对齐 LemonLime）
      // 避免把 PowerShell 启动开销算进评测时间（此前会出现 ~500ms 虚高）
      const useWinRunner = isWindows && ['cpp', 'c', 'python'].includes(language)

      // Linux 所有支持语言使用 runner.sh 设置硬资源限制
      // （RLIMIT_AS / RLIMIT_CPU / RLIMIT_STACK，参考 LemonLime watcher_unix.cpp）
      let command = runInfo.command
      let args = runInfo.args
      const spawnEnv: NodeJS.ProcessEnv = { ...process.env }
      const useRunnerWrapper = isLinux && ['cpp', 'c', 'python'].includes(language)
      if (useRunnerWrapper) {
        // ESM 环境下 __dirname 不可靠，使用 process.cwd() 构建路径
        const runnerPath = join(process.cwd(), 'lib', 'judge', 'runner.sh')
        // P1 修复：ulimit 参数上限保护，防止恶意 Problem.memoryLimit 撑爆系统
        //   memMb ≤ 4096（4GB），cpuSec ≤ 300（5min），stackMb ≤ 64
        const safeMem = Math.min(Math.max(16, Number(memoryLimit) || 256), 4096)
        const safeCpu = Math.min(Math.max(1, Math.ceil(Number(hardTimeoutMs) / 1000) || 10), 300)
        const safeStack = Math.min(Math.max(1, Number(memoryLimit) || 16), 64)
        const memMb = String(safeMem)
        // CPU 秒数向上取整，确保不与 extraTime 窗口冲突
        const cpuSec = String(safeCpu)
        const stackMb = String(safeStack)
        // P1 修复：command 白名单（防止 runInfo.command 来自恶意构造）
        const commandPath = typeof runInfo.command === 'string' ? runInfo.command.split(/[\n\r;|&`$()<>]/)[0] : ''
        if (!commandPath || !/^[a-zA-Z0-9_./\-]+$/.test(commandPath)) {
          throw new Error(`非法的 command 路径: ${runInfo.command}`)
        }
        command = 'bash'
        args = [runnerPath, memMb, cpuSec, stackMb, commandPath, ...runInfo.args]
        // 供 runner.sh 内 /usr/bin/time 写出峰值 RSS（KB）与 CPU ms
        spawnEnv.DSOJ_MEM_FILE = memFilePath
        spawnEnv.DSOJ_TIME_FILE = timeFilePath
      } else if (useWinRunner) {
        let executablePath =
          typeof runInfo.command === 'string' ? runInfo.command : ''
        let executableArgs = [...(runInfo.args || [])]
        if (language === 'cpp' || language === 'c') {
          executablePath = compiledPath
          executableArgs = []
        } else if (language === 'python') {
          executablePath = runInfo.command
          executableArgs = [compiledPath]
        }
        if (!executablePath) {
          throw new Error(`非法的 command 路径: ${runInfo.command}`)
        }

        const winExe = ensureWinRunnerExe()
        if (winExe) {
          command = winExe
          args = [
            '--exe', executablePath,
            '--cwd', tempDir,
            '--in', inputPath,
            '--out', outputPath,
            '--err', errorPath,
            '--mem', memFilePath,
            '--time', timeFilePath,
            '--args', JSON.stringify(executableArgs),
            '--memory-limit-mb', String(Math.max(1, Number(memoryLimit) || 256)),
          ]
        } else {
          // 回退 PowerShell（仍写出 mem/time，但启动更慢）
          const runnerPath = join(process.cwd(), 'lib', 'judge', 'win-runner.ps1')
          command = 'powershell.exe'
          args = [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            runnerPath,
            '-Executable',
            executablePath,
            '-ArgumentList',
            JSON.stringify(executableArgs),
            '-WorkingDirectory',
            tempDir,
            '-InputFile',
            inputPath,
            '-OutputFile',
            outputPath,
            '-ErrorFile',
            errorPath,
            '-MemFile',
            memFilePath,
            '-TimeFile',
            timeFilePath,
          ]
        }
      }

      logger.debug(`执行命令`, { command, args, extraTime, hardTimeoutMs, useWinRunner })

      const childProcess = spawn(command, args, {
        cwd: tempDir,
        stdio: useWinRunner ? 'ignore' : ['pipe', 'pipe', 'pipe'],
        detached: false,
        env: spawnEnv,
        windowsHide: true,
      })

      const maxMemoryBytes = memoryLimit * 1024 * 1024
      // timeoutId 提升至外层，便于墙超时杀进程后清除
      let timeoutId: NodeJS.Timeout | null = null
      let processKilled = false
      let forceKilled = false

      // 内存/CPU 峰值由 runner.sh（Linux：ulimit 硬限 + GNU time / 选手 PID 采样）
      // 或 win-runner（PeakWorkingSet）写出文件；勿轮询 bash/PowerShell 包装进程 PID。

      if (!useWinRunner) {
        const { createReadStream, createWriteStream } = await import('fs')
        const inputStream = createReadStream(inputPath)

        // 给 stdin 与输入流附加 error 处理器，防止选手程序提前退出时 EPIPE crash Worker
        childProcess.stdin!.on('error', (err) => {
          logger.debug('stdin 写入错误（选手程序可能已退出）', { error: err.message })
        })
        inputStream.on('error', (err) => {
          logger.debug('输入流读取错误', { error: err.message })
        })

        inputStream.pipe(childProcess.stdin!)

        const outputStream = createWriteStream(outputPath)
        const errorStream = createWriteStream(errorPath)

        childProcess.stdout!.pipe(outputStream)
        childProcess.stderr!.pipe(errorStream)
      }

      // 在流管道搭建完毕、进程即将被等待退出时开始计时
      startTime = Date.now()

      await new Promise<void>((resolve) => {
        let resolved = false
        let exited = false
        let savedExitCode: number | null = 0
        let savedForceKilled = false
        let savedTimeout = false
        let fallbackTimer: NodeJS.Timeout | null = null

        timeoutId = setTimeout(() => {
          logger.debug(`执行超时，强制终止进程`, { hardTimeoutMs })
          timeout = true
          forceKilled = true

          if (!processKilled) {
            processKilled = true

            childProcess.kill('SIGINT')

            setTimeout(() => {
              childProcess.kill('SIGTERM')
            }, 100)

            setTimeout(() => {
              childProcess.kill('SIGKILL')
            }, 200)

            if (isWindows) {
              try {
                if (childProcess.pid && childProcess.pid > 0) {
                  spawnSync('taskkill', ['/F', '/T', '/PID', String(childProcess.pid)], { stdio: 'ignore' })
                }
              } catch {
                // 忽略：进程可能已退出
              }
            }
          }

          // 不在此处 resolve，等待 close 事件统一收尾
          // （close 在所有 stdio 流关闭后触发，确保输出已完整刷盘）
        }, hardTimeoutMs)

        // 统一收尾函数：close/error/墙超时收尾共用
        const finishResolve = () => {
          if (resolved) return
          resolved = true
          if (timeoutId) clearTimeout(timeoutId)
          if (fallbackTimer) clearTimeout(fallbackTimer)
          processKilled = true
          // close 事件触发时所有 stdio 流已关闭，输出已完整刷盘
          endTime = Date.now()
          exitCode = savedExitCode || 0

          // wrapper 写出的峰值内存 / CPU 时间（Linux GNU time·选手 PID 采样 / Windows GetProcess*）
          const fileMem = readMemFileKB(memFilePath)
          if (fileMem > 0 && fileMem > peakMemoryKB) peakMemoryKB = fileMem
          const fileCpu = readTimeFileMs(timeFilePath)
          if (fileCpu >= 0) {
            if (fileCpu > cpuTimeMs) cpuTimeMs = fileCpu
          }

          // 退出后若峰值已超限，补判 MLE
          if (!memoryExceeded && peakMemoryKB > 0 && peakMemoryKB * 1024 > maxMemoryBytes) {
            memoryExceeded = true
            logger.debug(`退出后检测内存超限`, {
              current: Math.round(peakMemoryKB / 1024),
              limit: memoryLimit,
            })
          }

          // 仅在完全采不到选手时间时，才回退墙钟（wrapper 自身开销会被算进去）
          if (cpuTimeMs <= 0 && readTimeFileMs(timeFilePath) < 0) {
            cpuTimeMs = Math.max(0, endTime - startTime)
            logger.debug(`CPU 时间回退为墙钟`, { platform: process.platform, cpuTimeMs })
          }

          // 信号分类（HOJ SandboxRun 信号表）：
          //   152 = SIGXCPU → CPU TLE（ulimit -t）
          //   137 = SIGKILL → 墙钟强杀 / ulimit -v；用峰值、CPU、墙钟区分 MLE vs TLE
          const wallMs = Math.max(0, endTime - startTime)
          if (savedExitCode === 152) {
            savedTimeout = true
          } else if (savedExitCode === 137) {
            if (savedForceKilled || savedTimeout) {
              savedTimeout = true
            } else if (peakMemoryKB > 0 && peakMemoryKB * 1024 >= maxMemoryBytes) {
              memoryExceeded = true
            } else if (cpuTimeMs > timeLimit || wallMs >= hardTimeoutMs * 0.95) {
              savedTimeout = true
            } else if (
              useRunnerWrapper &&
              peakMemoryKB === 0 &&
              wallMs < hardTimeoutMs * 0.5
            ) {
              // 早死且无峰值文件：更像 RLIMIT_AS（ulimit -v）
              memoryExceeded = true
            } else {
              savedTimeout = true
            }
          }

          // 必须回写 timeout：judger 只看 executeResult.timeout
          if (savedTimeout) {
            timeout = true
            memoryExceeded = false
          }

          // 状态判定优先级：TLE > MLE > RE
          if (!savedTimeout && !memoryExceeded && savedExitCode !== 0) {
            runtimeError = true
          }

          if (!savedForceKilled && !savedTimeout && !memoryExceeded && cpuTimeMs > timeLimit) {
            exceedsTimeLimit = true
          }

          if (!savedTimeout && !memoryExceeded && !runtimeError && cpuTimeMs > cpuTimeLimitMs) {
            savedTimeout = true
            timeout = true
          }

          resolve()
        }

        childProcess.on('exit', (code) => {
          if (exited) return
          exited = true
          // 仅保存状态，不执行 endTime/resolve，等待 close 事件
          // （close 在所有 stdio 流关闭后触发，确保 stdout 已刷盘）
          savedExitCode = code
          savedForceKilled = forceKilled
          savedTimeout = timeout
          // P1-5: exit 比 close 更早触发；启动兜底定时器，
          // 若 close 因孙进程继承 stdout fd 而永不触发，则在 2s 后强制 resolve
          fallbackTimer = setTimeout(() => {
            if (!resolved) {
              logger.debug(`close 事件超时未触发，强制 resolve（孙进程可能持有 fd）`)
              finishResolve()
            }
          }, 2000)
        })

        childProcess.on('close', () => {
          finishResolve()
        })

        childProcess.on('error', (err) => {
          if (resolved) return
          resolved = true
          if (timeoutId) clearTimeout(timeoutId)
          if (fallbackTimer) clearTimeout(fallbackTimer)
          processKilled = true
          endTime = Date.now()
          runtimeError = true
          cannotStart = true
          error = err.message
          resolve()
        })
      })

      try {
        const fs = await import('fs/promises')
        if (existsSync(outputPath)) {
          output = await fs.readFile(outputPath, 'utf-8')
        }
        if (existsSync(errorPath)) {
          error = await fs.readFile(errorPath, 'utf-8')
        }
        // 再次合并 mem/time 文件（close 后文件应已刷盘）
        const fileMem = readMemFileKB(memFilePath)
        if (fileMem > 0 && fileMem > peakMemoryKB) peakMemoryKB = fileMem
        const fileCpu = readTimeFileMs(timeFilePath)
        if (fileCpu >= 0 && fileCpu > cpuTimeMs) cpuTimeMs = fileCpu
        if (existsSync(memFilePath)) {
          await unlink(memFilePath).catch(() => {})
        }
        if (existsSync(timeFilePath)) {
          await unlink(timeFilePath).catch(() => {})
        }
      } catch (err) {
        logger.error(`读取输出失败`, err)
      }
    }

    if (!startTime) startTime = Date.now()
    if (!endTime) endTime = Date.now()
    // 对外展示时间：优先选手进程 CPU 时间（与洛谷/HOJ/LemonLime 一致）；无 CPU 采样时用墙钟
    const preciseTime = Math.max(1, Math.round(cpuTimeMs > 0 ? cpuTimeMs : endTime - startTime))
    if (cpuTimeMs <= 0) cpuTimeMs = preciseTime

    // 内存采集失败时返回 0（不再使用伪造值），并记录警告
    if (peakMemoryKB === 0 && !USE_DOCKER) {
      logger.warn(`内存采集失败，记为 0`, {
        language,
        platform: process.platform,
        useWinRunner: process.platform === 'win32' && ['cpp', 'c', 'python'].includes(language),
      })
    }

    try {
      if (existsSync(inputPath)) await unlink(inputPath)
      if (existsSync(outputPath)) await unlink(outputPath)
      if (existsSync(errorPath)) await unlink(errorPath)
    } catch (cleanupError) {
      logger.warn(`清理临时文件失败`, { error: cleanupError })
    }

    let detailedError = undefined

    // 推断 TLE 触发类型：墙钟超时 vs CPU 超时
    // - 墙钟超时：墙钟时间 > wallClockLimitMs（或被墙钟定时器杀死），CPU 时间通常远小于墙钟
    // - CPU 超时：CPU 时间 > timeLimit，墙钟时间通常与 CPU 时间接近
    let timeoutType: 'wall-clock' | 'cpu' | undefined
    if (timeout) {
      const wallTimeMs = endTime - startTime
      // 判定逻辑：
      //   - 若 cpuTimeMs > timeLimit → CPU TLE（CPU 满载死循环或算法效率不足）
      //   - 否则 → 墙钟 TLE（sleep 型死循环、IO 阻塞等，CPU 时间正常但墙钟超限）
      // 参考 HOJ/Hydro：两者最终状态都是 TLE，但 timeoutType 用于错误消息细化
      if (cpuTimeMs > timeLimit) {
        timeoutType = 'cpu'
      } else {
        timeoutType = 'wall-clock'
      }
      void wallTimeMs // 仅用于调试，避免未使用警告
    }

    if (timeout) {
      const wallTimeMs = Math.max(0, endTime - startTime)
      if (timeoutType === 'cpu') {
        detailedError = `Time Limit Exceeded (CPU 时间 ${cpuTimeMs}ms > 限制 ${timeLimit}ms)`
      } else {
        detailedError = `Time Limit Exceeded (墙钟时间 ${wallTimeMs}ms > 限制 ${wallClockLimitMs}ms，可能是 sleep 型死循环或 IO 阻塞)`
      }
    } else if (memoryExceeded) {
      detailedError = `Memory Limit Exceeded (>${memoryLimit}MB)`
    } else if (runtimeError) {
      // 参考 HOJ JudgeStrategy：退出码 ≥ 128 时映射到 Unix 信号，
      // 让 RE 错误更可诊断（区分段错误/浮点异常/abort 等）。
      const signalReason = formatRuntimeErrorByExitCode(exitCode)
      const errLines = error.split('\n')
      const lastLine = errLines[errLines.length - 1] || errLines[errLines.length - 2] || ''
      const reasonText = signalReason ? `${signalReason}` : 'Runtime Error'
      detailedError = lastLine ? `${reasonText}: ${lastLine}` : reasonText
      if (error) detailedError += `\n${error.substring(0, 500)}`
    }

    return {
      output,
      error: detailedError,
      time: preciseTime,
      memory: peakMemoryKB,
      exitCode,
      timeout,
      memoryExceeded,
      runtimeError,
      cannotStart,
      cpuTime: cpuTimeMs,
      exceedsTimeLimit,
      timeoutType,
    }
  } catch (err) {
    try {
      if (existsSync(inputPath)) await unlink(inputPath)
      if (existsSync(outputPath)) await unlink(outputPath)
      if (existsSync(errorPath)) await unlink(errorPath)
    } catch {
      // 忽略清理错误
    }

    throw new Error(`执行错误: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Unix 信号映射表（参考 HOJ JudgeStrategy.parseTestLibErr 与 Linux signal.h）。
 * 退出码 ≥ 128 时表示被信号终止（128 + signal），此处映射为可读文本。
 * 仅用于诊断信息展示，不影响 SubmissionStatus 状态码（仍为 RE）。
 */
const EXIT_CODE_SIGNAL_MAP: Record<number, string> = {
  134: 'Runtime Error (SIGABRT: 调用 abort()/assert 失败)',
  135: 'Runtime Error (SIGBUS: 总线错误/内存对齐非法)',
  136: 'Runtime Error (SIGFPE: 浮点异常/除零)',
  137: 'Runtime Error (SIGKILL: 进程被强制终止)',
  138: 'Runtime Error (SIGUSR1)',
  139: 'Runtime Error (SIGSEGV: 段错误/非法内存访问)',
  140: 'Runtime Error (SIGUSR2)',
  141: 'Runtime Error (SIGPIPE: 向已关闭的管道写入)',
  142: 'Runtime Error (SIGALRM: 定时器触发)',
  143: 'Runtime Error (SIGTERM: 终止信号)',
  152: 'Runtime Error (SIGXCPU: CPU 时间超限)',
  153: 'Runtime Error (SIGXFSZ: 文件大小超限)',
}

/**
 * 根据退出码返回可诊断的 RE 原因文本。
 * 退出码 0 / 1-31（程序自行 exit）→ 返回空字符串（由调用方使用通用 Runtime Error）
 * 退出码 ≥ 128（被信号终止）→ 返回信号映射文本
 */
function formatRuntimeErrorByExitCode(exitCode: number): string {
  if (exitCode >= 128) {
    return EXIT_CODE_SIGNAL_MAP[exitCode] || `Runtime Error (信号 ${exitCode - 128})`
  }
  return ''
}
