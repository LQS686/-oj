/**
 * 积分商城商品管理
 * - GET  /api/classes/[id]/points/shop  商品列表
 * - POST /api/classes/[id]/points/shop  创建商品（管理员）
 */
import { withApi, ok, readJson, readQuery, throw400, throw403 } from '@/lib/api/withApi'
import { isObjectId } from '@/lib/api/validation'
import { getShopItems, createShopItem } from '@/lib/points/shop'
import { isClassAdminRole } from '@/lib/class/service'
import { prisma } from '@/lib/prisma'

export const GET = withApi.auth(async (req, ctx, { user }) => {
  const { id: classId } = (ctx as any).params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId: user.id } },
  })
  if (!member) throw403('只有班级成员可以查看商城')

  const q = readQuery<{ category?: string; isActive?: string; page?: string; limit?: string }>(req)
  const page = parseInt(q.page || '1') || 1
  const limit = parseInt(q.limit || '20') || 20

  const result = await getShopItems(classId!, {
    category: q.category,
    isActive: q.isActive === 'true',
    page,
    limit,
  })

  if (!result.success) throw400('QUERY_FAILED', result.error!)
  return ok(result.data)
})

export const POST = withApi.auth(async (req, ctx, { user }) => {
  const { id: classId } = (ctx as any).params
  if (!isObjectId(classId)) throw400('INVALID_ID', '无效的班级ID')

  const member = await prisma.classMember.findUnique({
    where: { classId_userId: { classId, userId: user.id } },
  })
  if (!member || !isClassAdminRole(member.role)) throw403('需要管理员权限')

  const body = await readJson<{
    name?: string
    description?: string
    category?: string
    pointsRequired?: number
    stock?: number
    isUnlimited?: boolean
    imageUrl?: string
    sortOrder?: number
  }>(req)
  if (!body.name || !body.category || !body.pointsRequired) {
    throw400('MISSING_FIELDS', '缺少必要参数')
  }
  if (body.pointsRequired! <= 0) {
    throw400('INVALID_POINTS', '积分必须大于0')
  }

  const result = await createShopItem(classId!, {
    name: body.name!,
    description: body.description,
    category: body.category!,
    pointsRequired: body.pointsRequired!,
    stock: body.stock,
    isUnlimited: body.isUnlimited,
    imageUrl: body.imageUrl,
    sortOrder: body.sortOrder,
  })

  if (!result.success) throw400('CREATE_FAILED', result.error!)
  return ok(result.data, { status: 201 })
})
