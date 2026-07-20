'use client'

import { useState } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import type { User } from '../_utils'

interface EditUserModalProps {
  user: User
  operatorIsSystemAdmin: boolean
  onClose: () => void
  onSuccess: () => void
}

/**
 * 编辑用户角色对话框。
 * 系统管理员可将用户提升为 ADMIN；普通管理员仅能选择 TEACHER/STUDENT。
 */
export function EditUserModal({ user, operatorIsSystemAdmin, onClose, onSuccess }: EditUserModalProps) {
  const [editRole, setEditRole] = useState(user.role)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetchWithCookie(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editRole })
      })

      const data = await response.json()
      if (data.success) {
        onSuccess()
      } else {
        alert(data.error || '更新失败')
      }
    } catch (err) {
      alert('网络错误')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
      <div className="card p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-bold text-foreground mb-4">编辑用户角色</h3>
        <div className="mb-4">
          <label className="block text-sm font-medium text-muted-foreground mb-2">用户名</label>
          <input
            type="text"
            value={user.username}
            disabled
            className="input opacity-50 cursor-not-allowed"
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-muted-foreground mb-2">角色</label>
          <select
            value={editRole}
            onChange={(e) => setEditRole(e.target.value)}
            className="input"
          >
            <option value="STUDENT">学生</option>
            <option value="TEACHER">教师</option>
            {operatorIsSystemAdmin && <option value="ADMIN">管理员</option>}
          </select>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost" disabled={saving}>
            取消
          </button>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
