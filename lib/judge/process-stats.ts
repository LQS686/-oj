import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'

/**
 * 自适应超时缓冲：extraTime = ceil(max(2000, timeLimit * 2) * extraTimeRatio)
 * 强制杀死窗口为 timeLimit + extraTime
 */
export function computeExtraTime(timeLimit: number, extraTimeRatio: number): number {
  return Math.ceil(Math.max(2000, timeLimit * 2) * extraTimeRatio)
}

/**
 * 解析 /proc/[pid]/stat 获取 utime + stime 累计毫秒
 * 字段 14 (utime) + 15 (stime)，单位为 clock ticks（CLK_TCK 通常为 100）
 * comm (字段 2) 可能包含空格或括号，使用 lastIndexOf(')') 切分
 * 失败返回 -1
 */
export function readProcCpuTimeMs(pid: number): number {
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
export function readProcVmHwmKB(pid: number): number {
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
 * 读取评测 wrapper 写出的整数统计文件（内存 KB / 时间 ms）
 * Linux: /usr/bin/time；Windows: win-runner.exe GetProcessMemoryInfo / GetProcessTimes
 */
export function readStatFileInt(filePath: string): number {
  try {
    if (!filePath) return -1
    const raw = readFileSync(filePath, 'utf-8').trim()
    if (!raw) return -1
    // 兼容 "1234" / "1234\n" / "Maximum RSS: 1234"
    const match = raw.match(/(\d+)/)
    if (!match) return -1
    const n = parseInt(match[1], 10)
    if (!Number.isFinite(n) || n < 0) return -1
    return n
  } catch {
    return -1
  }
}

/** @deprecated 使用 readStatFileInt */
export function readMemFileKB(memFilePath: string): number {
  return readStatFileInt(memFilePath)
}

/** wrapper 写出的选手进程 CPU 时间（ms） */
export function readTimeFileMs(timeFilePath: string): number {
  return readStatFileInt(timeFilePath)
}

/**
 * Windows: 通过 PowerShell 读取 PeakWorkingSet64（KB）
 * PeakWorkingSet 是进程生命周期峰值，比 WorkingSet / tasklist 更适合 OJ 统计。
 * 失败返回 -1
 */
export function readWindowsProcessMemoryKB(pid: number): number {
  try {
    const safePid = Math.floor(pid)
    if (!Number.isFinite(safePid) || safePid <= 0) return -1

    // PeakWorkingSet64 优先；进程刚退出时 Get-Process 可能失败，再回退 WorkingSet64
    const script = [
      `$p = Get-Process -Id ${safePid} -ErrorAction SilentlyContinue`,
      'if ($null -eq $p) { exit 2 }',
      '$peak = $p.PeakWorkingSet64',
      'if ($peak -le 0) { $peak = $p.WorkingSet64 }',
      '[int][math]::Round($peak / 1024)',
    ].join('; ')

    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        timeout: 2000,
        windowsHide: true,
      }
    )
    if (result.status !== 0 || !result.stdout) {
      // PowerShell 不可用时回退 tasklist（当前工作集，非峰值）
      return readWindowsMemoryViaTasklist(safePid)
    }
    const mem = parseInt(String(result.stdout).trim(), 10)
    if (Number.isNaN(mem) || mem < 0) return -1
    return mem
  } catch {
    return -1
  }
}

function readWindowsMemoryViaTasklist(pid: number): number {
  try {
    const result = spawnSync('tasklist', ['/fi', `PID eq ${pid}`, '/fo', 'csv', '/nh'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 2000,
      windowsHide: true,
    })
    if (result.status !== 0 || !result.stdout) return -1
    const line = result.stdout.trim().split('\n')[0]
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
