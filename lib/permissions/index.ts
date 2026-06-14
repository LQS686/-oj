/**
 * lib/permissions/index.ts
 * 统一 re-export 入口
 *
 * 业务代码统一从 '@/lib/permissions' 导入：
 *   import { hasPermission, isSystemAdmin, requirePermission } from '@/lib/permissions'
 *   import type { PermissionCode, PermissionUser } from '@/lib/permissions'
 *
 * 注意：旧的 'lib/permissions.ts'（粗粒度函数）保留不变，所有新代码请使用本目录。
 */

export * from './types'
export * from './role'
export { hasPermission, clearUserPermissionCache } from './permissions'
export { requirePermission, PermissionDeniedError } from './guard'
