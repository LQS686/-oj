'use client'

import { useCallback, useEffect, useState } from 'react'
import { Calendar, Edit, FileText, Tag, Trash2, User, AlertCircle } from 'lucide-react'
import { CreateModalShell } from '@/components/common'
import MarkdownRenderer from '@/components/common/MarkdownRenderer'
import { fetchWithCookie } from '@/lib/api/base'
import { formatDateTime } from '@/lib/utils'

export type ClassNoteDetail = {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  author: {
    id: string
    username: string
    nickname?: string
    avatar?: string
  }
  createdAt: string
  updatedAt: string
}

export default function ViewNoteModal({
  open,
  onClose,
  classId,
  noteId,
  currentUserId,
  onDeleted,
  onEdit,
}: {
  open: boolean
  onClose: () => void
  classId: string
  noteId: string | null
  currentUserId?: string
  onDeleted?: () => void
  onEdit?: (note: ClassNoteDetail) => void
}) {
  const [note, setNote] = useState<ClassNoteDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!noteId) return
    try {
      setLoading(true)
      setError('')
      setNote(null)
      const res = await fetchWithCookie(`/api/classes/${classId}/notes/${noteId}`)
      const data = await res.json()
      if (data.success) {
        setNote(data.data)
      } else {
        setError(data.error || '加载笔记失败')
      }
    } catch {
      setError('加载笔记失败')
    } finally {
      setLoading(false)
    }
  }, [classId, noteId])

  useEffect(() => {
    if (!open || !noteId) {
      setNote(null)
      setError('')
      return
    }
    void load()
  }, [open, noteId, load])

  const handleDelete = async () => {
    if (!noteId || !confirm('确定要删除这篇笔记吗？此操作不可恢复！')) return
    try {
      setDeleting(true)
      const res = await fetchWithCookie(`/api/classes/${classId}/notes/${noteId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        onDeleted?.()
        onClose()
      } else {
        alert(data.error || '删除失败')
      }
    } catch {
      alert('删除失败，请重试')
    } finally {
      setDeleting(false)
    }
  }

  const isAuthor = !!(note && currentUserId && note.author.id === currentUserId)
  const title = note?.title || '笔记'

  return (
    <CreateModalShell
      open={open}
      onClose={onClose}
      title={title}
      icon={FileText}
      labelledById="view-note-title"
    >
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">加载中…</p>
          ) : error ? (
            <div className="text-center py-10">
              <AlertCircle className="w-8 h-8 text-error mx-auto mb-3" />
              <p className="text-sm text-error mb-3">{error}</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
                重试
              </button>
            </div>
          ) : note ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  {note.author.avatar ? (
                    <img
                      src={note.author.avatar}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <User className="w-3 h-3 text-white" />
                    </span>
                  )}
                  <span className="text-foreground">
                    {note.author.nickname || note.author.username}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDateTime(note.createdAt)}
                </span>
                {note.category ? <span className="tag">{note.category}</span> : null}
                {note.tags.map((tag) => (
                  <span key={tag} className="tag tag-primary inline-flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {tag}
                  </span>
                ))}
              </div>

              <div className="prose prose-sm max-w-none text-foreground border-t border-border pt-4">
                <MarkdownRenderer content={note.content} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
          <div className="flex items-center gap-2">
            {isAuthor && note ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onEdit?.(note)}
                >
                  <Edit className="w-4 h-4" />
                  编辑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-error"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                >
                  <Trash2 className="w-4 h-4" />
                  {deleting ? '删除中…' : '删除'}
                </button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">班级笔记</span>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </CreateModalShell>
  )
}
