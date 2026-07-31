'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { useDialog } from '@/components/common/DialogProvider'
import Modal from '@/components/common/Modal'

interface BatchEditModalProps {
  /** 选中的用户 ID 集合（用于提交） */
  userIds: Set<string>
  operatorIsSystemAdmin: boolean
  onClose: () => void
  onSuccess: () => void
}

/** 批量修改用户角色的对话框。 */
export function BatchEditModal({
  userIds,
  operatorIsSystemAdmin,
  onClose,
  onSuccess,
}: BatchEditModalProps) {
  const dialog = useDialog()
  const [batchEditRole, setBatchEditRole] = useState('STUDENT')
  const [operating, setOperating] = useState(false)

  const handleConfirm = async () => {
    if (userIds.size === 0) return

    setOperating(true)
    try {
      const response = await fetchWithCookie('/api/admin/users/batch-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: Array.from(userIds),
          role: batchEditRole
        })
      })

      const data = await response.json()
      if (data.success) {
        onSuccess()
      } else {
        await dialog.alert({ tone: 'error', message: data.error || '批量修改失败' })
      }
    } catch {
      await dialog.alert({ tone: 'error', message: '网络错误' })
    } finally {
      setOperating(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="批量修改角色"
      closeOnOverlayClick={!operating}
      closeOnEsc={!operating}
      footer={
        <div className="flex gap-3 justify-end w-full">
          <button onClick={onClose} className="btn btn-ghost" disabled={operating}>
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={operating}
            className="btn btn-primary flex items-center gap-2"
          >
            {operating && <Loader2 className="w-4 h-4 animate-spin" />}
            确认修改
          </button>
        </div>
      }
    >
      <p className="text-muted-foreground mb-4">
        将选中的 <span className="text-foreground font-medium">{userIds.size}</span> 个用户的角色修改为：
      </p>
      <select
        value={batchEditRole}
        onChange={(e) => setBatchEditRole(e.target.value)}
        className="input"
      >
        <option value="STUDENT">学生</option>
        <option value="TEACHER">教师</option>
        {operatorIsSystemAdmin && <option value="ADMIN">管理员</option>}
      </select>
    </Modal>
  )
}
