'use client'

import { useState } from 'react'
import Modal from '@/components/common/Modal'
import { fetchWithCookie } from '@/lib/api/base'
import { CheckCircle2 } from 'lucide-react'

export interface ReportModalProps {
  open: boolean
  onClose: () => void
  /** 目标类型（当前支持 SOLUTION） */
  targetType: string
  targetId: string
  targetTitle?: string
}

const REASONS = ['违法有害信息', '侵权内容', '垃圾广告', '其他']

/**
 * 举报弹窗（安全合规：投诉举报机制）
 * 仅登录用户可举报；同一内容不可重复提交待处理举报。
 */
export default function ReportModal({
  open,
  onClose,
  targetType,
  targetId,
  targetTitle,
}: ReportModalProps) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleClose = () => {
    setReason('')
    setDetail('')
    setError('')
    setDone(false)
    onClose()
  }

  const submit = async () => {
    if (!reason) {
      setError('请选择举报原因')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetchWithCookie('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, reason, detail }),
      })
      const data = await res.json().catch(() => null)
      if (data?.success) {
        setDone(true)
      } else {
        setError(data?.error || '举报提交失败')
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="举报内容"
      size="sm"
      closeOnOverlayClick={!submitting}
      closeOnEsc={!submitting}
      footer={
        !done ? (
          <div className="flex justify-end gap-2 w-full">
            <button type="button" className="btn btn-outline" onClick={handleClose}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting}
              onClick={() => void submit()}
            >
              {submitting ? '提交中…' : '提交举报'}
            </button>
          </div>
        ) : (
          <div className="flex justify-end w-full">
            <button type="button" className="btn btn-primary" onClick={handleClose}>
              关闭
            </button>
          </div>
        )
      }
    >
      {done ? (
        <div className="text-center py-8">
          <CheckCircle2 className="w-12 h-12 text-secondary mx-auto mb-3" />
          <p className="text-foreground font-medium mb-1">举报已提交</p>
          <p className="text-sm text-muted-foreground">管理员将尽快核实处理，感谢你的反馈。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {targetTitle && (
            <p className="text-sm text-muted-foreground break-words">
              举报内容：{targetTitle}
            </p>
          )}
          {error && <p className="text-error text-sm">{error}</p>}
          <div>
            <label className="text-sm font-medium">举报原因</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                    reason === r
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">补充说明（选填，最多 500 字）</label>
            <textarea
              className="input w-full mt-1 min-h-[90px]"
              placeholder="描述违规内容的具体情况，便于管理员核实"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
