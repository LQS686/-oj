import { describe, it, expect, vi } from 'vitest'

// lib/user/service.ts 顶层导入了 prisma / cache / mongo / ranking 等带副作用（DB、网络、setInterval）的模块，
// 而 getAssignableRoles / assertAssignableRole 是纯函数，不依赖这些。用 vi.mock 屏蔽副作用导入，
// 保证本文件为纯逻辑测试（不连 DB / 网络 / server）。
// vi.mock 会被提升到文件顶部，故用 vi.hoisted 创建递归 Proxy，确保工厂函数执行时已初始化。
const { anyProxy } = vi.hoisted(() => {
  const anyProxy: any = new Proxy(function () {}, {
    get: () => anyProxy,
    apply: () => anyProxy,
  })
  return { anyProxy }
})

vi.mock('@/lib/prisma', () => ({ prisma: anyProxy, prismaRo: anyProxy, Prisma: {} }))
vi.mock('@/lib/cache', () => ({ cache: anyProxy }))
vi.mock('@/lib/mongodb-direct', () => ({ getMongoClient: vi.fn() }))
vi.mock('@/lib/ranking/service', () => ({ clearRankingCache: vi.fn() }))

import {
  isSystemAdmin,
  isAdmin,
  isTeacher,
  isStudent,
  canAccessAdmin,
  canManageSystemSettings,
  canManageContent,
  canCreateContest,
  canCreateClass,
  getRoleLabel,
  getRoleColor,
} from '@/lib/permissions'

// 注意：getAssignableRoles / assertAssignableRole 实际定义在 lib/user/service.ts（而非 permissions.ts），
// 此处按实际导出位置导入；两个函数均为纯函数。
import { getAssignableRoles, assertAssignableRole } from '@/lib/user/service'

describe('isSystemAdmin', () => {
  it('SYSTEM_ADMIN → true', () => {
    expect(isSystemAdmin({ role: 'SYSTEM_ADMIN' })).toBe(true)
  })
  it('非 SYSTEM_ADMIN → false', () => {
    expect(isSystemAdmin({ role: 'ADMIN' })).toBe(false)
    expect(isSystemAdmin({ role: 'TEACHER' })).toBe(false)
    expect(isSystemAdmin({ role: 'STUDENT' })).toBe(false)
  })
  it('null / undefined / 缺 role → false', () => {
    expect(isSystemAdmin(null)).toBe(false)
    expect(isSystemAdmin({ role: null })).toBe(false)
    expect(isSystemAdmin({ role: undefined })).toBe(false)
  })
})

describe('isAdmin', () => {
  it('ADMIN → true，其余 → false', () => {
    expect(isAdmin({ role: 'ADMIN' })).toBe(true)
    expect(isAdmin({ role: 'SYSTEM_ADMIN' })).toBe(false)
    expect(isAdmin({ role: 'TEACHER' })).toBe(false)
    expect(isAdmin({ role: 'STUDENT' })).toBe(false)
  })
  it('null → false', () => {
    expect(isAdmin(null)).toBe(false)
  })
})

describe('isTeacher', () => {
  it('TEACHER → true，其余 → false', () => {
    expect(isTeacher({ role: 'TEACHER' })).toBe(true)
    expect(isTeacher({ role: 'ADMIN' })).toBe(false)
    expect(isTeacher({ role: 'SYSTEM_ADMIN' })).toBe(false)
    expect(isTeacher({ role: 'STUDENT' })).toBe(false)
  })
})

describe('isStudent', () => {
  it('STUDENT → true，其余 → false', () => {
    expect(isStudent({ role: 'STUDENT' })).toBe(true)
    expect(isStudent({ role: 'TEACHER' })).toBe(false)
    expect(isStudent({ role: 'ADMIN' })).toBe(false)
    expect(isStudent({ role: 'SYSTEM_ADMIN' })).toBe(false)
  })
})

describe('canAccessAdmin', () => {
  it('SYSTEM_ADMIN / ADMIN → true', () => {
    expect(canAccessAdmin({ role: 'SYSTEM_ADMIN' })).toBe(true)
    expect(canAccessAdmin({ role: 'ADMIN' })).toBe(true)
  })
  it('TEACHER / STUDENT → false', () => {
    expect(canAccessAdmin({ role: 'TEACHER' })).toBe(false)
    expect(canAccessAdmin({ role: 'STUDENT' })).toBe(false)
  })
  it('null → false', () => {
    expect(canAccessAdmin(null)).toBe(false)
  })
})

describe('canManageSystemSettings', () => {
  it('仅 SYSTEM_ADMIN → true', () => {
    expect(canManageSystemSettings({ role: 'SYSTEM_ADMIN' })).toBe(true)
    expect(canManageSystemSettings({ role: 'ADMIN' })).toBe(false)
    expect(canManageSystemSettings({ role: 'TEACHER' })).toBe(false)
    expect(canManageSystemSettings({ role: 'STUDENT' })).toBe(false)
  })
  it('null → false', () => {
    expect(canManageSystemSettings(null)).toBe(false)
  })
})

