'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithAuth } from '@/lib/api/base'
import { Megaphone, Plus, Edit, Trash2, Pin, Eye, EyeOff } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

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

export default function AdminAnnouncementsPage() {
  const router = useRouter()
  const [items, setItems] = useState<AnnouncementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AnnouncementRow | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetchWithAuth('/api/admin/announcements')
      if (res.status === 403) {
        setError('需要管理员权限')
        setTimeout(() => router.push('/403'), 2000)
        return
      }
      const data = await res.json()
      if (data.success || data.ok) {
        setItems(data.data?.items ?? [])
      } else {
        setError(data.error || '加载失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    load()
  }, [load])

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
      expiresAt: row.expiresAt ? row.expiresAt.slice(0, 16) : '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      alert('请填写标题和内容')
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
      const res = await fetchWithAuth(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success || data.ok) {
        setModalOpen(false)
        load()
      } else {
        alert(data.error || '保存失败')
      }
    } catch {
      alert('网络错误')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetchWithAuth(`/api/admin/announcements/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success || data.ok) {
        setDeleteTarget(null)
        load()
      } else {
        alert(data.error || '删除失败')
      }
    } catch {
      alert('网络错误')
    }
  }

  const togglePublished = async (row: AnnouncementRow) => {
    const res = await fetchWithAuth(`/api/admin/announcements/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !row.isPublished }),
    })
    const data = await res.json()
    if (data.success || data.ok) load()
    else alert(data.error || '操作失败')
  }

  return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Megaphone className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">系统公告</h1>
              <p className="text-sm text-muted-foreground">管理首页展示的公告</p>
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            新建公告
          </button>
        </div>

        {error && <p className="text-error mb-4">{error}</p>}

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
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          row.isPublished
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {row.isPublished ? '已发布' : '草稿'}
                      </span>
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
      </div>
  )
}