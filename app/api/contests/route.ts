/**
 * /api/contests - 竞赛列表/创建
 *
 * GET    获取公开竞赛列表（支持登录用户 isRegistered 标记）
 * POST   创建竞赛（需登录）
 *
 * 迁移到 withApi 中间件模式
 */
import { withApi, ok, readJson, readQuery } from '@/lib/api/withApi'
import { toInt } from '@/lib/api/validation'
import { createContestDirect } from '@/lib/mongodb-direct'
import { listPublicContests } from '@/lib/contest/service'
import { getUserFromRequest } from '@/lib/auth'

// GET /api/contests - 获取竞赛列表
export const GET = withApi.public(async (req) => {
  const q = readQuery<{ page?: string; limit?: string; status?: string; keyword?: string }>(req)
  const page = toInt(q.page, 'page', 1)
  const limit = Math.min(toInt(q.limit, 'limit', 20), 50)
  const status = q.status as 'ongoing' | 'upcoming' | 'ended' | undefined
  const keyword = q.keyword

  // 公开路由不强制登录，但若用户已登录则附带 isRegistered
  const session = getUserFromRequest(req)
  const data = await listPublicContests(
    { page, limit, status, keyword },
    session?.userId
  )
  return ok(data)
})

// POST /api/contests - 创建竞赛
export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{
    title: string
    description?: string
    type?: string
    startTime: string
    endTime: string
    duration?: number
    isPublic?: boolean
    password?: string
    problemIds?: string[]
  }>(req)

  // Use direct helper to avoid Prisma transaction issues on non-replica set MongoDB
  const contest = await createContestDirect({
    title: body.title,
    description: body.description ?? '',
    type: body.type || 'OI',
    startTime: new Date(body.startTime),
    endTime: new Date(body.endTime),
    duration: body.duration ?? 0,
    isPublic: body.isPublic ?? true,
    password: body.password,
    authorId: user.id,
    problemIds: body.problemIds,
  })

  return ok(contest, { status: 201 })
})

