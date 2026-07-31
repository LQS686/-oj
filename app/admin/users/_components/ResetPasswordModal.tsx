'use client'

import { useState } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import { useDialog } from '@/components/common/DialogProvider'
import Modal from '@/components/common/Modal'
import type { User } from '../_utils'

interface ResetPasswordModalProps {
  user: User
  onClose: () => void
}

/**
 * 重置用户密码对话框（仅 SYSTEM_ADMIN 可触发）。
 * 密码长度至少 6 位。
 */
export function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const dialog = useDialog()
  const [password, setPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  const handleReset = async () => {
    if (!password) {
      await dialog.alert({ tone: 'warning', message: '请输入新密码' })
      return
    }
    if (password.length < 6) {
      await dialog.alert({ tone: 'warning', message: '密码长度至少为6位' })
      return
    }

    setResetting(true)
    try {
      const response = await fetchWithCookie(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })

      const data = await response.json()
      if (data.success) {
        onClose()
      } else {
        await dialog.alert({ tone: 'error', message: data.error || '重置失败' })
      }
    } catch {
      await dialog.alert({ tone: 'error', message: '网络错误' })
    } finally {
      setResetting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="重置密码"
      closeOnOverlayClick={!resetting}
      closeOnEsc={!resetting}
      footer={
        <div className="flex gap-3 justify-end w-full">
          <button onClick={onClose} disabled={resetting} className="btn btn-ghost">
            取消
          </button>
          <button onClick={handleReset} disabled={resetting} className="btn btn-primary">
            {resetting ? '重置中...' : '确认重置'}
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground mb-4">
        为用户 <span className="text-foreground font-medium">{user.username}</span> 设置新密码
      </p>
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-2">新密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少6位"
          className="input"
          autoComplete="new-password"
        />
      </div>
    </Modal>
  )
}
