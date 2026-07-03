/**
 * /api/admin/announcements/[id]
 */
import { withApi, ok, readJson, throw400, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { deleteAnnouncement, updateAnnouncement } from '@/lib/announcement/service'
import { prisma } from '@/lib/prisma'

export const PATCH = withApi.admin(async (req, ctx) => {
  const { id: resolved } = await (ctx as any).params
  if (!isObjectId(resolved)) throw400('INVALID_ID', '无效的公告 ID')

  const existing = await prisma.systemAnnouncement.findUnique({ where: { id: resolved } })
  if (!existing) throw404('公告不存在')

  const body = await readJson<{
    title?: string
    content?: string
    isPinned?: boolean
    isPublished?: boolean
    publishedAt?: string | null
    expiresAt?: string | null
  }>(req)

  const updated = await updateAnnouncement(resolved, {
    title: body.title,
    content: body.content,
    isPinned: body.isPinned,
    isPublished: body.isPublished,
    publishedAt:
      body.publishedAt === undefined
        ? undefined
        : body.publishedAt
          ? new Date(body.publishedAt)
          : null,
    expiresAt:
      body.expiresAt === undefined ? undefined : body.expiresAt ? new Date(body.expiresAt) : null,
  })

  return ok({ id: updated?.id })
})

export const DELETE = withApi.admin(async (_req, ctx) => {
  const { id: resolved } = await (ctx as any).params
  if (!isObjectId(resolved)) throw400('INVALID_ID', '无效的公告 ID')

  const existing = await prisma.systemAnnouncement.findUnique({ where: { id: resolved } })
  if (!existing) throw400('NOT_FOUND', '公告不存在')

  await deleteAnnouncement(resolved)
  return ok({ id: resolved })
})