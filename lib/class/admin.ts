/**
 * lib/class/admin.ts
 * 管理员班级管理
 */

import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api/errors'

/* ============================================================================
 * 管理员班级管理（原 /api/admin/classes*）
 * ========================================================================== */

/** 管理员列出所有班级（带成员/作业/笔记计数 + owner 用户名） */
export async function listAllClassesForAdmin(opts?: { page?: number; pageSize?: number }) {
  const page = opts?.page
  const rawPageSize = opts?.pageSize
  const pageSize =
    typeof rawPageSize === 'number' && rawPageSize > 0 ? Math.min(rawPageSize, 100) : undefined
  const usePaging =
    typeof page === 'number' && typeof pageSize === 'number' && page > 0 && pageSize > 0
  const take = usePaging ? (pageSize as number) : 100
  const skip = usePaging ? ((page as number) - 1) * (pageSize as number) : 0
  const classes = await prisma.class.findMany({
    skip,
    take,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { members: true, assignments: true, notes: true } },
    },
  })
  const ownerIds = [...new Set(classes.map((t) => t.ownerId))]
  const owners = ownerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, username: true },
      })
    : []
  const ownerMap = new Map(owners.map((o) => [o.id, o.username] as const))
  return classes.map((classData) => ({
    ...classData,
    owner: { username: ownerMap.get(classData.ownerId) || '未知用户' },
  }))
}

/** 管理员切换班级可见性（公开/私有） */
export async function adminUpdateClassVisibility(classId: string, isPublic: boolean | undefined) {
  const classData = await prisma.class.findUnique({ where: { id: classId } })
  if (!classData) {
    throw new ApiError('NOT_FOUND', '班级不存在', 404)
  }
  await prisma.class.update({ where: { id: classId }, data: { isPublic } })
  return isPublic ? '班级已设为公开' : '班级已设为私有'
}

/**
 * 管理员更新班级信息（名称 / 描述 / 公告 / 头像 / 人数 / 可见性）
 * 复用 updateClass 校验（maxMembers 不低于当前人数等）。
 */
export async function adminUpdateClass(
  classId: string,
  data: {
    isPublic?: boolean
    name?: string
    description?: string | null
    announcement?: string | null
    avatar?: string | null
    maxMembers?: number
  }
) {
  const classData = await prisma.class.findUnique({ where: { id: classId } })
  if (!classData) {
    throw new ApiError('NOT_FOUND', '班级不存在', 404)
  }

  const { updateClass } = await import('@/lib/class/crud')
  await updateClass(classId, data)

  const onlyVisibility =
    data.isPublic !== undefined &&
    data.name === undefined &&
    data.description === undefined &&
    data.announcement === undefined &&
    data.avatar === undefined &&
    data.maxMembers === undefined
  if (onlyVisibility) {
    return data.isPublic ? '班级已设为公开' : '班级已设为私有'
  }
  return '班级信息更新成功'
}

/** 管理员删除班级（复用显式级联清理） */
export async function adminDeleteClass(classId: string) {
  const { deleteClass } = await import('@/lib/class/crud')
  await deleteClass(classId)
  return '班级已删除'
}
