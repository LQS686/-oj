'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithCookie } from '@/lib/api/base'
import { AdminPageShell } from '@/components/admin'
import { Plus, Edit, Trash2, Pin, Eye, EyeOff } from 'lucide-react'
import { formatDateTime, toLocalDatetimeInput } from '@/lib/utils'
import { useDialog } from '@/components/common/DialogProvider'
import { useUser } from '@/contexts/UserContext'
import { canManageSystemAnnouncements } from '@/lib/permissions'

interface AnnouncementRow {
  id: string
  title: string
  content: string
  isPinned: boolean
  isPublished: boolean
  publishedAt: string | null
  expiresAt: string | null
  authorName: string
  updatedAt: string
}

const emptyForm = {
  title: '',
  content: '',
  isPinned: false,
  isPublished: true,
  expiresAt: '',
}

function getPublicStatus(row: AnnouncementRow): { label: string; className: string } {
  if (!row.isPublished) {
    return { label: '草稿', className: 'bg-muted text-muted-foreground' }
  }
  const now = Date.now()
  if (row.expiresAt && new Date(row.expiresAt).getTime() < now) {
    return {
      label: '已过期',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    }
  }
  if (row.publishedAt && new Date(row.publishedAt).getTime() > now) {
    return {
      label: '定时发布',
      className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    }
  }
  return {
    label: '展示中',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }
}

export default function AdminAnnouncementsPage() {
  const dialog = useDialog()
  const router = useRouter()
  const { user, isLoading: userLoading } = useUser()
  const [items, setItems] = useState<AnnouncementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AnnouncementRow | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(null)

  useEffect(() => {
    if (userLoading) return
    if (!canManageSystemAnnouncements(user)) {
      setError('需要系统管理员权限')
      setLoading(false)
      router.replace('/403')
    }
  }, [user, userLoading, router])

  const load = useCallback(async () => {
    if (!canManageSystemAnnouncements(user)) return
    try {
      setLoading(true)
      const res = await fetchWithCookie('/api/admin/announcements')
      if (res.status === 403) {
        setError('需要系统管理员权限')
        setTimeout(() => router.push('/403'), 2000)
        return
      }
      const data = await res.json()
      if (data.success) {
        setItems(data.data?.items ?? [])
      } else {
        setError(data.error || '加载失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [router, user])

  useEffect(() => {
    if (userLoading || !canManageSystemAnnouncements(user)) return
    load()
  }, [load, user, userLoading])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (row: AnnouncementRow) => {
    setEditing(row)
    setForm({
      title: row.title,
      content: row.content,
      isPinned: row.isPinned,
      isPublished: row.isPublished,
      expiresAt: row.expiresAt ? toLocalDatetimeInput(row.expiresAt) : '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      await dialog.alert({ tone: 'warning', message: '请填写标题和内容' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        content: form.content,
        isPinned: form.isPinned,
        isPublished: form.isPublished,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      }
      const url = editing ? `/api/admin/announcements/${editing.id}` : '/api/admin/announcements'
      const res = await fetchWithCookie(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        setModalOpen(false)
        load()
      } else {
        await dialog.alert({ tone: 'error', message: data.error || '保存失败' })
      }
    } catch {
      await dialog.alert({ tone: 'error', message: '网络错误' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetchWithCookie(`/api/admin/announcements/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        setDeleteTarget(null)
        load()
      } else {
        await dialog.alert({ tone: 'error', message: data.error || '删除失败' })
      }
    } catch {
      await dialog.alert({ tone: 'error', message: '网络错误' })
    }
  }

  const togglePublished = async (row: AnnouncementRow) => {
    const res = await fetchWithCookie(`/api/admin/announcements/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !row.isPublished }),
    })
    const data = await res.json()
    if (data.success) load()
    else await dialog.alert({ tone: 'error', message: data.error || '操作失败' })
  }

  return (
      <AdminPageShell width="form" className="space-y-6">
        <div className="flex justify-end">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            新建公告
          </button>
        </div>

        {error && <p className="text-error">{error}</p>}

        {loading ? (
          <p className="text-muted-foreground">加载中…</p>
        ) : items.length === 0 ? (
          <div className="card-static rounded-xl p-10 text-center text-muted-foreground">
            暂无公告，点击「新建公告」发布第一条
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((row) => (
              <div key={row.id} className="card-static rounded-xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {row.isPinned && (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <Pin className="w-3 h-3" /> 置顶
                        </span>
                      )}
                      {(() => {
                        const status = getPublicStatus(row)
                        return (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>
                            {status.label}
                          </span>
                        )
                      })()}
                    </div>
                    <h3 className="font-semibold text-foreground">{row.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1 whitespace-pre-wrap">
                      {row.content}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {row.authorName} · 更新于 {formatDateTime(row.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      className="p-2 rounded-lg hover:bg-muted"
                      title={row.isPublished ? '下架' : '发布'}
                      onClick={() => togglePublished(row)}
                    >
                      {row.isPublished ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded-lg hover:bg-muted"
                      onClick={() => openEdit(row)}
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded-lg hover:bg-muted text-red-600"
                      onClick={() => setDeleteTarget(row)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
              <h2 className="text-lg font-bold mb-4">{editing ? '编辑公告' : '新建公告'}</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">标题</label>
                  <input
                    className="input w-full mt-1"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">内容</label>
                  <textarea
                    className="input w-full mt-1 min-h-[160px]"
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">过期时间（可选）</label>
                  <input
                    type="datetime-local"
                    className="input w-full mt-1"
                    value={form.expiresAt}
                    onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isPinned}
                    onChange={(e) => setForm((f) => ({ ...f, isPinned: e.target.checked }))}
                  />
                  置顶
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isPublished}
                    onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))}
                  />
                  立即发布
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" className="btn btn-outline" onClick={() => setModalOpen(false)}>
                  取消
                </button>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-background rounded-xl p-6 max-w-sm w-full">
              <p className="mb-4">确定删除公告「{deleteTarget.title}」？</p>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-outline" onClick={() => setDeleteTarget(null)}>
                  取消
                </button>
                <button type="button" className="btn btn-primary bg-red-600 hover:bg-red-700" onClick={handleDelete}>
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminPageShell>
  )
}