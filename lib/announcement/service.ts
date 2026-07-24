/**
 * 系统公告
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { logger } from '@/lib/logger'

const PUBLIC_LIST_TTL = 60_000

export interface PublicAnnouncementItem {
  id: string
  title: string
  content: string
  isPinned: boolean
  publishedAt: string | null
  createdAt: string
}

export interface PublicAnnouncementDetail extends PublicAnnouncementItem {
  authorName: string
}

export interface AdminAnnouncementItem {
  id: string
  title: string
  content: string
  isPinned: boolean
  isPublished: boolean
  publishedAt: string | null
  expiresAt: string | null
  authorId: string
  authorName: string
  createdAt: string
  updatedAt: string
}

function isActive(now: Date, publishedAt: Date | null, expiresAt: Date | null): boolean {
  if (publishedAt && publishedAt > now) return false
  if (expiresAt && expiresAt < now) return false
  return true
}

/** 首页 / 公开：已发布且在有效期内 */
export async function listPublicAnnouncements(limit = 8): Promise<PublicAnnouncementItem[]> {
  return cache.get('announcement:public', [limit], async () => {
    const now = new Date()
    const rows = await prisma.systemAnnouncement.findMany({
      where: {
        isPublished: true,
        AND: [
          {
            OR: [
              { publishedAt: null },
              { publishedAt: { isSet: false } },
              { publishedAt: { lte: now } },
            ],
          },
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { isSet: false } },
              { expiresAt: { gte: now } },
            ],
          },
        ],
      },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        content: true,
        isPinned: true,
        publishedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return rows
      .filter((r) => isActive(now, r.publishedAt, r.expiresAt))
      .map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        isPinned: r.isPinned,
        publishedAt: r.publishedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      }))
  }, { ttl: PUBLIC_LIST_TTL })
}

/** 公开公告详情（仅已发布且在有效期内） */
export async function getPublicAnnouncementById(id: string): Promise<PublicAnnouncementDetail | null> {
  const now = new Date()
  const row = await prisma.systemAnnouncement.findFirst({
    where: {
      id,
      isPublished: true,
      AND: [
        {
          OR: [
            { publishedAt: null },
            { publishedAt: { isSet: false } },
            { publishedAt: { lte: now } },
          ],
        },
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { isSet: false } },
            { expiresAt: { gte: now } },
          ],
        },
      ],
    },
    include: {
      author: { select: { username: true, nickname: true } },
    },
  })
  if (!row || !isActive(now, row.publishedAt, row.expiresAt)) return null
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    isPinned: row.isPinned,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    authorName: row.author.nickname || row.author.username,
  }
}

