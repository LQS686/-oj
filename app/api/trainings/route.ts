/**
 * /api/trainings - 训练计划列表/创建
 *
 * GET  公开：分页查询（仅公开、已发布）
 * POST 鉴权：仅管理员可创建（普通用户请通过后台管理页面）
 */
import { withApi, ok, readJson, readQuery, throw400, throw403 } from '@/lib/api/withApi'
import {
  createTrainingWithProblems,
  listPublicTrainingsAdvanced,
} from '@/lib/training/service'
import { toInt } from '@/lib/api/validation'
import type { TrainingCategoryType } from '@/lib/training/types'
import { verifyToken } from '@/lib/auth'
import { canAccessAdmin } from '@/lib/permissions'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{
    page?: string
    limit?: string
    pageSize?: string
    keyword?: string
    difficulty?: string
    categoryId?: string
    categoryType?: string
    recommended?: string
    joined?: string
  }>(req)
  let page = toInt(q.page, 'page', 1)
  let limit = toInt(q.limit || q.pageSize, 'limit', 20)
  if (page < 1) page = 1
  if (limit < 1) limit = 20
  if (limit > 50) limit = 50

  // 选登用户：解析 token 拿到 userId（未登录亦可）
  const token = req.cookies.get('token')?.value
  const userId = token ? verifyToken(token)?.userId ?? null : null

  const data = await listPublicTrainingsAdvanced(page, limit, {
    keyword: q.keyword,
    difficulty: q.difficulty,
    categoryId: q.categoryId,
    categoryType: q.categoryType === 'official' || q.categoryType === 'contest'
      ? q.categoryType
      : undefined,
    isRecommended: q.recommended === 'true' ? true : undefined,
    joinedOnly: q.joined === 'true' ? true : undefined,
    userId,
  })

  return ok(data)
})

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  // 仅管理员可通过后台管理页面创建题单
  if (!canAccessAdmin(user)) {
    throw403('仅管理员可创建题单')
  }

  const body = await readJson<{
    title: string
    description: string
    difficulty?: string
    categoryType?: TrainingCategoryType
    isPublic?: boolean
    status?: string
    isRecommended?: boolean
    categoryId?: string
    tags?: string[]
    cover?: string
    problemIds?: string[]
  }>(req)

  if (!body.title || !body.description) {
    throw400('VALIDATION', '缺少必要参数（title/description）')
  }

  const categoryType = body.categoryType === 'official' || body.categoryType === 'contest'
    ? body.categoryType
    : null

  const training = await createTrainingWithProblems({
    title: body.title,
    description: body.description,
    difficulty: body.difficulty ?? null,
    categoryType,
    isPublic: body.isPublic ?? true,
    status: body.status ?? 'published',
    isRecommended: body.isRecommended ?? false,
    authorId: user.id,
    categoryId: body.categoryId,
    tags: body.tags,
    cover: body.cover,
    problemIds: body.problemIds,
  })
  return ok(training, { status: 201 })
})
