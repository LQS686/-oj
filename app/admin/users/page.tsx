'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { DataTable, AdminPageShell } from '@/components/admin'
import { useUser } from '@/contexts/UserContext'
import { isSystemAdmin } from '@/lib/permissions'
import { useUserList } from './_hooks/useUserList'
import { StatsCards } from './_components/StatsCards'
import { FilterToolbar } from './_components/FilterToolbar'
import { buildUserColumns, buildUserMobileCard } from './_components/userColumns'
import { EditUserModal } from './_components/EditUserModal'
import { ResetPasswordModal } from './_components/ResetPasswordModal'
import { DeleteUserModal } from './_components/DeleteUserModal'
import { BatchEditModal } from './_components/BatchEditModal'
import { BatchDeleteModal } from './_components/BatchDeleteModal'
import { BatchRegisterModal } from './_components/BatchRegisterModal'
import type { User } from './_utils'
import { isUserLocked } from './_utils'

export default function AdminUsersPage() {
  const { user: currentUser } = useUser()
  // 当前操作者是否为系统管理员（系统管理员可赋予 ADMIN/TEACHER/STUDENT；管理员只能赋予 TEACHER/STUDENT）
  const operatorIsSystemAdmin = isSystemAdmin(currentUser)

  const {
    users,
    initialLoading,
    refreshing,
    error,
    pagination,
    fetchUsers,
    goToPage,
    changePageSize,
    applyFilters,
  } = useUserList()

  // 筛选：搜索防抖 300ms，避免每个按键都打一次接口；角色切换同样走统一入口
  const [searchInput, setSearchInput] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const filterEffectMounted = useRef(false)
  useEffect(() => {
    if (!filterEffectMounted.current) {
      filterEffectMounted.current = true
      return
    }
    const timer = setTimeout(() => applyFilters(searchInput, roleFilter), 300)
    return () => clearTimeout(timer)
  }, [searchInput, roleFilter, applyFilters])

  // 单条操作目标
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [resetTarget, setResetTarget] = useState<User | null>(null)

  // 批量注册弹窗
  const [showBatchRegisterModal, setShowBatchRegisterModal] = useState(false)

  // 批量操作目标
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [showBatchEditModal, setShowBatchEditModal] = useState(false)
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false)
  // 强制 DataTable 重置内部选中状态（批量操作成功后调用）
  const [tableKey, setTableKey] = useState(0)

  const filteredUsers = users
  // 行操作回调
  const handleEdit = (user: User) => setEditTarget(user)
  const handleReset = (user: User) => setResetTarget(user)
  const handleDelete = (user: User) => setDeleteTarget(user)

  const columns = useMemo(
    () =>
      buildUserColumns({
        operatorIsSystemAdmin,
        onEdit: handleEdit,
        onReset: handleReset,
        onDelete: handleDelete,
      }),
    [operatorIsSystemAdmin]
  )
  const mobileCardRenderer = useMemo(
    () =>
      buildUserMobileCard({
        operatorIsSystemAdmin,
        onEdit: handleEdit,
        onReset: handleReset,
        onDelete: handleDelete,
      }),
    [operatorIsSystemAdmin]
  )

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-error text-lg mb-2">{error}</p>
          {error.includes('权限') && <p className="text-muted-foreground">正在跳转...</p>}
        </div>
      </div>
    )
  }

  return (
    <>
      <AdminPageShell width="list" className="space-y-6">
        <div className="h-5 flex items-center justify-end" aria-live="polite">
          {refreshing && <span className="text-xs text-muted-foreground">更新中…</span>}
        </div>

        <div
          className={`space-y-6 transition-opacity duration-200 ${refreshing ? 'opacity-50 pointer-events-none' : ''}`}
          aria-busy={refreshing}
        >
          <StatsCards users={users} total={pagination.total} />

          <FilterToolbar
            searchQuery={searchInput}
            onSearchChange={setSearchInput}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            onBatchRegisterClick={() => setShowBatchRegisterModal(true)}
          />

          <DataTable
            data={filteredUsers}
            columns={columns}
            idKey="id"
            key={tableKey}
            emptyMessage={searchInput || roleFilter !== 'all' ? '没有找到匹配的用户' : '暂无用户'}
            onRowClick={(row) => {
              // 与编辑按钮一致的锁定判断：系统管理员 / （非系统管理员操作时的）管理员不可编辑
              if (isUserLocked(row, operatorIsSystemAdmin)) return
              setEditTarget(row)
            }}
            pagination={{
              page: pagination.page,
              pageSize: pagination.pageSize,
              total: pagination.total,
              onPageChange: goToPage,
              onPageSizeChange: changePageSize,
            }}
            batchActions={[
              {
                label: '批量修改角色',
                action: (ids) => {
                  setSelectedUserIds(new Set(ids))
                  setShowBatchEditModal(true)
                },
              },
              {
                label: '批量删除',
                action: (ids) => {
                  setSelectedUserIds(new Set(ids))
                  setShowBatchDeleteModal(true)
                },
                danger: true,
              },
            ]}
            mobileCardRenderer={mobileCardRenderer}
          />
        </div>
      </AdminPageShell>

      {editTarget && (
        <EditUserModal
          key={editTarget.id}
          user={editTarget}
          operatorIsSystemAdmin={operatorIsSystemAdmin}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null)
            fetchUsers()
          }}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          key={resetTarget.id}
          user={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteUserModal
          key={deleteTarget.id}
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null)
            fetchUsers()
          }}
        />
      )}

      {showBatchRegisterModal && (
        <BatchRegisterModal
          operatorIsSystemAdmin={operatorIsSystemAdmin}
          onClose={() => setShowBatchRegisterModal(false)}
          onSuccess={fetchUsers}
        />
      )}

      {showBatchEditModal && (
        <BatchEditModal
          userIds={selectedUserIds}
          operatorIsSystemAdmin={operatorIsSystemAdmin}
          onClose={() => setShowBatchEditModal(false)}
          onSuccess={() => {
            setShowBatchEditModal(false)
            setSelectedUserIds(new Set())
            setTableKey((k) => k + 1)
            fetchUsers()
          }}
        />
      )}

      {showBatchDeleteModal && (
        <BatchDeleteModal
          userIds={selectedUserIds}
          onClose={() => setShowBatchDeleteModal(false)}
          onSuccess={() => {
            setShowBatchDeleteModal(false)
            setSelectedUserIds(new Set())
            setTableKey((k) => k + 1)
            fetchUsers()
          }}
        />
      )}
    </>
  )
}
