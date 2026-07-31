'use client'

import { useState } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import { useDialog } from '@/components/common/DialogProvider'
import Modal from '@/components/common/Modal'
import type { User } from '../_utils'

interface DeleteUserModalProps {
  user: User
  onClose: () => void
  onSuccess: () => void
}

/** 删除单个用户的确认对话框。 */
export function DeleteUserModal({ user, onClose, onSuccess }: DeleteUserModalProps) {
  const dialog = useDialog()
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
        await dialog.alert({ tone: 'error', message: data.error || '删除失败' })
      }
    } catch {
      await dialog.alert({ tone: 'error', message: '网络错误' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="确认删除"
      closeOnOverlayClick={!deleting}
      closeOnEsc={!deleting}
      footer={
        <div className="flex gap-3 justify-end w-full">
          <button onClick={onClose} className="btn btn-ghost" disabled={deleting}>
            取消
          </button>
          <button onClick={handleDelete} className="btn btn-destructive" disabled={deleting}>
            确认删除
          </button>
        </div>
      }
    >
      <p className="text-muted-foreground">
        确定要删除用户 <span className="text-foreground font-medium">{user.username}</span> 吗？
        此操作无法撤销。
      </p>
    </Modal>
  )
}
