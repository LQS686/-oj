import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/api/withApi'
import type { AiLogWithUser, ListUserAiTasksOptions } from './types'
import { commitPreviewedProblem } from './generation'

/**
 * 列出当前用户的 AI 生成日志（支持 take / status / mode 过滤）
 *
 * - 不传 take 时返回全部匹配记录（用于侧栏展示当前功能的完整历史）
 * - mode 过滤通过 params.mode JSON 字段在内存中完成
 *   （Prisma 的 JsonFilter 在 MongoDB 上不支持 path 查询）
 */
export async function listUserAiTasks(userId: string, options: ListUserAiTasksOptions = {}) {
  // 拉取列表前先清理当前用户卡住的任务（>10 分钟未完成的 PENDING/PROCESSING）
  // 避免 dev server 重启或进程崩溃后遗留的僵尸任务导致前端无意义轮询
  await cleanupStuckAiTasks(userId).catch((err) => {
    logger.error('清理卡住 AI 任务失败（不阻塞列表查询）', err)
  })

  const where: Prisma.AiGenerationLogWhereInput = { userId }
  if (options.status) {
    where.status = options.status
  }

  // mode 存储在 params.mode JSON 字段中，Prisma 的 JsonFilter 在 MongoDB 上
  // 不支持 path 过滤，需要先按 userId/status 过滤再在内存中按 mode 过滤
  if (options.mode) {
    const all = await prisma.aiGenerationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    const filtered = all.filter(
      (log) => (log.params as Record<string, unknown> | null)?.mode === options.mode
    )
    // 按 createdAt 降序后截取 take 条（不传 take 则返回全部）
    return options.take ? filtered.slice(0, options.take) : filtered
  }

  return prisma.aiGenerationLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options.take,
  })
}

/**
 * 列出当前用户最近 N 条 AI 生成日志
 * @deprecated 使用 listUserAiTasks 代替；保留为向后兼容别名
 */
export async function listRecentAiLogs(userId: string, take?: number) {
  return listUserAiTasks(userId, { take })
}

/**
 * 列出全部用户的 AI 生成日志（管理员视角，跨用户）
 * - 按 createdAt 降序
 * - 支持可选的 status / userId / model 过滤
 *   （AiGenerationLog 没有独立 model 列，modelId 存在 params JSON 中；
 *    当前 Prisma 客户端的 JsonFilter 不支持 path 过滤，model 过滤在内存中完成）
 * - 分页 + 返回 totalCount
 */
export async function listAllAiLogs(filters: {
  status?: string
  userId?: string
  model?: string
  page: number
  pageSize?: number
}): Promise<{ items: AiLogWithUser[]; totalCount: number }> {
  const page = Math.max(1, Math.floor(filters.page))
  const pageSize = Math.max(1, filters.pageSize ?? 20)

  const where: Prisma.AiGenerationLogWhereInput = {}
  if (filters.status) {
    where.status = filters.status
  }
  if (filters.userId) {
    where.userId = filters.userId
  }

  // model 存在 params.modelId JSON 字段中，JsonFilter 不支持 path 过滤，
  // 需要把 status/userId 过滤后的记录取回内存再过滤 + 分页
  if (filters.model) {
    const all = await prisma.aiGenerationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true } } },
    })
    const filtered = all.filter(
      (log) => (log.params as Record<string, unknown> | null)?.modelId === filters.model
    )
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      totalCount: filtered.length,
    }
  }

  const [items, totalCount] = await Promise.all([
    prisma.aiGenerationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { username: true } } },
    }),
    prisma.aiGenerationLog.count({ where }),
  ])

  return { items, totalCount }
}

/**
 * 获取单条 AI 生成日志
 */
export async function getAiLogById(logId: string) {
  const log = await prisma.aiGenerationLog.findUnique({ where: { id: logId } })
  if (!log) {
    throw new ApiError('NOT_FOUND', 'Log not found', 404)
  }
  return log
}

const STUCK_TIMEOUT_MS = 10 * 60 * 1000

export function isStuckLog(log: { status: string; createdAt: Date }) {
  return (
    (log.status === 'PENDING' || log.status === 'PROCESSING') &&
    Date.now() - new Date(log.createdAt).getTime() > STUCK_TIMEOUT_MS
  )
}

/**
 * 清理卡住的 AI 任务（超时自动销毁）
 *
 * 把超过 STUCK_TIMEOUT_MS（10 分钟）仍处于 PENDING / PROCESSING 状态的任务
 * 标记为 FAILED，避免 dev server 重启或进程崩溃后遗留的僵尸任务
 * 导致前端无意义轮询。
 *
 * @param userId 可选，限定清理某用户的卡住任务；不传则清理全部
 * @returns 清理的记录数
 */
