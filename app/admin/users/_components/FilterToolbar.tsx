'use client'

import { Search, UserPlus } from 'lucide-react'
import { FilterBar } from '@/components/admin'

const ROLE_TABS = [
  { id: 'all', label: '全部' },
  { id: 'SYSTEM_ADMIN', label: '系统管理员' },
  { id: 'ADMIN', label: '管理员' },
  { id: 'TEACHER', label: '教师' },
  { id: 'STUDENT', label: '学生' },
]

interface FilterToolbarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  roleFilter: string
  onRoleFilterChange: (value: string) => void
  onBatchRegisterClick: () => void
}

/**
 * 用户列表的筛选栏：搜索框 + 角色分段控件 + 批量注册按钮。
 */
export function FilterToolbar({
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  onBatchRegisterClick,
}: FilterToolbarProps) {
  const activeCount = (searchQuery ? 1 : 0) + (roleFilter !== 'all' ? 1 : 0)

  return (
    <FilterBar activeCount={activeCount}>
      <div className="flex-1 min-w-[200px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索用户名或邮箱..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>
      <div className="flex gap-1 p-1 rounded-lg bg-muted">
        {ROLE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onRoleFilterChange(tab.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              roleFilter === tab.id
                ? 'bg-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <button
        onClick={onBatchRegisterClick}
        className="btn btn-primary flex items-center gap-2 ml-auto"
      >
        <UserPlus className="w-4 h-4" />
        批量注册
      </button>
    </FilterBar>
  )
}
