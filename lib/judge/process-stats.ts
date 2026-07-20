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
 * Windows: 通过 tasklist 获取指定 PID 的当前工作集内存（KB）
 * 用于轮询采集峰值。失败返回 -1
 * 注：tasklist 返回的是当前 WorkingSet，非 PeakWorkingSet；
 * 通过轮询间隔内取最大值近似峰值。Windows 原生 PeakWorkingSet 需要 GetProcessMemoryInfo API，
 * 不引入原生依赖时此为最佳折中。
 */
export function readWindowsProcessMemoryKB(pid: number): number {
  try {
    // pid 来自 process.pid，始终为正整数；显式校验防止命令注入
    const safePid = Math.floor(pid)
    if (!Number.isFinite(safePid) || safePid <= 0) return -1
    // P2 安全修复：改为 spawnSync 数组形式，避免命令拼接注入风险
    const result = spawnSync('tasklist', ['/fi', `PID eq ${safePid}`, '/fo', 'csv', '/nh'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 2000,
    })
    if (result.status !== 0 || !result.stdout) return -1
    const out = result.stdout
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
