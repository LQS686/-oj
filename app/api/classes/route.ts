/**
 * 班级列表 / 创建
 * - GET /api/classes  公开列表（含 / 排除我的班级）
 * - POST /api/classes  创建班级
 */
import { withApi, ok, readJson, readQuery, throw400, throw403, throw409 } from '@/lib/api/withApi'
import { createClass, findClassByName, listClasses } from '@/lib/class/service'
import { canCreateClass } from '@/lib/permissions'

export const GET = withApi.public(async (req) => {
  const q = readQuery<{ page?: string; pageSize?: string; search?: string; myClasses?: string }>(req)
  const page = Math.max(1, parseInt(q.page || '1') || 1)
  const pageSize = Math.min(50, Math.max(1, parseInt(q.pageSize || '20') || 20))
  const myClasses = q.myClasses === 'true'

  // myClasses 必须先登录（经 tokenVersion/ban）
  let userId: string | undefined
  if (myClasses) {
    const { resolveViewerFromRequest } = await import('@/lib/api/withApi')
    const viewer = await resolveViewerFromRequest(req)
    if (!viewer) {
      throw400('UNAUTHORIZED', '请先登录')
    } else {
      userId = viewer.user.id
    }
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
  if (!canCreateClass(user)) {
    throw403('只有教师和管理员可以创建班级')
  }

  const body = await readJson<{
    name?: string
    announcement?: string | null
    avatar?: string
    isPublic?: boolean
    maxMembers?: number
  }>(req)
  const className = body.name

  if (!className || !className.trim()) {
    throw400('INVALID_NAME', '班级名称不能为空')
  }
  const trimmedName = className!.trim()
  if (trimmedName.length > 100) {
    throw400('INVALID_NAME', '班级名称不能超过 100 个字符')
  }

  // isPublic / maxMembers 严格类型校验，禁止负数或非布尔脏数据入库
  let isPublic = true
  if (body.isPublic !== undefined) {
    if (typeof body.isPublic !== 'boolean') {
      throw400('INVALID_IS_PUBLIC', 'isPublic 必须为布尔值')
    }
    isPublic = body.isPublic
  }
  let maxMembers = 50
  if (body.maxMembers !== undefined) {
    if (typeof body.maxMembers !== 'number' || !Number.isInteger(body.maxMembers)) {
      throw400('INVALID_MAX_MEMBERS', 'maxMembers 必须为整数')
    }
    if (body.maxMembers < 1 || body.maxMembers > 10000) {
      throw400('INVALID_MAX_MEMBERS', 'maxMembers 须在 1-10000 之间')
    }
    maxMembers = body.maxMembers
  }

  // 检查班级名是否已存在
  const existing = await findClassByName(trimmedName)
  if (existing) throw409('班级名称已存在')

  const classData = await createClass({
    name: trimmedName,
    announcement: body.announcement,
    avatar: body.avatar,
    isPublic,
    maxMembers,
    ownerId: user.id,
  })

  return ok(
    {
      id: classData.id,
      name: classData.name,
      announcement: classData.announcement,
      avatar: classData.avatar,
      isPublic: classData.isPublic,
      maxMembers: classData.maxMembers,
      ownerId: classData.ownerId,
      createdAt: classData.createdAt,
    },
    { status: 201 }
  )
})
