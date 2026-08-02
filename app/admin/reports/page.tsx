'use client'

import { useCallback, useState } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { fetchWithCookie } from '@/lib/api/base'
import { AdminPageShell } from '@/components/admin'
import { Flag, Check, X, Trash2, AlertCircle } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { useDialog } from '@/components/common/DialogProvider'
import Modal from '@/components/common/Modal'

interface ReportRow {
  id: string
  targetType: string
  targetId: string
  targetTitle: string | null
  reason: string
  detail: string | null
  status: string
  handleNote: string | null
  createdAt: string
  reporter: { id: string; username: string; nickname: string | null }
}

const STATUS_TABS = [
  { key: 'pending', label: '待处理' },
  { key: 'resolved', label: '已处理' },
  { key: 'dismissed', label: '已驳回' },
  { key: 'all', label: '全部' },
]

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '待处理', className: 'bg-warning/10 text-warning' },
  resolved: { label: '已处理', className: 'bg-secondary/10 text-secondary' },
  dismissed: { label: '已驳回', className: 'bg-muted text-muted-foreground' },
}

const PAGE_SIZE = 20

function getTargetLabel(type: string): string {
  if (type === 'SOLUTION') return '题解'
  if (type === 'ANNOUNCEMENT') return '公告'
  if (type === 'CLASS_NOTE') return '班级笔记'
  return type
}

export default function AdminReportsPage() {
  const dialog = useDialog()
  const [items, setItems] = useState<ReportRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)

  // 处理弹窗
  const [handleTarget, setHandleTarget] = useState<ReportRow | null>(null)
  const [handleMode, setHandleMode] = useState<'resolved' | 'dismissed'>('resolved')
  const [handleNote, setHandleNote] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetchWithCookie(
        `/api/admin/reports?status=${status}&page=${page}&pageSize=${PAGE_SIZE}`
      )
      const data = await res.json()
      if (data.success) {
        setItems(data.data?.items ?? [])
        setTotal(data.data?.total ?? 0)
      } else {
        setError(data.error || '加载失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [status, page])

  useDeferredEffect(() => {
    void load()
  }, [load])

  const switchTab = (key: string) => {
    setStatus(key)
    setPage(1)
  }

  const openHandle = (row: ReportRow, mode: 'resolved' | 'dismissed') => {
    setHandleTarget(row)
    setHandleMode(mode)
    setHandleNote('')
    setDeleteTarget(false)
  }

  const submitHandle = async () => {
    if (!handleTarget) return
    setSubmitting(true)
    try {
      const res = await fetchWithCookie(`/api/admin/reports/${handleTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: handleMode,
          handleNote,
          deleteTarget,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setHandleTarget(null)
        await load()
      } else {
        await dialog.alert({ tone: 'error', message: data.error || '操作失败' })
      }
    } catch {
      await dialog.alert({ tone: 'error', message: '网络错误' })
    } finally {
      setSubmitting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <AdminPageShell className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Flag className="w-4 h-4 text-primary" />
          <span>用户举报的违法有害信息 / 侵权内容等，处理后留痕备查</span>
        </div>
        <span className="text-xs text-muted-foreground">共 {total} 条</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap border-b border-border pb-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => switchTab(tab.key)}
            className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition-colors ${
              status === tab.key
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="text-error text-sm">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-static rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/2 mb-3" />
              <div className="h-3 bg-muted rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card-static rounded-xl p-10 text-center text-muted-foreground">
          {status === 'pending' ? '暂无待处理举报，全部干净' : '该状态下暂无举报记录'}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((row) => {
            const meta = STATUS_META[row.status] ?? { label: row.status, className: 'bg-muted text-muted-foreground' }
            const canHandle = row.status === 'pending'
            return (
              <div key={row.id} className="card-static rounded-xl p-5">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${meta.className}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-error/10 text-error">
                        {row.reason}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span>
                    </div>
                    <h3 className="font-semibold text-foreground break-words">
                      {getTargetLabel(row.targetType)}：{row.targetTitle || '（内容已删除）'}
                      {row.targetType === 'SOLUTION' && row.targetTitle && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-2">
                          ID: {row.targetId}
                        </span>
                      )}
                    </h3>
                    {row.detail && (
                      <p className="text-sm text-foreground/80 mt-1.5 bg-muted/40 rounded-md px-3 py-2 break-words">
                        {row.detail}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      举报人：{row.reporter.nickname || row.reporter.username}（{row.reporter.username}）
                      {row.handleNote && <span className="text-primary/80"> · 处理备注：{row.handleNote}</span>}
                    </p>
                  </div>
                  {canHandle && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openHandle(row, 'resolved')}
                        className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        标记处理
                      </button>
                      <button
                        type="button"
                        onClick={() => openHandle(row, 'dismissed')}
                        className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
                      >
                        <X className="w-4 h-4" />
                        驳回
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </button>
        </div>
      )}

      {handleTarget && (
        <Modal
          open
          onClose={() => setHandleTarget(null)}
          title={handleMode === 'resolved' ? '处理举报' : '驳回举报'}
          size="sm"
          closeOnOverlayClick={!submitting}
          closeOnEsc={!submitting}
          footer={
            <div className="flex justify-end gap-2 w-full">
              <button type="button" className="btn btn-outline" onClick={() => setHandleTarget(null)}>
                取消
              </button>
              <button
                type="button"
                className={handleMode === 'resolved' ? 'btn btn-primary' : 'btn btn-outline'}
                disabled={submitting}
                onClick={submitHandle}
              >
                {submitting ? '提交中…' : handleMode === 'resolved' ? '确认处理' : '确认驳回'}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              举报内容：{getTargetLabel(handleTarget.targetType)}「{handleTarget.targetTitle || '已删除'}」
            </p>
            <div>
              <label className="text-sm font-medium">处理备注（选填，留痕备查）</label>
              <textarea
                className="input w-full mt-1 min-h-[80px]"
                placeholder="记录处理情况，便于审计追溯"
                value={handleNote}
                onChange={(e) => setHandleNote(e.target.value)}
                maxLength={500}
              />
            </div>
            {handleTarget.targetType === 'SOLUTION' && handleTarget.targetTitle && (
              <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteTarget}
                  onChange={(e) => setDeleteTarget(e.target.checked)}
                  className="accent-primary"
                />
                <span className="inline-flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5 text-error" />
                  同时删除被举报的题解
                </span>
              </label>
            )}
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              删除内容后作者无法找回；举报记录将保留并写入处理备注，用于安全评估审计。
            </p>
          </div>
        </Modal>
      )}
    </AdminPageShell>
  )
}
