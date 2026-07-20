/**
 * /api/contests/[id] - 竞赛详情/更新/删除
 *
 * GET    获取竞赛详情（公开/按权限）
 * PUT    更新竞赛（创建者或管理员）
 * DELETE 删除竞赛（创建者或管理员）
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { canManageContent, canAccessAdmin } from '@/lib/permissions'
import { isObjectId } from '@/lib/api/validation'
import bcrypt from 'bcryptjs'
import {
  deleteContest,
  ensureContestManageAccess,
  getContestDetailWithRegistration,
  updateContestWithProblems,
} from '@/lib/contest/service'
import { getUserFromRequest } from '@/lib/auth'

// GET /api/contests/[id] - 获取竞赛详情
export const GET = withApi.public(async (req, ctx) => {
  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的竞赛ID')

  const session = getUserFromRequest(req)
  const contest = await getContestDetailWithRegistration(id!, session?.userId)
  if (!contest) throw404('竞赛不存在')
  return ok(contest)
})

// PUT /api/contests/[id] - 更新竞赛信息
export const PUT = withApi.auth(async (req, ctx, { user }) => {
  if (!canManageContent(user)) throw throw403('无权限编辑竞赛')

  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的竞赛ID')

  const adminFlag = canAccessAdmin(user)
  const access = await ensureContestManageAccess(id, user.id, adminFlag)
  if (!access.ok) {
    if (access.status === 404) throw404(access.error)
    throw403(access.error)
  }

  const body = await readJson<{
    title?: string
    description?: string
    type?: string
    startTime?: string
    endTime?: string
    duration?: number
    isPublic?: boolean
    password?: string | null
    problemIds?: string[]
    sealRankTime?: string | null
  }>(req)

  // 密码：null/空 -> null, 有值 -> bcrypt
  let hashedPassword: string | null | undefined
  if (body.password !== undefined) {
    if (body.password === null || body.password === '') {
      hashedPassword = null
    } else {
      hashedPassword = await bcrypt.hash(body.password, 12)
    }
  }

  // 封榜时间：null/空 -> null, 字符串 -> Date
  let sealRankTime: Date | null | undefined
  if (body.sealRankTime !== undefined) {
    if (body.sealRankTime === null || body.sealRankTime === '') {
      sealRankTime = null
    } else {
      const parsed = new Date(body.sealRankTime)
      sealRankTime = isNaN(parsed.getTime()) ? null : parsed
    }
  }

  const updatedContest = await updateContestWithProblems(id!, {
    title: body.title,
    description: body.description,
    type: body.type,
    startTime: body.startTime ? new Date(body.startTime) : undefined,
    endTime: body.endTime ? new Date(body.endTime) : undefined,
    duration: body.duration,
    isPublic: body.isPublic,
    password: hashedPassword as any,
    problemIds: body.problemIds,
    sealRankTime,
  })

  return ok({ ...updatedContest, message: '竞赛更新成功' })
})

// DELETE /api/contests/[id] - 删除竞赛
export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  if (!canManageContent(user)) throw throw403('无权限删除竞赛')

  const { id } = ctx.params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的竞赛ID')

  const adminFlag = canAccessAdmin(user)
  const access = await ensureContestManageAccess(id, user.id, adminFlag)
  if (!access.ok) {
    if (access.status === 404) throw404(access.error)
    throw403(access.error)
  }

  await deleteContest(id)
  return ok({ message: '竞赛删除成功' })
})
