import { execSync, spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import * as crypto from 'crypto'
import { logger } from '@/lib/logger'

const USE_DOCKER = process.env.USE_DOCKER === 'true' || false

// VULN-04 修复：Windows 本地评测无沙箱隔离，仅允许在显式确认的开发环境使用。
// 生产环境必须启用 USE_DOCKER=true。模块加载时一次性告警，避免每次评测刷日志。
if (!USE_DOCKER && process.platform === 'win32') {
  if (process.env.ALLOW_LOCAL_JUDGE_ON_WINDOWS !== '1') {
    throw new Error('Windows 本地评测需要在 .env 中设置 ALLOW_LOCAL_JUDGE_ON_WINDOWS=1 以显式确认风险。生产环境请设置 USE_DOCKER=true')
  }
  logger.warn('⚠️ [安全] Windows 本地进程评测已显式确认 (ALLOW_LOCAL_JUDGE_ON_WINDOWS=1)，无 Docker 沙箱隔离。生产环境必须设置 USE_DOCKER=true。')
}

// PERF-01 修复：生产环境强制使用 Docker 沙箱评测，禁止本地评测，避免无隔离的进程执行风险。
if (process.env.NODE_ENV === 'production' && process.env.USE_DOCKER !== 'true') {
  throw new Error('生产环境必须设置 USE_DOCKER=true，禁止本地评测')
}

export interface ExecuteOptions {
  code: string
  language: string
  input: string
  timeLimit: number
  memoryLimit: number
  compiledPath?: string
  /** 临界 TLE 容差比例，extraTime = ceil(max(2000, timeLimit*2) * extraTimeRatio) */
  extraTimeRatio?: number
}

export interface ExecuteResult {
  output: string
  error?: string
  time: number
  memory: number
  exitCode: number
  timeout: boolean
  memoryExceeded: boolean
  runtimeError: boolean
  cannotStart: boolean
  /** CPU 时间（用户态 + 内核态，ms）。Windows 平台回退为墙钟时间 */
  cpuTime?: number
  /** 程序正常完成但 CPU 时间 > timeLimit（且未被强制杀死），用于触发重测 */
  exceedsTimeLimit?: boolean
}

/**
 * 自适应超时缓冲：extraTime = ceil(max(2000, timeLimit * 2) * extraTimeRatio)
 * 强制杀死窗口为 timeLimit + extraTime
 */
function computeExtraTime(timeLimit: number, extraTimeRatio: number): number {
  return Math.ceil(Math.max(2000, timeLimit * 2) * extraTimeRatio)
}

/**
 * 解析 /proc/[pid]/stat 获取 utime + stime 累计毫秒
 * 字段 14 (utime) + 15 (stime)，单位为 clock ticks（CLK_TCK 通常为 100）
 * comm (字段 2) 可能包含空格或括号，使用 lastIndexOf(')') 切分
 * 失败返回 -1
 */
function readProcCpuTimeMs(pid: number): number {
  try {
    const content = readFileSync(`/proc/${pid}/stat`, 'utf-8')
    const lastParen = content.lastIndexOf(')')
    if (lastParen < 0) return -1
    // 切去 "pid (comm)" 后，剩余字段从 field 3 开始
    const rest = content.slice(lastParen + 2).trim().split(/\s+/)
    // rest[0] = state (field 3), rest[11] = utime (field 14), rest[12] = stime (field 15)
    const utime = parseInt(rest[11], 10)
    const stime = parseInt(rest[12], 10)
    if (Number.isNaN(utime) || Number.isNaN(stime)) return -1
    // CLK_TCK 在 Linux 上恒为 100
    return Math.round((utime + stime) * (1000 / 100))
  } catch {
    return -1
  }
}

/**
 * 解析 /proc/[pid]/status 获取 VmHWM（峰值常驻内存，KB）
 * VmHWM 已是进程生命周期内的峰值，仅需读取一次即可
 * 失败返回 -1
 */
function readProcVmHwmKB(pid: number): number {
  try {
    const content = readFileSync(`/proc/${pid}/status`, 'utf-8')
    const match = content.match(/^VmHWM:\s+(\d+)\s+kB/m)
    if (match) return parseInt(match[1], 10)
    return -1
  } catch {
    return -1
  }
}

/**
 * Windows: 通过 tasklist 获取指定 PID 的当前工作集内存（KB）
 * 用于轮询采集峰值。失败返回 -1
 * 注：tasklist 返回的是当前 WorkingSet，非 PeakWorkingSet；
 * 通过轮询间隔内取最大值近似峰值。Windows 原生 PeakWorkingSet 需要 GetProcessMemoryInfo API，
 * 不引入原生依赖时此为最佳折中。
 */
function readWindowsProcessMemoryKB(pid: number): number {
  try {
    // pid 来自 process.pid，始终为正整数；显式校验防止命令注入
    const safePid = Math.floor(pid)
    if (!Number.isFinite(safePid) || safePid <= 0) return -1
    const out = execSync(`tasklist /fi "PID eq ${safePid}" /fo csv /nh`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 2000,
    })
    // 输出格式: "name","pid","session","sessionnum","mem"
    // 例如: "node.exe","1234","Console","1","12,345 K"
    const line = out.trim().split('\n')[0]
    if (!line) return -1
    const cols = line.match(/"[^"]*"/g)
    if (!cols || cols.length < 5) return -1
    const memStr = cols[4]
      .replace(/"/g, '')
      .replace(/,/g, '')
      .replace(/\s*K/i, '')
      .trim()
    const mem = parseInt(memStr, 10)
    if (Number.isNaN(mem)) return -1
    return mem
  } catch {
    return -1
  }
}

export async function executeCode(options: ExecuteOptions): Promise<ExecuteResult> {
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
  const hardTimeoutMs = timeLimit + extraTime

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
          if (code !== 0 && !timeout) {
            // 137 = 容器被 OOM Killer 杀死（SIGKILL by kernel），判定为 MLE
            if (code === 137) {
              memoryExceeded = true
            } else {
              runtimeError = true
            }
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
        execSync(`docker cp ${containerId}:/tmp/time_stats.txt ${statsPath}`, { timeout: 5000 })
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
    } else {
      const runInfo = getRunInfo(language, compiledPath)
      const isLinux = process.platform === 'linux'
      const isWindows = process.platform === 'win32'

      // Linux 所有支持语言使用 runner.sh 设置硬资源限制
      // （RLIMIT_AS / RLIMIT_CPU / RLIMIT_STACK，参考 LemonLime watcher_unix.cpp）
      let command = runInfo.command
      let args = runInfo.args
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
      }

      logger.debug(`执行命令`, { command, args, extraTime, hardTimeoutMs })

      const childProcess = spawn(command, args, {
        cwd: tempDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      })

      const maxMemoryBytes = memoryLimit * 1024 * 1024
      let monitorInterval: NodeJS.Timeout | null = null
      // timeoutId 提升至外层作用域，便于内存轮询杀进程后清除墙超时定时器
      let timeoutId: NodeJS.Timeout | null = null
      let processKilled = false
      let forceKilled = false

      if (childProcess.pid) {
        // Linux: /proc 文件读取廉价（50ms 间隔）
        // Windows: tasklist 调用较重（100ms 间隔）
        // 注：Linux /proc/[pid]/stat 的 utime/stime 为累计值，VmHWM 已是峰值，
        // 因此仅需保留最新读数即可，无需取 max；为容错仍取 max。
        const pollIntervalMs = isLinux ? 50 : 100
        monitorInterval = setInterval(() => {
          if (processKilled || !childProcess.pid) return

          if (isLinux) {
            const cpuMs = readProcCpuTimeMs(childProcess.pid)
            if (cpuMs > cpuTimeMs) cpuTimeMs = cpuMs
            const hwm = readProcVmHwmKB(childProcess.pid)
            if (hwm > peakMemoryKB) peakMemoryKB = hwm
            // 软检测：内存超限则杀死（硬限制由 runner.sh 的 ulimit 兜底）
            if (hwm > 0 && hwm * 1024 > maxMemoryBytes) {
              logger.debug(`内存超过限制`, {
                current: Math.round(hwm / 1024),
                limit: memoryLimit
              })
              memoryExceeded = true
              processKilled = true
              forceKilled = true
              // 内存超限杀进程后清除墙超时定时器，避免后续误设 timeout 标志覆盖 MLE
              if (timeoutId) clearTimeout(timeoutId)
              childProcess.kill('SIGKILL')
              if (monitorInterval) clearInterval(monitorInterval)
            }
          } else if (isWindows) {
            const memKB = readWindowsProcessMemoryKB(childProcess.pid)
            if (memKB > peakMemoryKB) peakMemoryKB = memKB
            // Windows 无原生 Job Object 限制（不引入 ffi-napi 依赖），
            // 依赖轮询检测超限后杀死
            if (memKB > 0 && memKB * 1024 > maxMemoryBytes) {
              logger.debug(`内存超过限制`, {
                current: Math.round(memKB / 1024),
                limit: memoryLimit
              })
              memoryExceeded = true
              processKilled = true
              forceKilled = true
              // 内存超限杀进程后清除墙超时定时器，避免后续误设 timeout 标志覆盖 MLE
              if (timeoutId) clearTimeout(timeoutId)
              try {
                if (childProcess.pid && childProcess.pid > 0) {
                  execSync(`taskkill /F /T /PID ${childProcess.pid}`, { stdio: 'ignore' })
                }
              } catch {
                // 忽略：进程可能已退出
              }
              if (monitorInterval) clearInterval(monitorInterval)
            }
          }
        }, pollIntervalMs)
      }

      const { createReadStream, createWriteStream } = await import('fs')
      const inputStream = createReadStream(inputPath)

      // 给 stdin 与输入流附加 error 处理器，防止选手程序提前退出时 EPIPE crash Worker
      childProcess.stdin.on('error', (err) => {
        logger.debug('stdin 写入错误（选手程序可能已退出）', { error: err.message })
      })
      inputStream.on('error', (err) => {
        logger.debug('输入流读取错误', { error: err.message })
      })

      inputStream.pipe(childProcess.stdin)

      const outputStream = createWriteStream(outputPath)
      const errorStream = createWriteStream(errorPath)

      childProcess.stdout.pipe(outputStream)
      childProcess.stderr.pipe(errorStream)

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
                  execSync(`taskkill /F /T /PID ${childProcess.pid}`, { stdio: 'ignore' })
                }
              } catch {
                // 忽略：进程可能已退出
              }
            }
          }

          // 不在此处 resolve，等待 close 事件统一收尾
          // （close 在所有 stdio 流关闭后触发，确保输出已完整刷盘）
        }, hardTimeoutMs)

        // 统一收尾函数：close/error/兜底定时器共用
        const finishResolve = () => {
          if (resolved) return
          resolved = true
          if (timeoutId) clearTimeout(timeoutId)
          if (fallbackTimer) clearTimeout(fallbackTimer)
          if (monitorInterval) clearInterval(monitorInterval)
          processKilled = true
          // close 事件触发时所有 stdio 流已关闭，输出已完整刷盘
          endTime = Date.now()
          exitCode = savedExitCode || 0

          // Linux: 退出前再读一次 /proc 拿最终 CPU 时间与峰值内存
          // 注：close 事件触发时 /proc/[pid] 可能已消失，readProc* 失败返回 -1
          // 此时使用轮询期间采集到的最大值
          if (isLinux && childProcess.pid && !savedForceKilled) {
            const finalCpu = readProcCpuTimeMs(childProcess.pid)
            if (finalCpu > cpuTimeMs) cpuTimeMs = finalCpu
            const finalHwm = readProcVmHwmKB(childProcess.pid)
            if (finalHwm > peakMemoryKB) peakMemoryKB = finalHwm
          }

          // Windows 平台无 CPU 时间采集 API（不引入原生依赖），回退为墙钟时间
          if (!isLinux || cpuTimeMs <= 0) {
            cpuTimeMs = Math.max(0, endTime - startTime)
            if (isWindows) {
              logger.debug(`Windows平台: 使用墙钟时间作为 CPU 时间`)
            }
          }

          // P1-3: runner.sh 的 ulimit -t CPU 超限会发 SIGXCPU(退出码 152)
          // 或 SIGKILL(137)，非 Docker 路径应视为 TLE 而非 RE
          if (savedExitCode === 137 || savedExitCode === 152) {
            savedTimeout = true
          }

          if (savedExitCode !== 0 && !savedTimeout) {
            runtimeError = true
          }

          // exceedsTimeLimit: 程序正常完成（未被强制杀死），但 CPU 时间超过 timeLimit
          // 此时 timeout 保持 false（程序在 timeLimit + extraTime 窗口内完成），
          // 由 judger 决定是否触发重测
          if (!savedForceKilled && !savedTimeout && cpuTimeMs > timeLimit) {
            exceedsTimeLimit = true
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
          if (monitorInterval) clearInterval(monitorInterval)
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
      } catch (err) {
        logger.error(`读取输出失败`, err)
      }
    }

    // 兜底：极端异常时（startTime / endTime 未设置）使用当前时刻
    if (!startTime) startTime = Date.now()
    if (!endTime) endTime = Date.now()
    const execTime = Math.max(0, endTime - startTime)
    const preciseTime = Math.max(1, Math.round(execTime))

    // 内存采集失败时返回 0（不再使用伪造回退值），并记录警告
    if (peakMemoryKB === 0 && !USE_DOCKER) {
      logger.warn(`内存采集失败，记为 0`, { language, platform: process.platform })
    }

    try {
      if (existsSync(inputPath)) await unlink(inputPath)
      if (existsSync(outputPath)) await unlink(outputPath)
      if (existsSync(errorPath)) await unlink(errorPath)
    } catch (cleanupError) {
      logger.warn(`清理临时文件失败`, { error: cleanupError })
    }

    let detailedError = undefined

    if (timeout) {
      detailedError = `Time Limit Exceeded (>${timeLimit}ms)`
    } else if (memoryExceeded) {
      detailedError = `Memory Limit Exceeded (>${memoryLimit}MB)`
    } else if (runtimeError) {
      const errLines = error.split('\n')
      const lastLine = errLines[errLines.length - 1] || errLines[errLines.length - 2] || 'Runtime Error'
      detailedError = `Runtime Error: ${lastLine}`
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

function getRunInfo(language: string, compiledPath: string): { command: string, args: string[] } {
  const relativeCompiledPath = compiledPath.split('\\').pop() || compiledPath.split('/').pop() || ''

  const commands: Record<string, { command: string, args: string[] }> = {
    cpp: {
      command: relativeCompiledPath,
      args: []
    },
    c: {
      command: relativeCompiledPath,
      args: []
    },
    python: {
      command: process.platform === 'win32' ? 'python' : 'python3',
      args: [relativeCompiledPath]
    },
  }

  const cmdInfo = commands[language] || { command: relativeCompiledPath, args: [] }

  if (process.platform === 'win32') {
    let executablePath = cmdInfo.command
    const args = [...cmdInfo.args]

    if (executablePath.startsWith('./')) {
      executablePath = executablePath.substring(2)
    }

    if ((language === 'cpp' || language === 'c') && !executablePath.endsWith('.exe')) {
      executablePath += '.exe'
    }

    if (language !== 'cpp' && language !== 'c') {
      args.forEach((arg, i) => {
        if (arg.startsWith('./')) {
          args[i] = arg.substring(2)
        }
      })
    }

    return {
      command: executablePath,
      args
    }
  } else {
    return {
      command: cmdInfo.command,
      args: cmdInfo.args
    }
  }
}

function getDockerImage(language: string): string {
  const images: Record<string, string> = {
    cpp: 'gcc:12',
    c: 'gcc:12',
    python: 'python:3.11',
  }
  return images[language] || 'ubuntu:22.04'
}

/**
 * 已拉取的 Docker 镜像缓存（避免每次评测都执行 docker image inspect）
 * 首次评测时镜像不存在 → 触发 docker pull（允许长达 5 分钟）
 * 后续评测直接跳过检查，无额外开销
 */
const pulledImages = new Set<string>()

/**
 * 确保 Docker 评测镜像已存在本地，不存在则拉取。
 * 首次评测超时的主要根因：docker run 触发隐式拉取，但 spawn 超时仅 hardTimeoutMs（~1.2s），
 * 远不足以拉取数百 MB 镜像。本函数将"拉取"与"执行"分离，拉取使用独立的长超时。
 */
async function ensureDockerImage(image: string): Promise<void> {
  if (pulledImages.has(image)) return

  // 检查镜像是否已存在
  try {
    execSync(`docker image inspect ${image}`, { stdio: 'ignore', timeout: 5000 })
    pulledImages.add(image)
    logger.info(`Docker 镜像已存在`, { image })
    return
  } catch {
    // 镜像不存在，继续拉取
  }

  logger.info(`Docker 镜像不存在，开始拉取`, { image })
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('docker', ['pull', image], { stdio: 'inherit' })
      const timer = setTimeout(() => {
        proc.kill()
        reject(new Error('docker pull 超时'))
      }, 300_000)
      proc.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(`docker pull 失败，退出码: ${code}`))
      })
      proc.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
    pulledImages.add(image)
    logger.info(`Docker 镜像拉取完成`, { image })
  } catch (err) {
    throw new Error(`Docker 镜像拉取失败: ${image} - ${err instanceof Error ? err.message : String(err)}`)
  }
}

function getDockerRunCommand(language: string, compiledPath: string, inputPath: string): string {
  const relativeCompiledPath = compiledPath.split('\\').pop() || compiledPath.split('/').pop() || ''
  const relativeInputPath = inputPath.split('\\').pop() || inputPath.split('/').pop() || ''

  const safeCompiledPath = relativeCompiledPath.replace(/\\/g, '/')
  const safeInputPath = relativeInputPath.replace(/\\/g, '/')

  const commands: Record<string, string> = {
    cpp: `./${safeCompiledPath} < ${safeInputPath}`,
    c: `./${safeCompiledPath} < ${safeInputPath}`,
    python: `python3 ${safeCompiledPath} < ${safeInputPath}`,
  }

  return commands[language] || safeCompiledPath
}
