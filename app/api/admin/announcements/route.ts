/**
 * /api/admin/announcements — 系统公告管理
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { isSystemAdmin } from '@/lib/permissions'
import {
  createAnnouncement,
  listAllAnnouncementsForAdmin,
} from '@/lib/announcement/service'

export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) throw403('需要系统管理员权限')
  const items = await listAllAnnouncementsForAdmin()
  return ok({ items })
})

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (!isSystemAdmin(user)) throw403('需要系统管理员权限')

  const body = await readJson<{
    title?: string
    content?: string
    isPinned?: boolean
    isPublished?: boolean
    publishedAt?: string | null
    expiresAt?: string | null
  }>(req)

  if (!body.title?.trim()) throw400('MISSING_TITLE', '请填写公告标题')
  if (!body.content?.trim()) throw400('MISSING_CONTENT', '请填写公告内容')

  const created = await createAnnouncement({
    title: body.title,
    content: body.content,
    isPinned: body.isPinned,
    isPublished: body.isPublished,
    publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    authorId: user.id,
  })

  return ok({ id: created.id }, { status: 201 })
})