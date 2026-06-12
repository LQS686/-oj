/**
 * 班级列表 / 创建
 * - GET /api/classes  公开列表（含 / 排除我的班级）
 * - POST /api/classes  创建班级
 */
import { withApi, ok, readJson, readQuery, throw400, throw409 } from '@/lib/api/withApi'
import { listClasses, createClass } from '@/lib/class/service'
import { prisma } from '@/lib/prisma'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ page?: string; pageSize?: string; search?: string; myClasses?: string }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.min(50, Math.max(1, parseInt(q.pageSize || '20') || 20))
  const myClasses = q.myClasses === 'true'

  // myClasses 必须先登录
  let userId: string | undefined
  if (myClasses) {
    const { getUserFromRequest } = await import('@/lib/auth')
    const session = getUserFromRequest(req)
    if (!session?.userId) throw400('UNAUTHORIZED', '请先登录')
    userId = session!.userId
  }

  const result = await listClasses({
    page,
    pageSize,
    search: q.search || '',
    myClasses,
    userId,
  })
  return ok(result)
})

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  const body = await readJson<{
    name?: string
    description?: string
    avatar?: string
    isPublic?: boolean
    maxMembers?: number
  }>(req)

  if (!body.name || !body.name.trim()) {
    throw400('INVALID_NAME', '班级名称不能为空')
  }

  // 检查班级名是否已存在
  const existing = await prisma.class.findUnique({ where: { name: body.name!.trim() } })
  if (existing) throw409('班级名称已存在')

  const classData = await createClass({
    name: body.name!,
    description: body.description,
    avatar: body.avatar,
    isPublic: body.isPublic,
    maxMembers: body.maxMembers,
    ownerId: user.id,
  })

  return ok(
    {
      id: classData.id,
      name: classData.name,
      description: classData.description,
      avatar: classData.avatar,
      isPublic: classData.isPublic,
      maxMembers: classData.maxMembers,
      ownerId: classData.ownerId,
      createdAt: classData.createdAt,
    },
    { status: 201 }
  )
})
