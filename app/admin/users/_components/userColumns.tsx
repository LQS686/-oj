'use client'

import type { ReactNode } from 'react'
import { User, Mail, Calendar } from 'lucide-react'
import { type Column } from '@/components/admin'
import { formatDate } from '@/lib/utils'
import type { User as UserType } from '../_utils'
import { getRoleDisplay } from '../_utils'
import { UserRowActions } from './UserRowActions'

interface BuildColumnsArgs {
  operatorIsSystemAdmin: boolean
  onEdit: (user: UserType) => void
  onReset: (user: UserType) => void
  onDelete: (user: UserType) => void
}

/**
 * 构造用户表格的列定义。操作列复用 UserRowActions 组件。
 */
export function buildUserColumns({
  operatorIsSystemAdmin,
  onEdit,
  onReset,
  onDelete,
}: BuildColumnsArgs): Column<UserType>[] {
  return [
    {
      key: 'username',
      label: '用户',
      render: (_, user) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)' }}>
            <User className="w-5 h-5 text-foreground" />
          </div>
          <span className="text-foreground font-medium">{user.username}</span>
        </div>
      ),
    },
    {
      key: 'email',
      label: '邮箱',
      render: (_, user) => (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mail className="w-4 h-4" />
          {user.email}
        </div>
      ),
    },
    {
      key: 'role',
      label: '角色',
      render: (_, user) => (
        <div className="flex items-center gap-2">
          <span className={`tag ${getRoleDisplay(user.role).color}`}>
            {getRoleDisplay(user.role).label}
          </span>
        </div>
      ),
    },
    {
      key: '_count',
      label: '统计',
      render: (_, user) => (
        <div className="text-sm text-muted-foreground">
          <div>提交: {user._count?.submissions || 0}</div>
          <div>出题: {user._count?.problems || 0}</div>
        </div>
      ),
    },
    {
      key: 'createdAt',
      label: '注册时间',
      render: (value: string) => (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="w-4 h-4" />
          {formatDate(value)}
        </div>
      ),
    },
    {
      key: 'id',
      label: '操作',
      className: 'w-32',
      render: (_, user) => (
        <UserRowActions
          user={user}
          operatorIsSystemAdmin={operatorIsSystemAdmin}
          onEdit={onEdit}
          onReset={onReset}
          onDelete={onDelete}
        />
      ),
    },
  ]
}

/**
 * 移动端卡片渲染器：垂直堆叠关键字段，并在底部展示行操作。
 */
export function buildUserMobileCard({
  operatorIsSystemAdmin,
  onEdit,
  onReset,
  onDelete,
}: BuildColumnsArgs): (row: UserType) => ReactNode {
  // 命名函数表达式：满足 react/display-name 规则（此为渲染回调，非真正的 React 组件）。
  return function renderUserMobileCard(row: UserType): ReactNode {
    return (
    <div className="space-y-2">
      <div>
        <p className="text-xs text-muted-foreground">用户名</p>
        <p className="text-sm font-medium text-foreground">{row.username}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">邮箱</p>
        <p className="text-sm text-foreground">{row.email}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">角色</p>
        <span className={`tag ${getRoleDisplay(row.role).color}`}>{getRoleDisplay(row.role).label}</span>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">统计</p>
        <p className="text-sm text-muted-foreground">
          提交 {row._count?.submissions || 0} · 出题 {row._count?.problems || 0}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">注册时间</p>
        <p className="text-sm text-muted-foreground">{formatDate(row.createdAt)}</p>
      </div>
      <div className="flex gap-2 pt-2">
        <UserRowActions
          user={row}
          operatorIsSystemAdmin={operatorIsSystemAdmin}
          onEdit={onEdit}
          onReset={onReset}
          onDelete={onDelete}
        />
      </div>
    </div>
    )
  }
}
