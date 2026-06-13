/**
 * /api/admin/contests/[id] - 管理员单个竞赛操作
 *
 * GET    竞赛详情（含题目列表）
 * PATCH  更新竞赛
 * DELETE 删除竞赛
 */
import { withApi, ok, readJson, throw400, throw403, throw404 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/contests/[id] - 获取单个竞赛详情（管理员）
 */
export const GET = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  const contest = await prisma.contest.findUnique({
    where: { id },
    include: {
      problems: {
        include: {
          problem: {
            select: {
              id: true,
              title: true,
              difficulty: true,
            },
          },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  if (!contest) throw404('竞赛不存在')

  return ok({ data: contest })
})

/**
 * PATCH /api/admin/contests/[id] - 更新竞赛（管理员）
 */
export const PATCH = withApi.auth(async (req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

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
    problems, // Array of problemIds
  } = body

  const updateData: any = {
    title,
    description,
    type,
    isPublic,
    password: password || null,
  }

  if (startTime && endTime) {
    const start = new Date(startTime)
    const end = new Date(endTime)
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000 / 60)

    if (duration <= 0) {
      throw400('INVALID_TIME', '结束时间必须晚于开始时间')
    }

    updateData.startTime = start
    updateData.endTime = end
    updateData.duration = duration
  }

  // 改为非事务处理以兼容 standalone MongoDB
  // 1. 更新基本信息
  await prisma.contest.update({
    where: { id },
    data: updateData,
  })

  // 2. 如果提供了题目列表，更新题目关联
  if (problems && Array.isArray(problems)) {
    // 删除原有题目关联
    await prisma.contestProblem.deleteMany({
      where: { contestId: id },
    })

    // 添加新题目关联
    if (problems.length > 0) {
      await prisma.contestProblem.createMany({
        data: problems.map((problemId: string, index: number) => ({
          contestId: id,
          problemId,
          orderIndex: index + 1,
          score: 100, // 默认分数，后续可以细化
        })),
      })
    }
  }

  return ok({ message: '更新成功' })
})

/**
 * DELETE /api/admin/contests/[id] - 删除竞赛（管理员）
 */
export const DELETE = withApi.auth(async (_req, ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }
  const { id } = (ctx as any).params
  if (!isObjectId(id)) throw400('INVALID_ID', '无效的 ID')

  // 删除竞赛（级联删除会处理关联数据，如 ContestProblem）
  // 但注意 Prisma MongoDB 不支持完全的数据库级联，需要 schema 里定义 onDelete: Cascade 或者手动删除
  // schema 中 ContestProblem 有 onDelete: Cascade 指向 Contest，所以 Prisma Client 会处理
  await prisma.contest.delete({
    where: { id },
  })

  return ok({ message: '删除成功' })
})
