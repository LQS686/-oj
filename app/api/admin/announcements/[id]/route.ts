/**
 * /api/admin/announcements/[id] — 仅 SYSTEM_ADMIN
 */
import { withApi, ok, readJson, throw400, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { deleteAnnouncement, updateAnnouncement } from '@/lib/announcement/service'
import { prisma } from '@/lib/prisma'

export const PATCH = withApi.systemAdmin(async (req, ctx) => {
  const { id: resolved } = ctx.params
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

  if (body.title !== undefined) {
    const t = body.title.trim()
    if (!t) throw400('MISSING_TITLE', '公告标题不能为空')
    if (t.length > 200) throw400('TITLE_TOO_LONG', '公告标题不能超过 200 字')
  }
  if (body.content !== undefined) {
    if (!body.content.trim()) throw400('MISSING_CONTENT', '公告内容不能为空')
    if (body.content.length > 50_000) throw400('CONTENT_TOO_LONG', '公告内容不能超过 50000 字')
  }

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

export const DELETE = withApi.systemAdmin(async (_req, ctx) => {
  const { id: resolved } = ctx.params
  if (!isObjectId(resolved)) throw400('INVALID_ID', '无效的公告 ID')

  const existing = await prisma.systemAnnouncement.findUnique({ where: { id: resolved } })
  if (!existing) throw404('公告不存在')

  await deleteAnnouncement(resolved)
  return ok({ id: resolved })
})