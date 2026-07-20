'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'

interface BatchDeleteModalProps {
  /** 选中的用户 ID 集合（用于提交） */
  userIds: Set<string>
  onClose: () => void
  onSuccess: () => void
}

/** 批量删除用户的确认对话框。 */
export function BatchDeleteModal({
  userIds,
  onClose,
  onSuccess,
}: BatchDeleteModalProps) {
  const [operating, setOperating] = useState(false)

  const handleConfirm = async () => {
    if (userIds.size === 0) return

    setOperating(true)
    try {
      const response = await fetchWithCookie('/api/admin/users/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: Array.from(userIds)
        })
      })

      const data = await response.json()
      if (data.success) {
        onSuccess()
      } else {
        alert(data.error || '批量删除失败')
      }
    } catch (err) {
      alert('网络错误')
    } finally {
      setOperating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
      <div className="card p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-bold text-foreground mb-4">批量删除用户</h3>
        <p className="text-muted-foreground mb-6">
          确定要删除选中的 <span className="text-foreground font-medium">{userIds.size}</span> 个用户吗？
          此操作无法撤销。
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-ghost" disabled={operating}>
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={operating}
            className="btn btn-destructive flex items-center gap-2"
          >
            {operating && <Loader2 className="w-4 h-4 animate-spin" />}
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}