describe('canManageContent / canCreateContest / canCreateClass', () => {
  it('SYSTEM_ADMIN / ADMIN / TEACHER → true', () => {
    for (const role of ['SYSTEM_ADMIN', 'ADMIN', 'TEACHER'] as const) {
      expect(canManageContent({ role })).toBe(true)
      expect(canCreateContest({ role })).toBe(true)
      expect(canCreateClass({ role })).toBe(true)
    }
  })
  it('STUDENT → false', () => {
    expect(canManageContent({ role: 'STUDENT' })).toBe(false)
    expect(canCreateContest({ role: 'STUDENT' })).toBe(false)
    expect(canCreateClass({ role: 'STUDENT' })).toBe(false)
  })
  it('null → false', () => {
    expect(canManageContent(null)).toBe(false)
    expect(canCreateContest(null)).toBe(false)
    expect(canCreateClass(null)).toBe(false)
  })
})

describe('getRoleLabel', () => {
  it('各角色中文标签', () => {
    expect(getRoleLabel('SYSTEM_ADMIN')).toBe('系统管理员')
    expect(getRoleLabel('ADMIN')).toBe('管理员')
    expect(getRoleLabel('TEACHER')).toBe('教师')
    expect(getRoleLabel('STUDENT')).toBe('学生')
  })
  it('未知角色 / undefined → "用户"', () => {
    expect(getRoleLabel('OTHER')).toBe('用户')
    expect(getRoleLabel(undefined)).toBe('用户')
  })
})

describe('getRoleColor', () => {
  it('各角色 Tag 颜色', () => {
    expect(getRoleColor('SYSTEM_ADMIN')).toBe('tag-error')
    expect(getRoleColor('ADMIN')).toBe('tag-error')
    expect(getRoleColor('TEACHER')).toBe('tag-warning')
    expect(getRoleColor('STUDENT')).toBe('tag-info')
    expect(getRoleColor(undefined)).toBe('tag-info')
  })
})

describe('getAssignableRoles', () => {
  it('SYSTEM_ADMIN 可分配 ADMIN / TEACHER / STUDENT', () => {
    expect(getAssignableRoles('SYSTEM_ADMIN')).toEqual(['ADMIN', 'TEACHER', 'STUDENT'])
  })
  it('ADMIN 只可分配 TEACHER / STUDENT（不能管理其他管理员）', () => {
    expect(getAssignableRoles('ADMIN')).toEqual(['TEACHER', 'STUDENT'])
  })
  it('TEACHER / STUDENT 不可分配任何角色', () => {
    expect(getAssignableRoles('TEACHER')).toEqual([])
    expect(getAssignableRoles('STUDENT')).toEqual([])
  })
  it('null / undefined → []', () => {
    expect(getAssignableRoles(null)).toEqual([])
    expect(getAssignableRoles(undefined)).toEqual([])
  })
})

describe('assertAssignableRole', () => {
  it('SYSTEM_ADMIN 分配 ADMIN → 合法（不抛错）', () => {
    expect(() => assertAssignableRole('ADMIN', 'SYSTEM_ADMIN')).not.toThrow()
  })
  it('SYSTEM_ADMIN 分配 TEACHER / STUDENT → 合法', () => {
    expect(() => assertAssignableRole('TEACHER', 'SYSTEM_ADMIN')).not.toThrow()
    expect(() => assertAssignableRole('STUDENT', 'SYSTEM_ADMIN')).not.toThrow()
  })
  it('ADMIN 不能分配 ADMIN → 非法', () => {
    expect(() => assertAssignableRole('ADMIN', 'ADMIN')).toThrow()
  })
  it('TEACHER 不可分配任何角色 → 非法', () => {
    expect(() => assertAssignableRole('STUDENT', 'TEACHER')).toThrow()
  })
  it('SYSTEM_ADMIN 不可被赋予 → 非法', () => {
    expect(() => assertAssignableRole('SYSTEM_ADMIN', 'SYSTEM_ADMIN')).toThrow()
  })
  it('undefined 角色 → 非法', () => {
    expect(() => assertAssignableRole(undefined, 'SYSTEM_ADMIN')).toThrow()
  })
  it('操作者为 null → 非法', () => {
    expect(() => assertAssignableRole('TEACHER', null)).toThrow()
  })
  it('项目约束：SYSTEM_ADMIN 唯一可分配 ADMIN', () => {
    // 只有 SYSTEM_ADMIN 能分配 ADMIN；其余角色均不能
    expect(() => assertAssignableRole('ADMIN', 'SYSTEM_ADMIN')).not.toThrow()
    expect(() => assertAssignableRole('ADMIN', 'ADMIN')).toThrow()
    expect(() => assertAssignableRole('ADMIN', 'TEACHER')).toThrow()
    expect(() => assertAssignableRole('ADMIN', 'STUDENT')).toThrow()
  })
  it('抛错携带 code=INVALID_ROLE 且 status=400', () => {
    let thrown: any
    try {
      assertAssignableRole('ADMIN', 'ADMIN')
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeDefined()
    expect(thrown.code).toBe('INVALID_ROLE')
    expect(thrown.status).toBe(400)
    expect(thrown.message).toContain('无效的角色类型或无权分配该角色')
  })
})
