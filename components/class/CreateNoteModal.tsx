'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Tag, AlertCircle } from 'lucide-react'
import { CreateModalShell } from '@/components/common'
import { fetchWithCookie } from '@/lib/api/base'

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
  classId,
}: {
  open: boolean
  onClose: () => void
  onCreated?: () => void
  classId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState(defaultForm)

  const resetForm = useCallback(() => {
    setFormData(defaultForm())
    setError('')
  }, [])

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

    try {
      setLoading(true)
      const response = await fetchWithCookie(`/api/classes/${classId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          category: formData.category,
          tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      })
      const data = await response.json()
      if (data.success) {
        onCreated?.()
        onClose()
        router.push(`/classes/${classId}/notes`)
      } else {
        setError(data.error || '创建失败')
      }
    } catch {
      setError('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <CreateModalShell
      open={open}
      onClose={onClose}
      title="创建笔记"
      icon={FileText}
      labelledById="create-note-title"
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 标题 */}
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

          {/* 分类 + 标签 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">分类</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input w-full"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
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
              <p className="mt-1 text-xs text-muted-foreground">例如：贪心算法, 基础题</p>
            </div>
          </div>

          {/* 内容 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              笔记内容 <span className="text-error">*</span>
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="支持 Markdown…"
              rows={16}
              className="input w-full font-mono text-sm resize-y"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">{formData.content.length} 字符</p>
          </div>

          {/* Markdown 提示 */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-2">
              <FileText className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">Markdown 提示</p>
                <p>
                  <code className="bg-muted px-1 rounded text-xs"># 标题</code>、
                  <code className="bg-muted px-1 rounded text-xs">**粗体**</code>、
                  <code className="bg-muted px-1 rounded text-xs">`代码`</code>、代码块用三个反引号
                </p>
              </div>
            </div>
          </div>

          {/* 提示信息 */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>笔记创建后班级成员可查看</li>
                <li>仅作者可编辑、删除</li>
                <li>建议使用清晰标题与标签便于搜索</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
          <button type="submit" disabled={loading} className="btn btn-primary flex-1">
            {loading ? '创建中…' : '创建笔记'}
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            取消
          </button>
        </div>
      </form>
    </CreateModalShell>
  )
}
