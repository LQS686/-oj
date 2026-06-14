/**
 * lib/permissions/permissions.ts
 * 细粒度权限校验
 *
 * 核心入口：hasPermission(user, code)
 *   1) SYSTEM_ADMIN 默认全部 true（fail-safe + 性能优化）
 *   2) 查 UserPermission（userId + code）显式覆盖
 *      - 命中：直接返回其 value
 *   3) 查 RolePermission join Permission（role=user.role and code=code）
 *      - 命中：true
 *   4) 全部 miss：false
 *   5) 异常路径：DB 错误时降级为 role 字符串判断（SYSTEM_ADMIN 永真）
 */

import { prisma } from '@/lib/prisma'
import { isSystemAdmin } from './role'
import type { PermissionCode, PermissionUser } from './types'

/**
 * 简单进程内缓存：userId+code → boolean（TTL 30s）
 * 减少重复 DB 查询
 */
type CacheEntry = { value: boolean; expiry: number }
const permCache: Map<string, CacheEntry> = (() => {
  const g = globalThis as any
  if (!g.__permCache) g.__permCache = new Map<string, CacheEntry>()
  return g.__permCache as Map<string, CacheEntry>
})()

const CACHE_TTL_MS = 30_000

function cacheGet(key: string): boolean | null {
  const hit = permCache.get(key)
  if (hit && hit.expiry > Date.now()) return hit.value
  return null
}

function cacheSet(key: string, value: boolean): void {
  permCache.set(key, { value, expiry: Date.now() + CACHE_TTL_MS })
}

/**
 * 清除某用户的权限缓存
 * （在管理员变更其权限时调用）
 */
export function clearUserPermissionCache(userId: string): void {
  for (const key of permCache.keys()) {
    if (key.startsWith(`${userId}:`)) permCache.delete(key)
  }
}

export async function hasPermission(
  user: PermissionUser | null | undefined,
  code: PermissionCode
): Promise<boolean> {
  if (!user) return false
  if (!user.id) return false

  // 1) SYSTEM_ADMIN fail-safe：默认全开
  if (isSystemAdmin(user)) return true

  const cacheKey = `${user.id}:${code}`
  const cached = cacheGet(cacheKey)
  if (cached !== null) return cached

  try {
    // 2) 显式覆盖
    const override = await prisma.userPermission.findUnique({
      where: { userId_permissionCode: { userId: user.id, permissionCode: code } },
      select: { value: true },
    })
    if (override) {
      cacheSet(cacheKey, override.value)
      return override.value
    }

    // 3) 角色默认权限
    if (user.role) {
      const rolePerm = await prisma.rolePermission.findFirst({
        where: {
          role: user.role,
          permission: { code },
        },
        select: { id: true },
      })
      const result = !!rolePerm
      cacheSet(cacheKey, result)
      return result
    }

    // 4) 无 role + 无显式覆盖：拒绝
    cacheSet(cacheKey, false)
    return false
  } catch (err) {
    // 5) 异常降级：role 字符串判断（SYSTEM_ADMIN 已 fail-safe）
    console.error('[hasPermission] DB 异常，降级到 role 字符串判断：', err)
    if (user.role === 'SYSTEM_ADMIN') return true
    if (user.role === 'TEACHER') {
      // TEACHER 默认业务管理类（与 seed 默认集保持一致）
      const teacherDefaults: PermissionCode[] = [
        'user.view', 'user.edit',
        'class.create', 'class.edit', 'class.delete', 'class.member.manage', 'class.invite.manage', 'class.assignment.manage',
        'problem.create', 'problem.edit', 'problem.delete', 'problem.review', 'problem.testcase.manage',
        'contest.create', 'contest.edit', 'contest.delete', 'contest.participate.manage', 'contest.scoreboard.view',
        'training.create', 'training.edit', 'training.delete', 'training.publish', 'training.category.manage',
        'post.create', 'post.edit', 'post.delete', 'post.pin', 'post.lock',
      ]
      return teacherDefaults.includes(code)
    }
    return false
  }
}