export async function cleanupStuckAiTasks(userId?: string): Promise<number> {
  const since = new Date(Date.now() - STUCK_TIMEOUT_MS)
  const where: Prisma.AiGenerationLogWhereInput = {
    status: { in: ['PENDING', 'PROCESSING'] },
    createdAt: { lt: since },
  }
  if (userId) where.userId = userId

  const stuckLogs = await prisma.aiGenerationLog.findMany({
    where,
    select: { id: true, userId: true, status: true, createdAt: true },
  })

  if (stuckLogs.length === 0) return 0

  const ids = stuckLogs.map(l => l.id)
  const { count } = await prisma.aiGenerationLog.updateMany({
    where: { id: { in: ids } },
    data: {
      status: 'FAILED',
      error: `任务超时（>${Math.round(STUCK_TIMEOUT_MS / 60000)} 分钟未完成，自动标记为失败）`,
      updatedAt: new Date(),
    },
  })

  logger.warn('[ai/service] 清理卡住的 AI 任务', {
    count,
    sampleIds: ids.slice(0, 3),
    oldestCreatedAt: stuckLogs[0]?.createdAt,
  })

  return count
}

/**
 * 服务器启动时重置残留 PENDING/PROCESSING 任务
 *
 * 内存队列（global.__aiQueue）在进程重启后会清空，所有 PENDING/PROCESSING 任务
 * 永远不会被消费，会变成僵尸任务导致前端无意义轮询。
 *
 * 在 server.ts 启动时调用本函数，将这些任务标记为 FAILED，让用户通过 retry 手动重试。
 * 与 cleanupStuckAiTasks 不同的是：本函数不区分创建时间，因为重启即意味着内存队列丢失。
 *
 * 同时清理残留的 Solution 任务记录（status PENDING/PROCESSING）。
 *
 * @returns 重置的记录数
 */
export async function resetStaleTasksOnStartup(): Promise<number> {
  const where: Prisma.AiGenerationLogWhereInput = {
    status: { in: ['PENDING', 'PROCESSING'] },
  }

  const stuckLogs = await prisma.aiGenerationLog.findMany({
    where,
    select: { id: true, userId: true, status: true, params: true, createdAt: true },
  })

  if (stuckLogs.length === 0) return 0

  const ids = stuckLogs.map(l => l.id)
  const { count } = await prisma.aiGenerationLog.updateMany({
    where: { id: { in: ids } },
    data: {
      status: 'FAILED',
      error: '服务器重启导致任务中断，请重试',
      updatedAt: new Date(),
    },
  })

  // mode 存储在 params JSON 字段中，提取用于日志统计
  const modes = Array.from(
    new Set(
      stuckLogs.map(l => (l.params as Record<string, unknown> | null)?.mode).filter(Boolean) as string[]
    )
  )

  logger.warn('[ai/service] 启动时重置残留 AI 任务为 FAILED', {
    count,
    sampleIds: ids.slice(0, 5),
    modes,
    oldestCreatedAt: stuckLogs[0]?.createdAt,
  })

  return count
}

/**
 * 把 modelId 对应偏好统计 +1（不影响主流程，失败时仅日志）
 */
export async function touchAiModelPreference(userId: string, modelId: string) {
  try {
    await prisma.userAiPreference.upsert({
      where: { userId_modelId: { userId, modelId } },
      update: { lastUsed: new Date(), count: { increment: 1 } },
      create: {
        userId,
        modelId,
        count: 1,
        lastUsed: new Date(),
        isDefault: false,
      },
    })
  } catch (e) {
    logger.error('Failed to update preference', e)
  }
}

/**
 * Task 27.6: 清理超时预览任务（供 cron / 定时任务调用）
 *
 * 扫描超 24 小时未确认的预览任务，自动 commit。
 */
export async function cleanupStalePreviewTasks(): Promise<{ committed: number }> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  // 循环清理直至本轮无新增 commit（或达到最大轮次保护）
  // - take 限制为 50 / 轮，避免单次拉取过多记录导致 prisma 内存峰值
  // - 单条 commit 失败不影响其他记录
  // - 最大 20 轮 = 最多 1000 条 / 次调用，覆盖正常业务量；超过则等下次定时任务触发
  const MAX_ROUNDS = 20
  let totalCommitted = 0
  let roundCommitted = 0
  let round = 0

  do {
    round++
    const staleLogs = await prisma.aiGenerationLog.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: { lt: cutoff },
      },
      select: { id: true, result: true },
      take: 50,
    })

    roundCommitted = 0
    for (const log of staleLogs) {
      const result = (log.result as Record<string, unknown>) || {}
      if (result.isPreview && Array.isArray(result.previewProblems) && (result.previewProblems as any[]).length > 0) {
        try {
          await commitPreviewedProblem(log.id)
          totalCommitted++
          roundCommitted++
        } catch (e) {
          logger.warn('[ai/service] 清理超时预览任务失败', { logId: log.id, err: e })
        }
      }
    }
  } while (roundCommitted > 0 && round < MAX_ROUNDS)

  if (totalCommitted > 0) {
    logger.info('[ai/service] 清理超时预览任务完成', {
      committed: totalCommitted,
      rounds: round,
      truncated: roundCommitted > 0 && round >= MAX_ROUNDS,
    })
  }
  return { committed: totalCommitted }
}
