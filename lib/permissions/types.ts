/**
 * lib/permissions/types.ts
 * 权限系统类型定义
 */

export type RoleCode = 'SYSTEM_ADMIN' | 'TEACHER' | 'STUDENT'

export type PermissionCode =
  | 'user.view' | 'user.edit' | 'user.ban' | 'user.delete' | 'user.role.assign'
  | 'class.create' | 'class.edit' | 'class.delete' | 'class.member.manage' | 'class.invite.manage' | 'class.assignment.manage'
  | 'problem.create' | 'problem.edit' | 'problem.delete' | 'problem.review' | 'problem.testcase.manage'
  | 'contest.create' | 'contest.edit' | 'contest.delete' | 'contest.participate.manage' | 'contest.scoreboard.view'
  | 'training.create' | 'training.edit' | 'training.delete' | 'training.publish' | 'training.category.manage'
  | 'post.create' | 'post.edit' | 'post.delete' | 'post.pin' | 'post.lock'
  | 'system.settings' | 'system.permission.manage' | 'admin.access'

export interface PermissionUser {
  id: string
  role?: string | null
  isSuperAdmin?: boolean
}
