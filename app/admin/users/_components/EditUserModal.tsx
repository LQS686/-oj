'use client'

import { useState } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import { useDialog } from '@/components/common/DialogProvider'
import Modal from '@/components/common/Modal'
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
  const dialog = useDialog()
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
        await dialog.alert({ tone: 'error', message: data.error || '更新失败' })
      }
    } catch {
      await dialog.alert({ tone: 'error', message: '网络错误' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="编辑用户角色"
      closeOnOverlayClick={!saving}
      closeOnEsc={!saving}
      footer={
        <div className="flex gap-3 justify-end w-full">
          <button onClick={onClose} className="btn btn-ghost" disabled={saving}>
            取消
          </button>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
            保存
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">用户名</label>
          <input
            type="text"
            value={user.username}
            disabled
            className="input opacity-50 cursor-not-allowed"
          />
        </div>
        <div>
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
      </div>
    </Modal>
  )
}
