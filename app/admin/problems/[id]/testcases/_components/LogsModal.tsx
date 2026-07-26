'use client'

import { Clock, Loader2 } from 'lucide-react'
import { Modal } from '@/components/common'
import { formatDateTime } from '@/lib/utils'

interface VerificationLogItem {
  id: string
  status: string
  details?: {
    passed?: number
    failed?: number
    fixedCount?: number
    compileError?: string
  } | null
  createdAt: string
}

interface LogsModalProps {
  open: boolean
  onClose: () => void
  loading: boolean
  logs: VerificationLogItem[]
}

export function LogsModal({ open, onClose, loading, logs }: LogsModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="验证日志"
      icon={<Clock className="w-5 h-5 text-muted-foreground" />}
    >
      <div className="max-h-[60vh] overflow-y-auto custom-scrollbar -mx-1 px-1">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">暂无验证记录</div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const ok = log.status === 'SUCCESS'
              return (
                <div
                  key={log.id}
                  className={`p-3.5 rounded-lg border ${
                    ok
                      ? 'bg-success/10 border-success/30'
                      : 'bg-error/10 border-error/30'
                  }`}
                >
                  <div className="flex justify-between items-start gap-3 mb-1.5">
                    <span className={`text-sm font-semibold ${ok ? 'text-success' : 'text-error'}`}>
                      {ok ? '验证通过' : '验证失败'}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    {log.details?.compileError ? (
                      <div className="text-error whitespace-pre-wrap break-words">
                        编译错误：{log.details.compileError}
                      </div>
                    ) : (
                      <>
                        <div>通过测试点：{log.details?.passed ?? '—'}</div>
                        <div>失败测试点：{log.details?.failed ?? '—'}</div>
                        {log.details?.fixedCount != null && (
                          <div>自动纠正：{log.details.fixedCount}</div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
