/**
 * lib/class/admin.ts
 * 管理员班级管理
 */

import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api/withApi'

/* ============================================================================
 * 管理员班级管理（原 /api/admin/classes*）
 * ========================================================================== */

/** 管理员列出所有班级（带成员/作业/笔记计数 + owner 用户名） */
export async function listAllClassesForAdmin(opts?: { page?: number; pageSize?: number }) {
  const page = opts?.page
  const pageSize = opts?.pageSize
  const usePaging =
    typeof page === 'number' && typeof pageSize === 'number' && page > 0 && pageSize > 0
  // 未传分页参数时加 take 上限防 OOM；传入参数时按 page/pageSize 分页
  const take = usePaging ? (pageSize as number) : 500
  const skip = usePaging ? ((page as number) - 1) * (pageSize as number) : 0
  const classes = await prisma.class.findMany({
    skip,
    take,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { members: true, assignments: true, notes: true } },
    },
  })
  const ownerIds = [...new Set(classes.map((t: any) => t.ownerId))]
  const owners = ownerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, username: true },
      })
    : []
  const ownerMap = new Map<any, any>(owners.map((o: any) => [o.id, o.username]))
  return classes.map((classData: any) => ({
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
 * 管理员更新班级信息（名称 / 描述 / 可见性）
 * 仅传入的字段会被更新；若只更新可见性，保留原有提示文案以保持向后兼容。
 */
export async function adminUpdateClass(
  classId: string,
  data: { isPublic?: boolean; name?: string; description?: string | null }
) {
  const classData = await prisma.class.findUnique({ where: { id: classId } })
  if (!classData) {
    throw new ApiError('NOT_FOUND', '班级不存在', 404)
  }

  const updateData: { isPublic?: boolean; name?: string; description?: string | null } = {}
  if (data.isPublic !== undefined) updateData.isPublic = data.isPublic
  if (data.name !== undefined) updateData.name = data.name.trim()
  if (data.description !== undefined) updateData.description = data.description

  await prisma.class.update({ where: { id: classId }, data: updateData })

  // 仅切换可见性时保留原提示文案
  const onlyVisibility =
    data.isPublic !== undefined && data.name === undefined && data.description === undefined
  if (onlyVisibility) {
    return data.isPublic ? '班级已设为公开' : '班级已设为私有'
  }
  return '班级信息更新成功'
}

/** 管理员删除班级 */
export async function adminDeleteClass(classId: string) {
  await prisma.class.delete({ where: { id: classId } })
  return '班级已删除'
}
