import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 格式化运行时长（毫秒 → 可读字符串）
 * 用于评测耗时、执行时间等场景
 */
export function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * 格式化内存（KB → 可读字符串）
 */
export function formatMemory(kb: number): string {
  if (kb <= 0) return '0KB'
  if (kb < 1024) return `${kb}KB`
  return `${(kb / 1024).toFixed(2)}MB`
}

/**
 * 统一格式化日期时间：YYYY-MM-DD HH:mm
 * 用于提交时间、创建时间、公告发布时间等需要精确到分钟的场景
 */
export function formatDateTime(date: Date | string | number): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${M}-${day} ${h}:${min}`
}

/**
 * 统一格式化日期：YYYY-MM-DD
 * 用于加入日期、截止日期等只需日期的场景
 */
export function formatDate(date: Date | string | number): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${M}-${day}`
}

/**
 * 格式化日期时间（短格式）：MM-DD HH:mm
 * 用于竞赛时间范围、提交记录紧凑展示等需要省略年份的场景
 */
export function formatDateTimeShort(date: Date | string | number): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${M}-${day} ${h}:${min}`
}

/**
 * 相对时间格式化：刚刚 / X分钟前 / X小时前 / X天前 / YYYY-MM-DD
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`

  return formatDate(d)
}

