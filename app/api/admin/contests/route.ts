/**
 * /api/admin/contests - 管理员竞赛管理
 *
 * GET  竞赛列表
 * POST 创建竞赛
 */
import { withApi, ok, readJson, throw400, throw403 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/contests - 获取竞赛列表（管理员）
 */
export const GET = withApi.auth(async (_req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const contests = await prisma.contest.findMany({
    orderBy: { startTime: 'desc' },
    include: {
      author: {
        select: { username: true },
      },
      _count: {
        select: {
          problems: true,
          participants: true,
        },
      },
    },
  })

  return ok({ data: contests })
})

/**
 * POST /api/admin/contests - 创建竞赛（管理员）
 */
export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const body = await readJson<{
    title?: string
    description?: string
    type?: string
    startTime?: string
    endTime?: string
    isPublic?: boolean
    password?: string
    problems?: string[]
  }>(req)
  const {
    title,
    description,
    type,
    startTime,
    endTime,
    isPublic,
    password,
    problems, // Array of problem IDs
  } = body

  if (!title || !description || !startTime || !endTime || !type) {
    throw400('MISSING_FIELDS', '请填写所有必填字段')
  }

  const start = new Date(startTime!)
  const end = new Date(endTime!)
  const duration = Math.floor((end.getTime() - start.getTime()) / 1000 / 60) // 分钟

  if (duration <= 0) {
    throw400('INVALID_TIME', '结束时间必须晚于开始时间')
  }

  const contest = await prisma.contest.create({
    data: {
      title: title!,
      description: description!,
      type: type!,
      startTime: start,
      endTime: end,
      duration,
      isPublic: isPublic || false,
      password: password || null,
      authorId: user.id,
      problems: {
        create: problems && Array.isArray(problems)
          ? problems.map((problemId: string, index: number) => ({
              problemId: problemId,
              orderIndex: index,
            }))
          : [],
      },
    },
  })

  return ok({ data: contest })
})
