import { spawn, spawnSync } from 'child_process'
import { writeFile, unlink, open as fsOpen } from 'fs/promises'
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import * as crypto from 'crypto'
import { constants as osConstants } from 'os'
import { logger } from '@/lib/logger'
import type { ExecuteArtifacts, ExecuteOptions, ExecuteResult } from './executor-types'
import { computeExtraTime, readMemFileKB, readTimeFileMs, readTimeFilePair } from './process-stats'
import { shouldForceUlimitV } from './compiler'
import { getJudgeConfig } from './config'

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

  /**
   * B-P2-8：优先读 /proc/<pid>/task/<pid>/children（Linux 原生，无 pgrep 依赖），
   * 精简镜像缺失 procps 时树清理仍然生效；读取失败（非 Linux / 进程已退出）回退 pgrep。
   */
  const readChildren = (pid: number): number[] => {
    try {
      const raw = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8')
      const kids = raw
        .trim()
        .split(/\s+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
      if (kids.length > 0) return kids
    } catch {
      /* 无 /proc 或进程已退出，走 pgrep 回退 */
    }
    try {
      const out = spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
      return (out.stdout || '')
        .trim()
        .split(/\s+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0)
    } catch {
      return []
    }
  }

  const killDescendants = (pid: number) => {
    for (const c of readChildren(pid)) {
      killDescendants(c)
      try {
        process.kill(c, 'SIGKILL')
      } catch {
        /* ignore */
      }
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

/** Node exit(code, signal)：SIGKILL 时 code 常为 null，需还原为 128+signo */
function normalizeChildExitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (typeof code === 'number') return code
  if (signal) {
    const signo = (osConstants.signals as Record<string, number | undefined>)[signal]
    if (typeof signo === 'number' && signo > 0) return 128 + signo
  }
  // 未知信号终止：不要当成「非 0 → RE」，交给上层用 forceKilled/timeout 判断
  return 0
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

/** Linux 运行命令（WSL / 容器）；已移除 Windows 宿主路径。 */
function getRunInfo(language: string, compiledPath: string): { command: string, args: string[] } {
  const relativeCompiledPath = compiledPath.split('\\').pop() || compiledPath.split('/').pop() || ''
  // 无斜杠的本地二进制必须带 ./，否则 PATH 不含「.」时会 command not found
  const localBin = relativeCompiledPath.includes('/')
    ? relativeCompiledPath
    : `./${relativeCompiledPath}`

  const commands: Record<string, { command: string, args: string[] }> = {
    cpp: {
      command: localBin,
      args: [],
    },
    c: {
      command: localBin,
      args: [],
    },
    python: {
      command: 'python3',
      args: [relativeCompiledPath],
    },
  }

  const cmdInfo = commands[language] || { command: localBin, args: [] }
  return {
    command: cmdInfo.command,
    args: cmdInfo.args,
  }
}

export async function executeCode(options: ExecuteOptions): Promise<ExecuteResult> {
  // 安全校验：真正执行评测时才拦截，避免构建阶段误触发
  assertLinuxJudgeHost()

  const {
    language,
    input,
    inputPath: providedInputPath,
    timeLimit,
    memoryLimit,
    compiledPath,
    extraTimeRatio = 0,
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
  //    I/O 预算按 ~8MB/s，上限 ioSlackMaxMs（系统设置可调），避免暴力解拖到 120s+
  const cpuTimeLimitMs = timeLimit + extraTime
  const expectedBytesForWall = expectedOutputBytes ?? 0
  const ioSlackMaxMs = getJudgeConfig().ioSlackMaxMs
  const ioSlackMs = Math.min(ioSlackMaxMs, Math.ceil(expectedBytesForWall / 8000))
  const wallClockLimitMs = Math.max(cpuTimeLimitMs, timeLimit * 3, timeLimit + ioSlackMs)
  const hardTimeoutMs = wallClockLimitMs
  const outputLimitBytes = computeOutputLimitBytes(expectedOutputBytes, outputLimitOverride)
  const closeFallbackMs = getJudgeConfig().closeFallbackMs

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
    /** B-P2-13：dsoj-watch 中途 CPU TLE（退出码 152）标志，供墙钟撤销逻辑排除 */
    let cpuTleExit = false
    let runtimeError = false
    let memoryExceeded = false
    let outputLimitExceeded = false
    let cannotStart = false
    let peakMemoryKB = 0
    let cpuTimeMs = 0
    /** wrapper 已写出时间文件（含 CPU=0）；禁止再用 Node 外包墙钟冒充 */
    let cpuSampledFromWrapper = false
    /** dsoj-watch 测得的选手墙钟（ms），与 CPU 分离 */
    let wrapperWallMs = 0
    let exceedsTimeLimit = false
    let abortedBySignal = false
    let startTime = 0
    let endTime = 0
    let retainArtifacts = false

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
    // RLIMIT_CPU 现由 dsoj-watch 的 setrlimit 在子进程中设置（soft=ceil(cpuLimit/1000),
    // hard=soft+1），不再通过 bash ulimit -t（soft=hard 同值导致直接 SIGKILL）。
    // 此参数保留仅为向后兼容 runner.sh 调用签名，实际未被使用。
    const safeCpu = Math.min(
      Math.max(1, Math.ceil(Number(cpuTimeLimitMs) / 1000) || 1),
      300,
    )
    const safeStackMb = 8
    const commandPath =
      typeof runInfo.command === 'string' ? runInfo.command.split(/[\n\r;|&`$()<>]/)[0] : ''
    if (!commandPath || !/^[a-zA-Z0-9_./-]+$/.test(commandPath)) {
      throw new Error(`非法的 command 路径: ${runInfo.command}`)
    }

    const command = 'bash'
    const args = [
      runnerPath,
      String(safeMem),
      String(safeCpu),
      String(safeStackMb),
      commandPath,
      ...runInfo.args,
    ]
    // 禁止继承应用环境：选手程序可读 process.env / getenv，会泄露 JWT_SECRET 等
    const spawnEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      HOME: tempDir,
      LANG: process.env.LANG || 'C.UTF-8',
      TZ: process.env.TZ || 'UTC',
      NODE_ENV: 'production',
      DSOJ_MEM_FILE: memFilePath,
      DSOJ_TIME_FILE: timeFilePath,
      DSOJ_STDIN_FILE: workingInputPath,
      DSOJ_STDOUT_FILE: outputPath,
      DSOJ_STDERR_FILE: errorPath,
      DSOJ_OUTPUT_LIMIT_BYTES: String(Math.max(1024, outputLimitBytes)),
      DSOJ_CPU_LIMIT_MS: String(Math.max(1, cpuTimeLimitMs)),
      // runner 内墙钟硬杀：比 Node setTimeout 更及时（事件循环忙碌时也生效）
      DSOJ_WALL_LIMIT_MS: String(Math.max(1, hardTimeoutMs)),
    }
    // B-P1-5：ulimit -v 仅对编译型语言（C/C++）启用；
    // Python 解释器 VmSize 基础占用高，RLIMIT_AS 会让小内存题目启动即崩
    if (shouldForceUlimitV(language)) {
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
      /** Node 原始 exit code；用于区分「真·正常退出 0」与「code=null 被归一成 0」 */
      let rawExitCode: number | null = 0
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
        const finalCode = savedExitCode ?? 0
        exitCode = finalCode

        if (abortedBySignal) {
          timeout = false
          memoryExceeded = false
          outputLimitExceeded = false
          runtimeError = false
          exceedsTimeLimit = false
          resolve()
          return
        }

        // wrapper 写出的峰值内存（RssAnon）/ CPU·墙钟（wait4 + monotonic）
        const fileMem = readMemFileKB(memFilePath)
        if (fileMem > 0 && fileMem > peakMemoryKB) peakMemoryKB = fileMem
        const timePair = readTimeFilePair(timeFilePath)
        if (timePair) {
          // 真实 CPU（可为 0）；墙钟单独保留，不把墙钟冒充成 CPU
          cpuTimeMs = Math.max(0, timePair.cpuMs)
          wrapperWallMs = Math.max(0, timePair.wallMs)
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

        // 不再用 Node 外包墙钟冒充 CPU（含 spawn/bash 开销，非真实选手时间）

        // 信号分类（HOJ SandboxRun 信号表）：
        //   152 = SIGXCPU → CPU TLE（dsoj-watch setrlimit / jiffies 粗测）
        //   153 = SIGXFSZ → OLE（输出超限）
        //   137 = SIGKILL → 墙钟强杀 / ulimit -v；用峰值、CPU、墙钟区分 MLE vs TLE
        const wallMs = wrapperWallMs > 0 ? wrapperWallMs : Math.max(0, endTime - startTime)

        // 选手已正常退出(0)：墙钟定时器晚到的竞态不得改判 TLE
        if (rawExitCode === 0) {
          savedTimeout = false
          timeout = false
        }

        if (finalCode === 153 || outputLimitExceeded) {
          outputLimitExceeded = true
          memoryExceeded = false
          savedTimeout = false
        } else if (finalCode === 152) {
          savedTimeout = true
          cpuTleExit = true
        } else if (finalCode === 137) {
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
        } else if (rawExitCode === null && (savedForceKilled || savedTimeout)) {
          // 强杀且 Node 未给出 code（也无 signal 映射）→ 按超时，避免误报 RE
          savedTimeout = true
        }

        // 必须回写 timeout：judger 只看 executeResult.timeout
        if (savedTimeout) {
          timeout = true
          memoryExceeded = false
        }

        // 状态判定优先级：TLE > OLE > MLE > RE（null 已归一化，勿用 !== 0 误伤）
        if (!savedTimeout && !outputLimitExceeded && !memoryExceeded && finalCode !== 0) {
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

      childProcess.on('exit', (code, signalName) => {
        if (exited) return
        exited = true
        // 仅保存状态，不执行 endTime/resolve，等待 close 事件
        // （close 在所有 stdio 流关闭后触发，确保 stdout 已刷盘）
        // SIGKILL 时 code=null，必须映射为 128+signo，否则 null!==0 会误报 RE
        rawExitCode = code
        savedExitCode = normalizeChildExitCode(code, signalName)
        savedForceKilled = forceKilled
        savedTimeout = timeout
        // P1-5: exit 比 close 更早触发；启动兜底定时器，
        // 若 close 因孙进程继承 stdout fd 而永不触发，则在 2s 后强制 resolve
        fallbackTimer = setTimeout(() => {
          if (!resolved) {
            logger.debug(`close 事件超时未触发，强制 resolve（孙进程可能持有 fd）`)
            finishResolve()
          }
        }, closeFallbackMs)
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
        cpuTimeMs = Math.max(0, timePair.cpuMs)
        if (timePair.wallMs > 0) wrapperWallMs = timePair.wallMs
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

    // 保留输出文件供 judger 流式比对（调用方 cleanupExecuteArtifacts）
    retainArtifacts = true

    if (!startTime) startTime = Date.now()
    if (!endTime) endTime = Date.now()
    /**
     * 真实 CPU（wait4）与展示时间分离：
     * - TLE / 临界重测一律看 realCpuMs
     * - 展示：CPU>0 用 CPU；否则用 wrapper 选手墙钟；绝不伪造 1ms / Node 墙钟
     */
    const realCpuMs = Math.max(0, Math.round(cpuTimeMs))
    let preciseTime: number
    if (cpuSampledFromWrapper) {
      preciseTime = realCpuMs > 0 ? realCpuMs : Math.max(0, Math.round(wrapperWallMs))
    } else if (realCpuMs > 0) {
      preciseTime = realCpuMs
    } else {
      preciseTime = 0
      if (!abortedBySignal) {
        logger.warn('未采到选手时间，记为 0', { language, platform: process.platform })
      }
    }
    // 后续 TLE 判定使用真实 CPU
    cpuTimeMs = realCpuMs

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
    // B-P2-13：仅"墙钟真正到达限制"（Node 定时器强杀 savedForceKilled，
    // 或墙钟接近 hardTimeout）才允许撤销；CPU TLE(152) 与资源超限被杀
    // （RLIMIT_CPU 硬限制 SIGKILL=137，wallMs 远小于 hardTimeout）必须保持
    // TLE——否则输出不完整会被误判成 WA。
    if (timeout && !abortedBySignal) {
      const outSize = existsSync(outputPath) ? statSync(outputPath).size : 0
      const childWall = wrapperWallMs > 0 ? wrapperWallMs : Math.max(0, endTime - startTime)
      const isCpuTle = cpuTleExit
      const isWallTimeout = forceKilled || childWall >= hardTimeoutMs * 0.95
      if (!isCpuTle && isWallTimeout && outSize > 0 && realCpuMs > 0 && realCpuMs <= timeLimit) {
        logger.info('墙钟超时但 CPU 未超限且已有输出，按 IO 密集处理', {
          realCpuMs,
          timeLimit,
          wallMs: childWall,
          outSize,
        })
        timeout = false
      } else if (!isCpuTle && isWallTimeout && outSize > 0 && realCpuMs > timeLimit && realCpuMs <= cpuTimeLimitMs) {
        logger.info('墙钟超时且 CPU 处于浮动窗口，转临界 TLE', {
          realCpuMs,
          timeLimit,
          cpuTimeLimitMs,
        })
        timeout = false
        exceedsTimeLimit = true
      }
    }

    // 内存采集失败时返回 0（不再使用伪造值），并记录警告
    if (peakMemoryKB === 0) {
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
      cpuTime: abortedBySignal ? 0 : realCpuMs,
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
