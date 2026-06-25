/**
 * 系统公告
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'

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
          { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
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
        { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
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
  return prisma.systemAnnouncement.create({
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

  return prisma.systemAnnouncement.update({
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
}

export async function deleteAnnouncement(id: string) {
  clearAnnouncementCache()
  await prisma.systemAnnouncement.delete({ where: { id } })
}

function clearAnnouncementCache() {
  cache.deleteByPrefix('announcement:')
}