'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Tag, AlertCircle } from 'lucide-react'
import { CreateModalShell } from '@/components/common'
import { fetchWithCookie } from '@/lib/api/base'
import type { ClassNoteDetail } from './ViewNoteModal'

const CATEGORIES = ['General', '算法', '数据结构', '动态规划', '图论', '字符串', '数学', '其他']

const defaultForm = () => ({
  title: '',
  content: '',
  category: 'General',
  tags: '',
})

export default function CreateNoteModal({
  open,
  onClose,
  onCreated,
  onSaved,
  classId,
  editNote,
}: {
  open: boolean
  onClose: () => void
  onCreated?: () => void
  onSaved?: () => void
  classId: string
  /** 传入则进入编辑模式 */
  editNote?: ClassNoteDetail | null
}) {
  const isEdit = !!editNote
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState(defaultForm)

  const resetForm = useCallback(() => {
    if (editNote) {
      setFormData({
        title: editNote.title,
        content: editNote.content,
        category: editNote.category || 'General',
        tags: (editNote.tags || []).join(', '),
      })
    } else {
      setFormData(defaultForm())
    }
    setError('')
  }, [editNote])

  useEffect(() => {
    if (!open) return
    resetForm()
  }, [open, resetForm])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.title.trim()) {
      setError('请输入笔记标题')
      return
    }
    if (!formData.content.trim()) {
      setError('请输入笔记内容')
      return
    }

    const payload = {
      title: formData.title.trim(),
      content: formData.content,
      category: formData.category,
      tags: formData.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }

    try {
      setLoading(true)
      const response = await fetchWithCookie(
        isEdit
          ? `/api/classes/${classId}/notes/${editNote!.id}`
          : `/api/classes/${classId}/notes`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const data = await response.json()
      if (data.success) {
        if (isEdit) onSaved?.()
        else onCreated?.()
        onClose()
      } else {
        setError(data.error || (isEdit ? '保存失败' : '创建失败'))
      }
    } catch {
      setError(isEdit ? '保存失败，请重试' : '创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <CreateModalShell
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑笔记' : '创建笔记'}
      icon={FileText}
      labelledById={isEdit ? 'edit-note-title' : 'create-note-title'}
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              笔记标题 <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="例如：二分查找算法总结"
              maxLength={100}
              className="input w-full"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">{formData.title.length} / 100</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">分类</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input w-full"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">标签</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="多个标签用逗号分隔"
                  className="input w-full pr-10"
                />
                <Tag className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              笔记内容 <span className="text-error">*</span>
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="支持 Markdown…"
              rows={12}
              className="input w-full font-mono text-sm resize-y"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">{formData.content.length} 字符</p>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
          <button type="submit" disabled={loading} className="btn btn-primary flex-1">
            {loading ? (isEdit ? '保存中…' : '创建中…') : isEdit ? '保存' : '创建笔记'}
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            取消
          </button>
        </div>
      </form>
    </CreateModalShell>
  )
}
