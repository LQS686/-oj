/**
 * lib/problem/cache-invalidation.ts
 * 题目相关缓存的统一失效入口（byId / statusCounts / stats / tags / 后台列表快照 / 题面详情）。
 *
 * 独立成模块以打破 admin.ts ⇄ testcase.ts 的循环依赖：
 * 题目字段变更（admin/crud/batch/import）与测点变更（testcase）都要失效同一批缓存。
 */
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'

/**
 * 清除单道题目的全部缓存。
 *
 * 注意：
 * - statusCounts / byIdOrNumber 的实际 key 含 contestId/viewerId 或题号变体，需按前缀失效；
 * - adminListSnapshot（后台列表聚合快照）与 tags 是全局聚合，只能按前缀整体失效，
 *   好在 TTL 短（30s/5min），后台操作频率低，整体失效代价可接受。
 */
export function clearProblemCache(problemId: string) {
  cache.delete(CacheKeys.problem.byId(problemId))
  cache.deleteByPrefix(CacheKeys.problem.statusCounts(problemId))
  cache.delete(CacheKeys.problem.stats(problemId))
  cache.deleteByPrefix(CacheKeys.problem.tags())
  cache.deleteByPrefix(CacheKeys.problem.adminListSnapshot())
  cache.deleteByPrefix(CacheKeys.problem.byIdOrNumberPrefix())
}
