'use client'

import { Edit, Trash2, KeyRound } from 'lucide-react'
import type { User } from '../_utils'
import { isUserLocked, getLockReason } from '../_utils'

interface UserRowActionsProps {
  user: User
  operatorIsSystemAdmin: boolean
  onEdit: (user: User) => void
  onReset: (user: User) => void
  onDelete: (user: User) => void
}

/**
 * 用户行的操作按钮组：编辑、重置密码、删除。
 * - SYSTEM_ADMIN 不可被管理；ADMIN 操作者不能管理其他 ADMIN
 * - 重置密码：仅 SYSTEM_ADMIN 可操作，且目标不能是 SYSTEM_ADMIN
 */
export function UserRowActions({
  user,
  operatorIsSystemAdmin,
  onEdit,
  onReset,
  onDelete,
}: UserRowActionsProps) {
  const locked = isUserLocked(user, operatorIsSystemAdmin)
  const lockReason = getLockReason(user, operatorIsSystemAdmin)
  const canReset = operatorIsSystemAdmin && user.role !== 'SYSTEM_ADMIN'

  return (
    <div className="flex items-center justify-start gap-2" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => onEdit(user)}
        disabled={locked}
        className={`p-2.5 rounded-lg transition-colors ${
          locked
            ? 'text-muted-foreground cursor-not-allowed'
            : 'text-primary hover:bg-primary/5'
        }`}
        title={locked ? lockReason : '编辑'}
      >
        <Edit className="w-4 h-4" />
      </button>
      {operatorIsSystemAdmin && (
        <button
          onClick={() => onReset(user)}
          disabled={!canReset}
          className={`p-2.5 rounded-lg transition-colors ${
            !canReset
              ? 'text-muted-foreground cursor-not-allowed'
              : 'text-yellow-600 hover:bg-yellow-600/10'
          }`}
          title={!canReset ? '系统管理员密码不可重置' : '重置密码'}
        >
          <KeyRound className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={() => onDelete(user)}
        disabled={locked}
        className={`p-2.5 rounded-lg transition-colors ${
          locked
            ? 'text-muted-foreground cursor-not-allowed'
            : 'text-error hover:bg-error/10'
        }`}
        title={locked ? lockReason : '删除'}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
