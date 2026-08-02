'use client'

import { useCallback, useState } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import Link from 'next/link'
import { fetchWithCookie } from '@/lib/api/base'
import { AdminPageShell } from '@/components/admin'
import { Check, X, EyeOff, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { useDialog } from '@/components/common/DialogProvider'
import Modal from '@/components/common/Modal'

interface ReviewRow {
  id: string
  title: string
  status: string
  reviewNote: string | null
  codeLanguage: string | null
  views: number
  createdAt: string
  problem: { id: string; problemNumber: string | null; title: string }
  author: { id: string; username: string; nickname: string | null; avatar?: string | null }
}

const STATUS_TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
  { key: 'hidden', label: '已下架' },
  { key: 'all', label: '全部' },
]

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: '待审核', className: 'bg-warning/10 text-warning' },
  approved: { label: '已通过', className: 'bg-secondary/10 text-secondary' },
  rejected: { label: '已驳回', className: 'bg-error/10 text-error' },
  hidden: { label: '已下架', className: 'bg-muted text-muted-foreground' },
}

const PAGE_SIZE = 20

export default function AdminReviewsPage() {
  const dialog = useDialog()
  const [items, setItems] = useState<ReviewRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)

  // 驳回弹窗
  const [rejectTarget, setRejectTarget] = useState<ReviewRow | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const res = await fetchWithCookie(
        `/api/admin/reviews?status=${status}&page=${page}&pageSize=${PAGE_SIZE}`
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

  const doAction = async (row: ReviewRow, action: 'approve' | 'reject' | 'hide', note?: string) => {
    setSubmitting(true)
    try {
      const res = await fetchWithCookie(`/api/admin/reviews/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      })
      const data = await res.json()
      if (data.success) {
        setRejectTarget(null)
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

  const handleAction = async (row: ReviewRow, action: 'approve' | 'reject' | 'hide') => {
    if (action === 'reject') {
      setRejectTarget(row)
      setRejectNote('')
      return
    }
    const isApprove = action === 'approve'
    const confirmed = await dialog.confirm({
      tone: isApprove ? 'info' : 'warning',
      title: isApprove ? '通过题解' : '下架题解',
      message: isApprove
        ? `确定通过「${row.title}」？通过后将对所有用户可见。`
        : `确定下架「${row.title}」？下架后其他用户将不可见，作者仍可在编辑页看到。`,
      confirmText: isApprove ? '通过' : '下架',
      confirmVariant: isApprove ? 'primary' : 'destructive',
    })
    if (!confirmed) return
    await doAction(row, action)
  }

  const confirmReject = () => {
    if (!rejectTarget) return
    void doAction(rejectTarget, 'reject', rejectNote)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <AdminPageShell className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>题解发布前审核，未通过内容对其他用户不可见</span>
        </div>
        <span className="text-xs text-muted-foreground">
          共 {total} 条{status !== 'all' ? ` · ${STATUS_META[status]?.label ?? ''}` : ''}
        </span>
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
          暂无题解，切换状态查看其他列表
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((row) => {
            const meta = STATUS_META[row.status] ?? { label: row.status, className: 'bg-muted text-muted-foreground' }
            return (
              <div key={row.id} className="card-static rounded-xl p-5">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${meta.className}`}>
                        {meta.label}
                      </span>
                      {row.codeLanguage && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                          {row.codeLanguage}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </span>
                    </div>
                    <h3 className="font-semibold text-foreground break-words">
                      <Link
                        href={`/problems/${row.problem.id}/solutions/${row.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
                      >
                        {row.title}
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      </Link>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      <Link href={`/problems/${row.problem.id}`} className="hover:text-primary transition-colors">
                        {row.problem.problemNumber ? `${row.problem.problemNumber} · ` : ''}
                        {row.problem.title}
                      </Link>
                      {'  ·  '}作者：{row.author.nickname || row.author.username}（{row.author.username}）
                    </p>
                    {row.reviewNote && (
                      <p className="text-xs text-warning mt-1.5 bg-warning/5 rounded-md px-2 py-1 inline-block">
                        备注：{row.reviewNote}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {row.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => handleAction(row, 'approve')}
                        disabled={submitting}
                        className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        通过
                      </button>
                    )}
                    {row.status !== 'rejected' && (
                      <button
                        type="button"
                        onClick={() => handleAction(row, 'reject')}
                        disabled={submitting}
                        className="btn btn-ghost btn-sm inline-flex items-center gap-1.5 text-error"
                      >
                        <X className="w-4 h-4" />
                        驳回
                      </button>
                    )}
                    {row.status !== 'hidden' && (
                      <button
                        type="button"
                        onClick={() => handleAction(row, 'hide')}
                        disabled={submitting}
                        className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
                        title="下架（其他用户不可见）"
                      >
                        <EyeOff className="w-4 h-4" />
                        下架
                      </button>
                    )}
                  </div>
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

      {rejectTarget && (
        <Modal
          open
          onClose={() => setRejectTarget(null)}
          title="驳回题解"
          size="sm"
          closeOnOverlayClick={!submitting}
          closeOnEsc={!submitting}
          footer={
            <div className="flex justify-end gap-2 w-full">
              <button type="button" className="btn btn-outline" onClick={() => setRejectTarget(null)}>
                取消
              </button>
              <button type="button" className="btn btn-destructive" disabled={submitting} onClick={confirmReject}>
                {submitting ? '提交中…' : '确认驳回'}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              驳回「{rejectTarget.title}」后，该题解对其他用户不可见，作者仍可编辑修改后重新提交审核。
            </p>
            <div>
              <label className="text-sm font-medium">驳回原因（选填）</label>
              <textarea
                className="input w-full mt-1 min-h-[80px]"
                placeholder="例如：题解内容与本题无关 / 包含违规内容"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                maxLength={500}
              />
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              原因将展示给作者，帮助其修改后重新提交。
            </p>
          </div>
        </Modal>
      )}
    </AdminPageShell>
  )
}
