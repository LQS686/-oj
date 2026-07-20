'use client'

import { fetchWithCookie } from '@/lib/api/base'
import type { Problem } from '../_types'

interface DeleteProblemModalProps {
  problem: Problem
  onClose: () => void
  onSuccess: () => void
}

/** 删除单个题目的确认对话框。 */
export function DeleteProblemModal({ problem, onClose, onSuccess }: DeleteProblemModalProps) {
  const handleDelete = async () => {
    try {
      const response = await fetchWithCookie(`/api/admin/problems/${problem.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      if (data.success) {
        onSuccess()
      } else {
        alert(data.error || '删除失败')
      }
    } catch {
      alert('网络错误')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4" onClick={onClose}>
      <div className="card p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-foreground mb-4">确认删除</h3>
        <p className="text-muted-foreground mb-6">
          确定要删除题目 <span className="text-foreground font-medium">{problem.title}</span> 吗？
          此操作无法撤销。
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="btn btn-ghost"
          >
            取消
          </button>
          <button
            onClick={handleDelete}
            className="btn btn-destructive"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}
