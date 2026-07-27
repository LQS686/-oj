import { spawn, spawnSync } from 'child_process'
import { writeFile, unlink, open as fsOpen } from 'fs/promises'
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import * as crypto from 'crypto'
import { logger } from '@/lib/logger'
import type { ExecuteArtifacts, ExecuteOptions, ExecuteResult } from './executor-types'
import { computeExtraTime, readMemFileKB, readTimeFileMs, readTimeFilePair } from './process-stats'
import {
  assertDockerJudgeEnabled,
  getRunInfo,
  getDockerImage,
  ensureDockerImage,
  getDockerRunCommand,
} from './docker'
import { shouldForceUlimitV } from './compiler'

const USE_DOCKER = process.env.USE_DOCKER === 'true' || false

/** 输出硬上限 256 MiB（防止恶意无限刷盘撑爆磁盘/堆） */
export const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024 * 1024
/** 无标准答案尺寸时的默认输出上限 */
const DEFAULT_OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024
/** 相对标准答案的倍率（OLE） */
const OUTPUT_LIMIT_RATIO = 2
/** RE/pretest 预览截断 */
const OUTPUT_PREVIEW_BYTES = 8 * 1024
const ERROR_PREVIEW_BYTES = 8 * 1024

/**
 * 根据标准答案大小计算 OLE 上限：
 *   min(硬上限, max(默认上限, 2 × expected + 1KiB))
 */
export function computeOutputLimitBytes(expectedOutputBytes?: number, override?: number): number {
  if (typeof override === 'number' && override > 0) {
    return Math.min(DEFAULT_MAX_OUTPUT_BYTES, Math.max(1024, override))
  }
  if (typeof expectedOutputBytes === 'number' && expectedOutputBytes > 0) {
    const scaled = Math.floor(expectedOutputBytes * OUTPUT_LIMIT_RATIO) + 1024
    return Math.min(DEFAULT_MAX_OUTPUT_BYTES, Math.max(DEFAULT_OUTPUT_LIMIT_BYTES, scaled))
  }
  return DEFAULT_OUTPUT_LIMIT_BYTES
}

/**
 * 强制结束评测子进程树（含 runner.sh / time 下的选手进程）。
 * 仅 Linux：不可用负 PGID（spawn 未 detached 时与 Node 同组，会误杀 Worker）。
 */
