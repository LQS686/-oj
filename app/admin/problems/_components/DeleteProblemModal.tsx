'use client'

import { fetchWithCookie } from '@/lib/api/base'
import { useDialog } from '@/components/common/DialogProvider'
import Modal from '@/components/common/Modal'
import type { Problem } from '../_types'

interface DeleteProblemModalProps {
  problem: Problem
  onClose: () => void
  onSuccess: () => void
}

/** 删除单个题目的确认对话框。 */
export function DeleteProblemModal({ problem, onClose, onSuccess }: DeleteProblemModalProps) {
  const dialog = useDialog()

  const handleDelete = async () => {
    try {
      const response = await fetchWithCookie(`/api/admin/problems/${problem.id}`, {
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
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="确认删除"
      footer={
        <div className="flex gap-3 justify-end w-full">
          <button onClick={onClose} className="btn btn-ghost">
            取消
          </button>
          <button onClick={handleDelete} className="btn btn-destructive">
            确认删除
          </button>
        </div>
      }
    >
      <p className="text-muted-foreground">
        确定要删除题目 <span className="text-foreground font-medium">{problem.title}</span> 吗？
        此操作无法撤销。
      </p>
    </Modal>
  )
}
