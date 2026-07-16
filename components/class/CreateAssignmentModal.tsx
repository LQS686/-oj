'use client'

import { useEffect, useState, useCallback } from 'react'
import { BookOpen, AlertCircle, X } from 'lucide-react'
import { fetchWithAuth, fetchWithCookie } from '@/lib/api/base'
import type { ProblemPickItem } from '@/lib/assignment/problemSelection'
import AssignmentProblemPicker from '@/components/class/AssignmentProblemPicker'

function defaultDeadline() {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  return date.toISOString().slice(0, 16)
}

export default function CreateAssignmentModal({
  classId,
  open,
  onClose,
  onCreated,
}: {
  classId: string
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [problemsLoading, setProblemsLoading] = useState(false)
  const [error, setError] = useState('')
  const [problems, setProblems] = useState<ProblemPickItem[]>([])
  const [selectedProblems, setSelectedProblems] = useState<string[]>([])
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    deadline: defaultDeadline(),
  })

  const resetForm = useCallback(() => {
    setFormData({ title: '', description: '', deadline: defaultDeadline() })
    setSelectedProblems([])
    setError('')
  }, [])

  const fetchProblems = useCallback(async () => {
    try {
      setProblemsLoading(true)
      const all: ProblemPickItem[] = []
      let page = 1
      const pageSize = 50
      for (;;) {
        const response = await fetchWithCookie(`/api/problems?page=${page}&pageSize=${pageSize}`)
        const data = await response.json()
        if (!data.success) {
          setError(data.error || '获取题目列表失败')
          break
        }
        const batch = data.data?.problems || []
        all.push(...batch)
        const totalPages = data.data?.totalPages ?? 1
        if (page >= totalPages || batch.length === 0) break
        page += 1
      }
      setProblems(all)
    } catch {
      setError('获取题目列表失败')
    } finally {
      setProblemsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    resetForm()
    void fetchProblems()
  }, [open, resetForm, fetchProblems])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.title.trim()) {
      setError('请输入作业标题')
      return
    }
    if (!formData.deadline) {
      setError('请选择截止时间')
      return
    }
    if (selectedProblems.length === 0) {
      setError('请至少选择一个题目')
      return
    }
    if (new Date(formData.deadline) <= new Date()) {
      setError('截止时间必须晚于当前时间')
      return
    }

    try {
      setLoading(true)
      const response = await fetchWithAuth(`/api/classes/${classId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          deadline: new Date(formData.deadline).toISOString(),
          endTime: new Date(formData.deadline).toISOString(),
          problemIds: selectedProblems,
        }),
      })
      const data = await response.json()
      if (data.success) {
        onCreated()
        onClose()
      } else {
        setError(data.error || data.message || '创建失败')
      }
    } catch {
      setError('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden bg-black/60 p-4 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card-static rounded-xl w-full max-w-2xl h-[min(780px,calc(100dvh-2rem))] flex flex-col shadow-xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-assignment-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 id="create-assignment-title" className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-light" />
            创建作业
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:bg-muted" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid flex-1 min-h-0 overflow-hidden grid-rows-[auto_minmax(0,1fr)_auto_auto]"
        >
          <div className="px-5 pt-4 pb-3 space-y-3 border-b border-border/60 min-h-0">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                作业标题 <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例如：第一周练习作业"
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">作业描述</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="描述作业要求和注意事项"
                rows={2}
                className="input w-full resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                截止时间 <span className="text-error">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.deadline}
                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                className="input w-full"
                required
              />
            </div>
          </div>

          <div className="flex flex-col min-h-0 overflow-hidden px-5 py-3">
            <label className="block text-sm font-medium text-foreground mb-2 shrink-0">
              按题号添加题目 <span className="text-error">*</span>
            </label>
            <AssignmentProblemPicker
              orderedIds={selectedProblems}
              onChange={setSelectedProblems}
              problems={problems}
              problemsLoading={problemsLoading}
            />
          </div>

          <div className="shrink-0 px-5 pb-2 space-y-2 border-t border-border/60 pt-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex gap-2 text-xs text-muted-foreground">
              <AlertCircle className="w-4 h-4 shrink-0 text-primary mt-0.5" />
              <span>仅支持按题号添加；成员按下方列表顺序做题。</span>
            </div>
            {error && (
              <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error">{error}</div>
            )}
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button type="submit" disabled={loading || problemsLoading} className="btn btn-primary flex-1">
              {loading ? '创建中...' : '创建作业'}
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost">
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}