function killJudgeTree(rootPid: number | undefined): void {
  if (!rootPid || rootPid <= 0) return
  const killDescendants = (pid: number) => {
    try {
      const out = spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
      const kids = (out.stdout || '')
        .trim()
        .split(/\s+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
      for (const c of kids) {
        killDescendants(c)
        try {
          process.kill(c, 'SIGKILL')
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
  killDescendants(rootPid)
  try {
    process.kill(rootPid, 'SIGKILL')
  } catch {
    /* ignore */
  }
}

/** 清理 executeCode 留下的输出/错误文件 */
export async function cleanupExecuteArtifacts(artifacts?: ExecuteArtifacts | null): Promise<void> {
  if (!artifacts) return
  for (const p of [artifacts.outputPath, artifacts.errorPath]) {
    try {
      if (p && existsSync(p)) await unlink(p)
    } catch {
      // ignore
    }
  }
}

async function readFilePreview(filePath: string, maxBytes: number): Promise<string> {
  if (!existsSync(filePath)) return ''
  try {
    const size = statSync(filePath).size
    if (size <= 0) return ''
    const fd = await fsOpen(filePath, 'r')
    try {
      const len = Math.min(size, maxBytes)
      const buf = Buffer.alloc(len)
      await fd.read(buf, 0, len, 0)
      const text = buf.toString('utf-8')
      return size > maxBytes ? text + '\n[已截断]' : text
    } finally {
      await fd.close()
    }
  } catch {
    return ''
  }
}

/** 评测仅 Linux（WSL / 容器）；Windows 宿主请走 WSL + Docker。构建阶段跳过以免 next build 误伤。 */
function assertLinuxJudgeHost(): void {
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  if (process.platform === 'win32') {
    throw new Error(
      '评测不支持 Windows 宿主。请在 WSL 中运行：docker compose up，或 bash scripts/wsl-dev.sh（见 docs/WSL_DEV.md）',
    )
  }
}

export async function executeCode(options: ExecuteOptions): Promise<ExecuteResult> {
  // 安全校验：真正执行评测时才拦截，避免构建阶段误触发
  assertDockerJudgeEnabled()
  assertLinuxJudgeHost()

  const {
    language,
    input,
    inputPath: providedInputPath,
    timeLimit,
    memoryLimit,
    compiledPath,
    extraTimeRatio = 0.1,
    expectedOutputBytes,
    outputLimitBytes: outputLimitOverride,
    signal,
  } = options

  if (!compiledPath) {
    throw new Error('缺少编译路径')
  }
  if (!providedInputPath && typeof input !== 'string') {
    throw new Error('缺少输入（input 或 inputPath）')
  }
  if (signal?.aborted) {
    return {
      output: '',
      error: '评测已中止',
      time: 0,
      memory: 0,
      exitCode: -1,
      timeout: false,
      memoryExceeded: false,
      runtimeError: false,
      cannotStart: false,
      aborted: true,
    }
  }

  const extraTime = computeExtraTime(timeLimit, extraTimeRatio)
  // 墙钟超时（hard timeout）：参考 HOJ/Hydro 的 clockLimit = 3 × cpuLimit
  // 1. timeLimit + extraTime 作为 CPU 时间窗口（用于精确判定 CPU TLE）
  // 2. timeLimit * 3 作为基础墙钟窗口（sleep 型死循环）
  // 3. 另按标准答案体积加 IO 裕量：大输出时墙钟可远大于 CPU，
  //    若仍用 3×TL，会把「CPU 未超限、只是写了上百万行」的正解误杀成 TLE（如 LP3383）
  const cpuTimeLimitMs = timeLimit + extraTime
  const expectedBytesForWall = expectedOutputBytes ?? 0
  const ioSlackMs = Math.min(120_000, Math.ceil(expectedBytesForWall / 2000))
  const wallClockLimitMs = Math.max(cpuTimeLimitMs, timeLimit * 3, timeLimit + ioSlackMs)
  const hardTimeoutMs = wallClockLimitMs
  const outputLimitBytes = computeOutputLimitBytes(expectedOutputBytes, outputLimitOverride)

  const tempDir = join(process.cwd(), 'temp', 'judge')
  const timestamp = Date.now()
  const randomId = crypto.randomBytes(8).toString('hex')
  const inputPath = join(tempDir, `input_${timestamp}_${randomId}.txt`)
  const outputPath = join(tempDir, `output_${timestamp}_${randomId}.txt`)
  const errorPath = join(tempDir, `error_${timestamp}_${randomId}.txt`)
  /** 若直接复用调用方 inputPath，则不要删除它 */
  let ownsInputFile = true

  try {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    }

    if (providedInputPath) {
      // 大数据：直接复用落盘测点，避免再把内容读进 V8
      ownsInputFile = false
      // 局部变量遮蔽：后续统一用 workingInputPath
    } else {
      await writeFile(inputPath, input ?? '', 'utf-8')
    }
    const workingInputPath = providedInputPath || inputPath

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
    let outputLimitExceeded = false
    let cannotStart = false
    let peakMemoryKB = 0
    let cpuTimeMs = 0
    /** wrapper 已写出 CPU（含 0ms）；为 true 时禁止用墙钟覆盖，避免小数据虚高到几十 ms */
    let cpuSampledFromWrapper = false
    let exceedsTimeLimit = false
    let abortedBySignal = false
    let startTime = 0
    let endTime = 0
    let retainArtifacts = false

    if (USE_DOCKER) {
      const containerId = `judge_${timestamp}_${randomId}`
      const baseImage = getDockerImage(language)
      const statsPath = join(tempDir, `stats_${timestamp}_${randomId}.txt`)

      // 首次评测前确保镜像已拉取，避免 docker run 隐式拉取被 hardTimeoutMs 杀死
      await ensureDockerImage(baseImage)

      // 内层命令：选手程序 stdout+stderr → output 文件
      const innerCmd = `cd /app/temp && ${getDockerRunCommand(language, compiledPath, workingInputPath)} > output_${timestamp}_${randomId}.txt 2>&1`
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
      // CPU ulimit 跟 cpuTimeLimit（非墙钟）：大 I/O 题暴力解不应跑满 ioSlack 墙钟
      const dockerCpuSec = Math.min(
        Math.max(1, Math.ceil(cpuTimeLimitMs / 1000) || 1),
        300,
      )
      // 137 可能是 OOM 也可能是 CPU hard ulimit；等采到 stats 后再区分
      let dockerSigkill = false
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
        '--ulimit', `cpu=${dockerCpuSec}:${dockerCpuSec}`,
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

        const onAbort = () => {
          if (abortedBySignal) return
          abortedBySignal = true
          logger.debug(`AbortSignal：终止 Docker 评测容器`)
          spawn('docker', ['rm', '-f', containerId], { detached: true, stdio: 'ignore' })
          try {
            dockerProcess.kill()
          } catch {
            /* ignore */
          }
        }
        if (signal) {
          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        }

        dockerProcess.on('exit', (code) => {
          clearTimeout(timeoutId)
          signal?.removeEventListener('abort', onAbort)
          endTime = Date.now()
          exitCode = code || 0
          // 状态判定优先级：TLE > MLE > RE（参考 HOJ DefaultJudge.java:54-81）
          if (abortedBySignal) {
            // fail-fast 中止，不记 TLE
          } else if (timeout) {
            // 已由墙钟超时定时器标记，保持 timeout = true
          } else if (code === 152) {
            // SIGXCPU：Docker --ulimit cpu 软限制
            timeout = true
          } else if (code === 137) {
            // SIGKILL：OOM 或 CPU hard ulimit —— 等 stats 后再区分
            dockerSigkill = true
          } else if (code === 124 || code === 143) {
            // 124 = GNU timeout；143 = SIGTERM
            timeout = true
          } else if (code !== 0) {
            runtimeError = true
          }
          resolve()
        })

        dockerProcess.on('error', (err) => {
          clearTimeout(timeoutId)
          signal?.removeEventListener('abort', onAbort)
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

      const outputFile = join(tempDir, `output_${timestamp}_${randomId}.txt`)
      try {
        // 仅读预览，禁止整文件进堆（大数据 AC 会 OOM）
        if (existsSync(outputFile)) {
          const sz = statSync(outputFile).size
          if (sz > outputLimitBytes) {
            outputLimitExceeded = true
          }
          output = await readFilePreview(outputFile, OUTPUT_PREVIEW_BYTES)
        }
      } catch (err) {
        logger.error(`读取Docker输出失败`, err)
      }

      if (peakMemoryKB === 0) {
        logger.debug(`Docker模式: 资源统计未采集到（/usr/bin/time 可能未安装或容器已被超时清理）`)
      }

      // SIGKILL(137)：用 CPU/内存统计区分 CPU hard ulimit vs OOM
      if (dockerSigkill && !abortedBySignal && !timeout) {
        const memLimitBytes = memoryLimit * 1024 * 1024
        if (cpuTimeMs > timeLimit) {
          timeout = true
          if (cpuTimeMs > cpuTimeLimitMs) {
            exceedsTimeLimit = false
          } else {
            exceedsTimeLimit = true
          }
        } else if (peakMemoryKB > 0 && peakMemoryKB * 1024 >= memLimitBytes) {
          memoryExceeded = true
        } else {
          // 无可靠 CPU/内存证据时保持历史默认：OOM → MLE
          memoryExceeded = true
        }
      }

      // Docker 模式 CPU TLE 二次判定（参考 HOJ DefaultJudge.java:57）
      // 沙箱返回正常退出（exitCode=0），但 CPU 时间超过 timeLimit → 判 TLE
      if (!timeout && !memoryExceeded && !runtimeError && cpuTimeMs > timeLimit) {
        logger.debug(`Docker模式 CPU TLE: cpuTime=${cpuTimeMs}ms > timeLimit=${timeLimit}ms`)
        timeout = true
        if (cpuTimeMs > cpuTimeLimitMs) {
          exceedsTimeLimit = false
        } else {
          exceedsTimeLimit = true
        }
      }
    } else {
      // 本地 Linux 评测：仅 runner.sh（WSL / 容器内）
      if (process.platform !== 'linux') {
        throw new Error(`本地评测仅支持 Linux，当前平台: ${process.platform}`)
      }
      if (!['cpp', 'c', 'python'].includes(language)) {
        throw new Error(`不支持的评测语言: ${language}`)
      }

      const runInfo = getRunInfo(language, compiledPath)
      const memFilePath = join(tempDir, `mem_${timestamp}_${randomId}.txt`)
      const timeFilePath = join(tempDir, `time_${timestamp}_${randomId}.txt`)
      const runnerPath = join(process.cwd(), 'lib', 'judge', 'runner.sh')
      const safeMem = Math.min(Math.max(16, Number(memoryLimit) || 256), 4096)
      // RLIMIT_CPU 跟 CPU 窗口（timeLimit+extra），不能跟墙钟/ioSlack，
      // 否则大输出题暴力解会把 ulimit -t 跑满才死，评测极慢。
      const safeCpu = Math.min(
        Math.max(1, Math.ceil(Number(cpuTimeLimitMs) / 1000) || 1),
        300,
      )
      const safeStack = Math.min(Math.max(1, Number(memoryLimit) || 16), 64)
      const commandPath =
        typeof runInfo.command === 'string' ? runInfo.command.split(/[\n\r;|&`$()<>]/)[0] : ''
      if (!commandPath || !/^[a-zA-Z0-9_./\-]+$/.test(commandPath)) {
        throw new Error(`非法的 command 路径: ${runInfo.command}`)
      }

      const command = 'bash'
      const args = [
        runnerPath,
        String(safeMem),
        String(safeCpu),
        String(safeStack),
        commandPath,
        ...runInfo.args,
      ]
      const spawnEnv: NodeJS.ProcessEnv = {
        ...process.env,
        DSOJ_MEM_FILE: memFilePath,
        DSOJ_TIME_FILE: timeFilePath,
        DSOJ_STDIN_FILE: workingInputPath,
        DSOJ_STDOUT_FILE: outputPath,
        DSOJ_STDERR_FILE: errorPath,
        DSOJ_OUTPUT_LIMIT_BYTES: String(Math.max(1024, outputLimitBytes)),
        DSOJ_CPU_LIMIT_MS: String(Math.max(1, cpuTimeLimitMs)),
      }
      if (shouldForceUlimitV()) {
        spawnEnv.DSOJ_FORCE_ULIMIT_V = '1'
      }

      logger.debug(`执行命令`, { command, args, extraTime, hardTimeoutMs })

      const childProcess = spawn(command, args, {
        cwd: tempDir,
        stdio: 'ignore',
        detached: false,
        env: spawnEnv,
      })

      const maxMemoryBytes = memoryLimit * 1024 * 1024
      let timeoutId: NodeJS.Timeout | null = null
      let processKilled = false
      let forceKilled = false

      // 内存/CPU 由 runner.sh 写出；原生重定向，不经 Node 管道
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
            killJudgeTree(childProcess.pid)
            try {
              childProcess.kill('SIGKILL')
            } catch {
              /* ignore */
            }
          }

          // 不在此处 resolve，等待 close 事件统一收尾
          // （close 在所有 stdio 流关闭后触发，确保输出已完整刷盘）
        }, hardTimeoutMs)

        const onAbort = () => {
          if (abortedBySignal) return
          abortedBySignal = true
          forceKilled = true
          logger.debug(`AbortSignal：强制终止选手进程树`)
          if (!processKilled) {
            processKilled = true
            killJudgeTree(childProcess.pid)
            try {
              childProcess.kill('SIGKILL')
            } catch {
              /* ignore */
            }
          }
        }
        if (signal) {
          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        }

        // 统一收尾函数：close/error/墙超时收尾共用
        const finishResolve = () => {
          if (resolved) return
          resolved = true
          if (timeoutId) clearTimeout(timeoutId)
          if (fallbackTimer) clearTimeout(fallbackTimer)
          signal?.removeEventListener('abort', onAbort)
          processKilled = true
          // close 事件触发时所有 stdio 流已关闭，输出已完整刷盘
          endTime = Date.now()
          exitCode = savedExitCode || 0

          if (abortedBySignal) {
            timeout = false
            memoryExceeded = false
            outputLimitExceeded = false
            runtimeError = false
            exceedsTimeLimit = false
            resolve()
            return
          }

          // wrapper 写出的峰值内存 / CPU·墙钟（Linux GNU time / /proc）
          const fileMem = readMemFileKB(memFilePath)
          if (fileMem > 0 && fileMem > peakMemoryKB) peakMemoryKB = fileMem
          const timePair = readTimeFilePair(timeFilePath)
          if (timePair) {
            // CPU>0 用 CPU；极短程序 getrusage 常为 0，改用 wrapper 测得的子进程墙钟（真实耗时）
            cpuTimeMs = timePair.cpuMs > 0
              ? timePair.cpuMs
              : (timePair.wallMs > 0 ? timePair.wallMs : 0)
            cpuSampledFromWrapper = true
          } else {
            const fileCpu = readTimeFileMs(timeFilePath)
            if (fileCpu >= 0) {
              cpuTimeMs = fileCpu
              cpuSampledFromWrapper = true
            }
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
          if (!cpuSampledFromWrapper && cpuTimeMs <= 0) {
            cpuTimeMs = Math.max(0, endTime - startTime)
            logger.debug(`CPU 时间回退为墙钟`, { platform: process.platform, cpuTimeMs })
          }

          // 信号分类（HOJ SandboxRun 信号表）：
          //   152 = SIGXCPU → CPU TLE（ulimit -t / runner CPU 轮询）
          //   153 = SIGXFSZ → OLE（输出超限）
          //   137 = SIGKILL → 墙钟强杀 / ulimit -v；用峰值、CPU、墙钟区分 MLE vs TLE
          const wallMs = Math.max(0, endTime - startTime)
          if (savedExitCode === 153 || outputLimitExceeded) {
            outputLimitExceeded = true
            memoryExceeded = false
            savedTimeout = false
          } else if (savedExitCode === 152) {
            savedTimeout = true
          } else if (savedExitCode === 137) {
            if (savedForceKilled || savedTimeout) {
              savedTimeout = true
            } else if (peakMemoryKB > 0 && peakMemoryKB * 1024 >= maxMemoryBytes) {
              memoryExceeded = true
            } else if (cpuTimeMs > timeLimit || wallMs >= hardTimeoutMs * 0.95) {
              savedTimeout = true
            } else if (peakMemoryKB === 0 && wallMs < hardTimeoutMs * 0.5) {
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

          // 状态判定优先级：TLE > OLE > MLE > RE
          if (!savedTimeout && !outputLimitExceeded && !memoryExceeded && savedExitCode !== 0) {
            runtimeError = true
          }

          if (!savedForceKilled && !savedTimeout && !memoryExceeded && !outputLimitExceeded && cpuTimeMs > timeLimit) {
            exceedsTimeLimit = true
          }

          if (!savedTimeout && !memoryExceeded && !runtimeError && !outputLimitExceeded && cpuTimeMs > cpuTimeLimitMs) {
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
          signal?.removeEventListener('abort', onAbort)
          processKilled = true
          endTime = Date.now()
          runtimeError = true
          cannotStart = true
          error = err.message
          resolve()
        })
      })

      try {
        // 禁止整文件 readFile 进堆：仅预览；完整输出留给 artifacts 供磁盘流式比对
        if (existsSync(outputPath)) {
          const sz = statSync(outputPath).size
          if (sz > outputLimitBytes) {
            outputLimitExceeded = true
          }
          // TLE/MLE/OLE 时仍可读小预览，但不要为比对加载全文
          output = await readFilePreview(outputPath, OUTPUT_PREVIEW_BYTES)
        }
        if (existsSync(errorPath)) {
          error = await readFilePreview(errorPath, ERROR_PREVIEW_BYTES)
        }
        // 再次合并 mem/time 文件（close 后文件应已刷盘）
        const fileMem = readMemFileKB(memFilePath)
        if (fileMem > 0 && fileMem > peakMemoryKB) peakMemoryKB = fileMem
        const timePair = readTimeFilePair(timeFilePath)
        if (timePair) {
          const merged = timePair.cpuMs > 0
            ? timePair.cpuMs
            : (timePair.wallMs > 0 ? timePair.wallMs : 0)
          cpuTimeMs = merged
          cpuSampledFromWrapper = true
        } else {
          const fileCpu = readTimeFileMs(timeFilePath)
          if (fileCpu >= 0) {
            cpuTimeMs = fileCpu
            cpuSampledFromWrapper = true
          }
        }
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

    // 保留输出文件供 judger 流式比对（调用方 cleanupExecuteArtifacts）
    retainArtifacts = true

    if (!startTime) startTime = Date.now()
    if (!endTime) endTime = Date.now()
    // 展示时间：wrapper 采样优先（CPU，或 CPU=0 时的子进程墙钟）；勿用 Node 外包一层的大墙钟
    let preciseTime: number
    if (cpuSampledFromWrapper) {
      preciseTime = Math.max(0, Math.round(cpuTimeMs))
      // 真实跑过但四舍五入仍为 0 时，至少显示 1ms，避免“什么都没跑”的错觉
      if (preciseTime === 0 && endTime > startTime) preciseTime = 1
    } else if (cpuTimeMs > 0) {
      preciseTime = Math.max(1, Math.round(cpuTimeMs))
    } else {
      preciseTime = Math.max(1, Math.round(endTime - startTime))
    }
    cpuTimeMs = preciseTime

    // fail-fast 中止：不按 TLE/RE 处理
    if (abortedBySignal) {
      timeout = false
      memoryExceeded = false
      outputLimitExceeded = false
      runtimeError = false
      exceedsTimeLimit = false
    }

    // 墙钟强杀但 CPU 未超（或仅在浮动窗口内）：常见于百万行输出的 IO 等待。
    // 此时不应直接 TLE，而应进入输出比对 / 临界重测。
    // sleep 死循环通常 CPU≈墙钟或输出为空，仍保持 TLE。
    if (timeout && !abortedBySignal) {
      const outSize = existsSync(outputPath) ? statSync(outputPath).size : 0
      if (outSize > 0 && cpuTimeMs > 0 && cpuTimeMs <= timeLimit) {
        logger.info('墙钟超时但 CPU 未超限且已有输出，按 IO 密集处理', {
          cpuTimeMs,
          timeLimit,
          wallMs: endTime - startTime,
          outSize,
        })
        timeout = false
      } else if (outSize > 0 && cpuTimeMs > timeLimit && cpuTimeMs <= cpuTimeLimitMs) {
        logger.info('墙钟超时且 CPU 处于浮动窗口，转临界 TLE', {
          cpuTimeMs,
          timeLimit,
          cpuTimeLimitMs,
        })
        timeout = false
        exceedsTimeLimit = true
      }
    }

    // 内存采集失败时返回 0（不再使用伪造值），并记录警告
    if (peakMemoryKB === 0 && !USE_DOCKER) {
      logger.warn(`内存采集失败，记为 0`, {
        language,
        platform: process.platform,
      })
    }

    try {
      if (ownsInputFile && existsSync(inputPath)) await unlink(inputPath)
      // 输出/错误文件留给 artifacts；异常路径再清
      if (!retainArtifacts) {
        if (existsSync(outputPath)) await unlink(outputPath)
        if (existsSync(errorPath)) await unlink(errorPath)
      }
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

    if (abortedBySignal) {
      detailedError = '评测已中止'
    } else if (timeout) {
      const wallTimeMs = Math.max(0, endTime - startTime)
      if (timeoutType === 'cpu') {
        detailedError = `Time Limit Exceeded (CPU 时间 ${cpuTimeMs}ms > 限制 ${timeLimit}ms)`
      } else {
        detailedError = `Time Limit Exceeded (墙钟时间 ${wallTimeMs}ms > 限制 ${wallClockLimitMs}ms，可能是 sleep 型死循环或 IO 阻塞)`
      }
    } else if (outputLimitExceeded) {
      detailedError = `Output Limit Exceeded (>${Math.round(outputLimitBytes / (1024 * 1024))}MB)`
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
      time: abortedBySignal ? 0 : preciseTime,
      memory: abortedBySignal ? 0 : peakMemoryKB,
      exitCode,
      timeout,
      memoryExceeded,
      outputLimitExceeded,
      runtimeError,
      cannotStart,
      cpuTime: abortedBySignal ? 0 : cpuTimeMs,
      exceedsTimeLimit,
      timeoutType,
      aborted: abortedBySignal || undefined,
      artifacts: retainArtifacts
        ? { outputPath, errorPath }
        : undefined,
    }
  } catch (err) {
    try {
      if (ownsInputFile && existsSync(inputPath)) await unlink(inputPath)
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
