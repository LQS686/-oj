/**
 * Special Judge（Testlib checker）
 * 约定对齐洛谷 / Codeforces：
 *   - 仅 C++，编译参数 g++ -fno-asm -std=c++14 -O2
 *   - 运行：./checker <input> <user_output> <answer>
 *   - 退出码：0=AC, 1=WA, 2=PE, 3=Fail(SE), 7=部分分(PC)
 *   - quitp(ratio, ...) 的 ratio∈[0,1] 表示该测点得分比例
 */
import { writeFile, mkdir, unlink, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { join, dirname } from 'path'
import * as crypto from 'crypto'
import { logger } from '@/lib/logger'
import { CompileState } from './types'
import type { CompareResult, ResultState } from './types'
import type { CompileResult } from './compiler'

/** SPJ 源码体积上限（512 KiB） */
export const SPJ_CODE_MAX_BYTES = 512 * 1024
/** checker 运行时间上限（墙钟，毫秒） */
const SPJ_WALL_LIMIT_MS = 15_000
/** checker 内存上限（MB） */
const SPJ_MEMORY_MB = 512

const TESTLIB_PATH = join(process.cwd(), 'lib', 'judge', 'testlib.h')

export function isSpecialJudgeMode(mode: string | undefined | null): boolean {
  return mode === 'special-judge'
}

/**
 * 编译 Testlib checker（对齐洛谷：g++ -fno-asm -std=c++14 -O2）
 */
export async function compileSpj(spjCode: string): Promise<CompileResult> {
  if (!spjCode || !spjCode.trim()) {
    return {
      success: false,
      compileState: CompileState.NoValidSourceFile,
      error: 'Special Judge 代码为空',
    }
  }
  if (Buffer.byteLength(spjCode, 'utf8') > SPJ_CODE_MAX_BYTES) {
    return {
      success: false,
      compileState: CompileState.CompileError,
      error: `Special Judge 代码过大（上限 ${SPJ_CODE_MAX_BYTES} 字节）`,
    }
  }
  if (!existsSync(TESTLIB_PATH)) {
    return {
      success: false,
      compileState: CompileState.InvalidCompiler,
      error: '缺少 testlib.h，无法编译 Special Judge',
    }
  }

  const tempDir = join(process.cwd(), 'temp', 'judge')
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true })
  }

  const id = `spj_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
  const sourcePath = join(tempDir, `${id}.cpp`)
  const outputPath = join(tempDir, id)

  try {
    await writeFile(sourcePath, spjCode, 'utf8')
    // 将 testlib.h 放在同目录，兼容 #include "testlib.h"
    const localTestlib = join(tempDir, 'testlib.h')
    if (!existsSync(localTestlib)) {
      const { copyFile } = await import('fs/promises')
      await copyFile(TESTLIB_PATH, localTestlib)
    }

    const args = [
      '-fno-asm',
      '-std=c++14',
      '-O2',
      '-w',
      '-fmax-errors=5',
      `-I${tempDir}`,
      sourcePath,
      '-o',
      outputPath,
    ]

    const { exitCode, stderr } = await spawnCapture('g++', args, 30_000, tempDir, undefined, judgeSpawnEnv(tempDir))
    if (exitCode !== 0) {
      const filtered = stderr
        .replace(/(?:[a-zA-Z]:)?[^\s:]*temp[\\/]judge[\\/][^\s:]+/g, 'checker.cpp')
        .replace(/spj_\d+_[a-z0-9]+/g, 'checker')
        .slice(0, 4000)
      return {
        success: false,
        compileState: CompileState.CompileError,
        error: 'Special Judge 编译失败',
        stderr: filtered,
      }
    }

    return {
      success: true,
      compileState: CompileState.CompileSuccessfully,
      compiledPath: outputPath,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('SPJ 编译异常', { error: msg })
    return {
      success: false,
      compileState: CompileState.InvalidCompiler,
      error: `Special Judge 编译异常: ${msg}`,
    }
  } finally {
    try {
      if (existsSync(sourcePath)) await unlink(sourcePath)
    } catch {
      /* ignore */
    }
  }
}

export async function cleanupSpj(compiledPath?: string | null): Promise<void> {
  if (!compiledPath) return
  try {
    if (existsSync(compiledPath)) await unlink(compiledPath)
  } catch {
    /* ignore */
  }
}

export interface RunSpjInput {
  checkerPath: string
  inputPath: string
  userOutputPath: string
  answerPath: string
  fullScore: number
  /** 可选：工作目录（默认 checker 所在目录） */
  workDir?: string
  signal?: AbortSignal
}

/**
 * 运行 Testlib checker，解析退出码与部分分。
 */
export async function runSpj(input: RunSpjInput): Promise<CompareResult> {
  const {
    checkerPath,
    inputPath,
    userOutputPath,
    answerPath,
    fullScore,
    workDir,
    signal,
  } = input

  if (signal?.aborted) {
    return { score: 0, status: 'SE', message: '评测已中止' }
  }
  if (!existsSync(checkerPath)) {
    return { score: 0, status: 'SE', message: 'Special Judge 可执行文件不存在' }
  }
  for (const [label, p] of [
    ['输入', inputPath],
    ['选手输出', userOutputPath],
    ['标准答案', answerPath],
  ] as const) {
    if (!existsSync(p)) {
      return { score: 0, status: 'SE', message: `Special Judge 缺少${label}文件` }
    }
  }

  const cwd = workDir || dirname(checkerPath)
  const stderrPath = join(cwd, `spj_err_${crypto.randomBytes(4).toString('hex')}.txt`)
  const stdoutPath = join(cwd, `spj_out_${crypto.randomBytes(4).toString('hex')}.txt`)
  const runnerPath = join(process.cwd(), 'lib', 'judge', 'runner.sh')
  const useRunner = process.platform === 'linux' && existsSync(runnerPath)

  try {
    let exitCode = 1
    let stderr = ''
    let stdout = ''

    if (useRunner) {
      const result = await runViaRunner({
        runnerPath,
        checkerPath,
        inputPath,
        userOutputPath,
        answerPath,
        cwd,
        stdoutPath,
        stderrPath,
        signal,
      })
      exitCode = result.exitCode
      stderr = result.stderr
      stdout = result.stdout
    } else {
      const result = await spawnCapture(
        checkerPath,
        [inputPath, userOutputPath, answerPath],
        SPJ_WALL_LIMIT_MS,
        cwd,
        signal,
        judgeSpawnEnv(cwd),
      )
      exitCode = result.exitCode
      stderr = result.stderr
      stdout = result.stdout
    }

    return parseSpjExit(exitCode, stdout, stderr, fullScore)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (signal?.aborted || /aborted|中止/i.test(msg)) {
      return { score: 0, status: 'SE', message: '评测已中止' }
    }
    logger.error('SPJ 运行异常', { error: msg })
    return { score: 0, status: 'SE', message: `Special Judge 运行异常: ${msg}` }
  } finally {
    for (const p of [stderrPath, stdoutPath]) {
      try {
        if (existsSync(p)) await unlink(p)
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 若选手输出仅在内存中，先落到临时文件供 checker 读取。
 */
export async function ensureUserOutputFile(
  userOutputPath: string | undefined,
  userOutput: string | undefined,
  workDir: string,
): Promise<{ path: string; ephemeral: boolean }> {
  if (userOutputPath && existsSync(userOutputPath)) {
    return { path: userOutputPath, ephemeral: false }
  }
  if (!existsSync(workDir)) {
    await mkdir(workDir, { recursive: true })
  }
  const path = join(workDir, `user_out_${crypto.randomBytes(4).toString('hex')}.txt`)
  await writeFile(path, userOutput ?? '', 'utf8')
  return { path, ephemeral: true }
}

export function parseSpjExit(
  exitCode: number,
  stdout: string,
  stderr: string,
  fullScore: number,
): CompareResult {
  const message = truncateMessage(pickSpjMessage(stdout, stderr))

  // Testlib 标准退出码
  switch (exitCode) {
    case 0:
      return { score: fullScore, status: 'AC', message: message || 'OK' }
    case 1:
      return { score: 0, status: 'WA', message: message || 'Wrong Answer' }
    case 2:
      // 洛谷不单独展示 PE，但本站已有 PE 状态，保留以便诊断
      return { score: 0, status: 'PE', message: message || 'Presentation Error' }
    case 3:
      return {
        score: 0,
        status: 'SE',
        message: message ? `Special Judge 异常: ${message}` : 'Special Judge 异常 (_fail)',
      }
    case 4:
      return { score: 0, status: 'PE', message: message || 'Wrong output format (dirt)' }
    case 7: {
      const ratio = extractPointsRatio(stdout, stderr, message)
      if (ratio == null) {
        return {
          score: 0,
          status: 'SE',
          message: message
            ? `Special Judge 返回部分分但无法解析分数: ${message}`
            : 'Special Judge 返回部分分但无法解析分数',
        }
      }
      const score = Math.max(0, Math.min(fullScore, Math.round(fullScore * ratio)))
      const status: ResultState = score >= fullScore && fullScore > 0 ? 'AC' : score > 0 ? 'PC' : 'WA'
      return {
        score,
        status,
        message: message || `Partially correct (${ratio})`,
      }
    }
    case 8:
      return { score: 0, status: 'WA', message: message || 'Unexpected EOF' }
    default:
      // 超时/信号等
      if (exitCode === 152 || exitCode === 137 || exitCode >= 128) {
        return {
          score: 0,
          status: 'SE',
          message: `Special Judge 超时或被终止 (exit=${exitCode})`,
        }
      }
      return {
        score: 0,
        status: 'SE',
        message: message
          ? `Special Judge 未知退出码 ${exitCode}: ${message}`
          : `Special Judge 未知退出码 ${exitCode}`,
      }
  }
}

/** quitp 写入的比例：优先解析消息开头的浮点数，其次扫描 points/partial */
function extractPointsRatio(stdout: string, stderr: string, message: string): number | null {
  const blobs = [message, stdout, stderr]
  for (const text of blobs) {
    const trimmed = text.trim()
    if (!trimmed) continue
    // "0.5 message..." 或 "points 0.5"
    const head = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)\b/)
    if (head) {
      const v = Number(head[1])
      if (Number.isFinite(v) && v >= 0 && v <= 1) return v
    }
    const labeled = trimmed.match(/(?:points|partial|ratio)\s*[=:]?\s*([0-9]+(?:\.[0-9]+)?)/i)
    if (labeled) {
      const v = Number(labeled[1])
      if (Number.isFinite(v) && v >= 0 && v <= 1) return v
      // 个别实现可能给 0..100 百分数
      if (Number.isFinite(v) && v > 1 && v <= 100) return v / 100
    }
  }
  return null
}

function pickSpjMessage(stdout: string, stderr: string): string {
  // Testlib 主信息在 stderr；stdout 可能只有 points
  const err = stderr.replace(/\u001b\[[0-9;]*m/g, '').trim()
  const out = stdout.replace(/\u001b\[[0-9;]*m/g, '').trim()
  if (err) return err
  return out
}

function truncateMessage(msg: string, max = 2000): string {
  if (msg.length <= max) return msg
  return msg.slice(0, max) + '\n[已截断]'
}

async function runViaRunner(opts: {
  runnerPath: string
  checkerPath: string
  inputPath: string
  userOutputPath: string
  answerPath: string
  cwd: string
  stdoutPath: string
  stderrPath: string
  signal?: AbortSignal
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const binName = opts.checkerPath.includes('/') || opts.checkerPath.includes('\\')
    ? opts.checkerPath
    : `./${opts.checkerPath}`

  const args = [
    opts.runnerPath,
    String(SPJ_MEMORY_MB),
    String(Math.ceil(SPJ_WALL_LIMIT_MS / 1000)),
    '8',
    binName,
    opts.inputPath,
    opts.userOutputPath,
    opts.answerPath,
  ]

  const emptyIn = join(opts.cwd, `spj_empty_${crypto.randomBytes(3).toString('hex')}.in`)
  await writeFile(emptyIn, '', 'utf8')

  try {
    const env: NodeJS.ProcessEnv = {
      ...judgeSpawnEnv(opts.cwd),
      DSOJ_STDIN_FILE: emptyIn,
      DSOJ_STDOUT_FILE: opts.stdoutPath,
      DSOJ_STDERR_FILE: opts.stderrPath,
      DSOJ_OUTPUT_LIMIT_BYTES: String(2 * 1024 * 1024),
      DSOJ_CPU_LIMIT_MS: String(SPJ_WALL_LIMIT_MS),
      DSOJ_WALL_LIMIT_MS: String(SPJ_WALL_LIMIT_MS),
    }

    const { exitCode } = await spawnCapture('bash', args, SPJ_WALL_LIMIT_MS + 5_000, opts.cwd, opts.signal, env)
    const stdout = existsSync(opts.stdoutPath)
      ? await readFile(opts.stdoutPath, 'utf8').catch(() => '')
      : ''
    const stderr = existsSync(opts.stderrPath)
      ? await readFile(opts.stderrPath, 'utf8').catch(() => '')
      : ''
    return { exitCode, stdout, stderr }
  } finally {
    try {
      if (existsSync(emptyIn)) await unlink(emptyIn)
    } catch {
      /* ignore */
    }
  }
}

/** 禁止继承应用环境，避免 checker/g++ 读到 JWT_SECRET 等 */
function judgeSpawnEnv(cwd: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: cwd,
    LANG: process.env.LANG || 'C.UTF-8',
    TZ: process.env.TZ || 'UTC',
    NODE_ENV: 'production',
  }
}

function spawnCapture(
  cmd: string,
  args: string[],
  timeoutMs: number,
  cwd?: string,
  signal?: AbortSignal,
  env?: NodeJS.ProcessEnv,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'))
      return
    }
    const child = spawn(cmd, args, {
      cwd,
      env: env ?? judgeSpawnEnv(cwd || process.cwd()),
      timeout: timeoutMs,
    })
    let stdout = ''
    let stderr = ''
    const onAbort = () => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout?.on('data', (d) => {
      stdout += d.toString()
      if (stdout.length > 64_000) stdout = stdout.slice(0, 64_000)
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 64_000) stderr = stderr.slice(0, 64_000)
    })
    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort)
      reject(err)
    })
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort)
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })
  })
}
