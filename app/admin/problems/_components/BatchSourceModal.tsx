'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import type { ProblemSource } from '../_types'

interface BatchSourceModalProps {
  ids: string[]
  onClose: () => void
  onSuccess: () => void
}

/**
 * 批量修改题目来源标记的弹窗。
 *
 * 内部维护 targetSource 单选状态与 processing loading；
 * 成功后 alert 服务端返回的 message，并回调 onSuccess。
 */
export function BatchSourceModal({ ids, onClose, onSuccess }: BatchSourceModalProps) {
  const [targetSource, setTargetSource] = useState<ProblemSource>('MANUAL_CREATED')
  const [processing, setProcessing] = useState(false)

  const handleSubmit = async () => {
    if (ids.length === 0) return
    setProcessing(true)
    try {
      const response = await fetchWithCookie('/api/admin/problems/batch-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids,
          source: targetSource
        })
      })
      const data = await response.json()
      if (data.success) {
        alert(data.message)
        onSuccess()
      } else {
        alert(data.error || '批量修改来源失败')
      }
    } catch {
      alert('网络错误')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
      <div className="card p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-bold text-foreground mb-4">批量修改来源标记</h3>
        <p className="text-muted-foreground mb-4 text-sm">正在修改 <span className="text-foreground font-bold">{ids.length}</span> 个题目的来源属性。</p>

        <div className="space-y-3">
          {(['MANUAL_CREATED', 'AI_ASSISTED', 'AI_GENERATED'] as const).map(opt => (
            <label key={opt} className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors">
              <input
                type="radio"
                name="source"
                value={opt}
                checked={targetSource === opt}
                onChange={(e) => setTargetSource(e.target.value as ProblemSource)}
                className="text-primary focus:ring-primary/50"
              />
              <span className="font-medium text-foreground">{opt}</span>
            </label>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-ghost">取消</button>
          <button
            onClick={handleSubmit}
            disabled={processing}
            className="btn btn-primary flex items-center gap-2"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {processing ? '处理中...' : '确认修改'}
          </button>
        </div>
      </div>
    </div>
  )
}
