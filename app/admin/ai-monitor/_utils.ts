import type { AiLogItem } from './_types'

export function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return '-'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return `${m}m${rem}s`
  const h = Math.floor(m / 60)
  return `${h}h${m % 60}m`
}

export function extractModel(item: AiLogItem): string {
  return item.params?.modelId || '-'
}

/**
 * Phase 6 Task 35.3: 今日聚合统计（按 createdAt 过滤到今日）
 *
 * 返回各状态计数 + token 总数。
 */
export function computeTodayCounts(items: AiLogItem[]): {
  counts: Record<string, number>
  tokens: number
} {
  const counts: Record<string, number> = {
    PENDING: 0,
    PROCESSING: 0,
    COMPLETED: 0,
    FAILED: 0,
  }
  let tokens = 0
  for (const it of items) {
    if (counts[it.status] !== undefined) counts[it.status]++
    tokens += it.tokensUsed || 0
  }
  return { counts, tokens }
}

/**
 * Phase 6 Task 36.3: 任务链分组（基于 parentLogId）
 *
 * 返回一个数组，每项是一条任务链：
 * - chains: 从根任务（无 parentLogId 或 parent 不在当前页）出发的后代链
 * - orphans: 既不是根、也不是任何链中任务的"孤儿"（理论上不应出现，但兜底处理）
 *
 * 链内顺序：root → child → grandchild → ...
 */
export function groupTaskChains(logs: AiLogItem[]): {
  chains: AiLogItem[][]
  orphans: AiLogItem[]
} {
  const byId = new Map<string, AiLogItem>()
  for (const it of logs) byId.set(it.id, it)

  // 标记哪些任务已在某条链中
  const visited = new Set<string>()
  const chains: AiLogItem[][] = []

  // 先从有 parentLogId 的任务向上找根
  const roots: AiLogItem[] = []
  for (const it of logs) {
    const parentId = it.params?.parentLogId
    if (!parentId || !byId.has(parentId)) {
      // 当前任务本身是根（或父任务不在当前页）
      roots.push(it)
    }
  }

  // 去重 roots（同一任务不应出现两次）
  const seenRoot = new Set<string>()
  for (const root of roots) {
    if (seenRoot.has(root.id)) continue
    seenRoot.add(root.id)

    // BFS 向下找所有后代
    const chain: AiLogItem[] = [root]
    visited.add(root.id)
    let frontier: string[] = [root.id]
    while (frontier.length > 0) {
      const next: string[] = []
      for (const it of logs) {
        if (visited.has(it.id)) continue
        const parentId = it.params?.parentLogId
        if (parentId && frontier.includes(parentId)) {
          chain.push(it)
          visited.add(it.id)
          next.push(it.id)
        }
      }
      frontier = next
    }
    chains.push(chain)
  }

  // 兜底：未访问过的任务（理论上不应出现）
  const orphans = logs.filter((it) => !visited.has(it.id))

  return { chains, orphans }
}
