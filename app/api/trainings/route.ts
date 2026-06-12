/**
 * /api/trainings - 训练计划列表/创建
 *
 * GET  公开：分页查询（仅公开）
 * POST 鉴权：仅管理员可创建（含批量绑定题目）
 */
import { withApi, ok, readJson, readQuery, throw400, throw403 } from '@/lib/api/withApi'
import { listPublicTrainingsAdvanced, createTrainingWithProblems } from '@/lib/training/service'
import { toInt } from '@/lib/api/validation'
import { prisma } from '@/lib/prisma'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ page?: string; limit?: string; keyword?: string; difficulty?: string }>(req)
  let page = toInt(q.page, 'page', 1)
  let limit = toInt(q.limit, 'limit', 20)
  if (page < 1) page = 1
  if (limit < 1) limit = 20
  if (limit > 50) limit = 50

  const data = await listPublicTrainingsAdvanced(page, limit, {
    keyword: q.keyword,
    difficulty: q.difficulty,
  })
  return ok({
    items: data.items,
    pagination: { page: data.page, limit: data.pageSize, total: data.total, totalPages: data.totalPages },
  })
})

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  // 管理员鉴权：非 dynamic 路由用 auth + DB 二次确认
  const currentUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!currentUser?.isAdmin) throw403('只有管理员可以创建训练计划')

  const body = await readJson<{
    title: string
    description: string
    difficulty: string
    isPublic?: boolean
    problemIds?: string[]
  }>(req)

  if (!body.title || !body.description || !body.difficulty) {
    throw400('VALIDATION', '缺少必要参数')
  }
  const training = await createTrainingWithProblems(body)
  return ok({ data: training, message: '训练计划创建成功' }, { status: 201 })
})