export async function listAllAnnouncementsForAdmin(): Promise<AdminAnnouncementItem[]> {
  const rows = await prisma.systemAnnouncement.findMany({
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    include: {
      author: { select: { username: true, nickname: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    isPinned: r.isPinned,
    isPublished: r.isPublished,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    authorId: r.authorId,
    authorName: r.author.nickname || r.author.username,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

export async function createAnnouncement(input: {
  title: string
  content: string
  isPinned?: boolean
  isPublished?: boolean
  publishedAt?: Date | null
  expiresAt?: Date | null
  authorId: string
}) {
  clearAnnouncementCache()
  const now = new Date()
  const published = input.isPublished ?? false
  const created = await prisma.systemAnnouncement.create({
    data: {
      title: input.title.trim(),
      content: input.content,
      isPinned: input.isPinned ?? false,
      isPublished: published,
      publishedAt: published ? (input.publishedAt ?? now) : input.publishedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      authorId: input.authorId,
    },
  })

  // 实时推送：仅当公告已发布且在有效期内时推送 'published' 事件
  if (
    isPubliclyVisible(
      created.isPublished,
      created.publishedAt,
      created.expiresAt,
      now
    )
  ) {
    void broadcastAnnouncementChange({
      type: 'published',
      id: created.id,
      title: created.title,
    })
  }

  return created
}

export async function updateAnnouncement(
  id: string,
  input: {
    title?: string
    content?: string
    isPinned?: boolean
    isPublished?: boolean
    publishedAt?: Date | null
    expiresAt?: Date | null
  }
) {
  clearAnnouncementCache()
  const existing = await prisma.systemAnnouncement.findUnique({ where: { id } })
  if (!existing) return null

  let publishedAt = input.publishedAt
  if (input.isPublished === true && !existing.publishedAt && publishedAt === undefined) {
    publishedAt = new Date()
  }
  if (input.isPublished === false) {
    publishedAt = null
  }

  const updated = await prisma.systemAnnouncement.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
    },
  })

  // 实时推送：根据状态变化决定事件类型
  const now = new Date()
  const wasVisible = isPubliclyVisible(existing.isPublished, existing.publishedAt, existing.expiresAt, now)
  const nowVisible = isPubliclyVisible(updated.isPublished, updated.publishedAt, updated.expiresAt, now)

  if (!wasVisible && nowVisible) {
    // 从不可见变为可见：等同于新发布
    void broadcastAnnouncementChange({
      type: 'published',
      id: updated.id,
      title: updated.title,
    })
  } else if (wasVisible && !nowVisible) {
    // 从可见变为不可见：撤回
    void broadcastAnnouncementChange({ type: 'unpublished', id: updated.id })
  } else if (wasVisible && nowVisible) {
    // 仍然可见，但内容可能变化：更新事件
    void broadcastAnnouncementChange({ type: 'updated', id: updated.id })
  }
  // 不可见 → 不可见：不推送（用户感知不到变化）

  return updated
}

export async function deleteAnnouncement(id: string) {
  clearAnnouncementCache()
  // 先查询公告状态，删除后广播（删除已发布且可见的公告才需要通知前端刷新）
  const existing = await prisma.systemAnnouncement.findUnique({ where: { id } })
  await prisma.systemAnnouncement.delete({ where: { id } })

  if (existing) {
    const now = new Date()
    if (isPubliclyVisible(existing.isPublished, existing.publishedAt, existing.expiresAt, now)) {
      void broadcastAnnouncementChange({ type: 'deleted', id })
    }
  }
}

function clearAnnouncementCache() {
  cache.deleteByPrefix('announcement:')
}

/**
 * 公告变更类型（用于 WebSocket 推送，前端按类型决定是否弹 toast）
 * - 'published'：新发布公告（已发布且在有效期内）→ 前端弹 toast 提示
 * - 'updated'：公告更新（标题/内容/置顶/有效期等）→ 前端静默刷新列表
 * - 'deleted'：公告删除 → 前端静默刷新列表
 * - 'unpublished'：公告从已发布变为未发布 → 前端静默刷新列表
 */
export type AnnouncementChangeEvent =
  | { type: 'published'; id: string; title: string }
  | { type: 'unpublished'; id: string }
  | { type: 'updated'; id: string }
  | { type: 'deleted'; id: string }

/**
 * 广播公告变更事件到所有在线用户
 *
 * 实现要点：
 *   - 复用 lib/websocket/server.broadcastMessage（房间隔离的 'broadcast:public'）
 *   - 动态 import 避免循环依赖（service ←→ websocket server）
 *   - WebSocket 服务可能未启动（如构建阶段），失败静默忽略
 */
async function broadcastAnnouncementChange(event: AnnouncementChangeEvent) {
  try {
    const { broadcastMessage } = await import('@/lib/websocket/server')
    broadcastMessage('announcement:update', event)
    logger.debug('公告事件已广播', { type: event.type, id: event.id })
  } catch (err) {
    // WebSocket 服务未启动或其它错误，不阻塞公告 CRUD
    logger.debug('公告事件广播失败（WebSocket 可能未启动）', {
      type: event.type,
      id: event.id,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** 判断公告是否对公开用户可见（已发布且在有效期内） */
function isPubliclyVisible(
  isPublished: boolean,
  publishedAt: Date | null,
  expiresAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!isPublished) return false
  return isActive(now, publishedAt, expiresAt)
}