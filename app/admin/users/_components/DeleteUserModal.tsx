'use client'

import { useState } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import type { User } from '../_utils'

interface DeleteUserModalProps {
  user: User
  onClose: () => void
  onSuccess: () => void
}

/** 删除单个用户的确认对话框。 */
export function DeleteUserModal({ user, onClose, onSuccess }: DeleteUserModalProps) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const response = await fetchWithCookie(`/api/admin/users/${user.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      if (data.success) {
        onSuccess()
      } else {
        alert(data.error || '删除失败')
      }
    } catch (err) {
      alert('网络错误')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
      <div className="card p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-bold text-foreground mb-4">确认删除</h3>
        <p className="text-muted-foreground mb-6">
          确定要删除用户 <span className="text-foreground font-medium">{user.username}</span> 吗？
          此操作无法撤销。
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost" disabled={deleting}>
            取消
          </button>
          <button onClick={handleDelete} className="btn btn-destructive" disabled={deleting}>
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}
