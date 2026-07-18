'use client'

import { useEffect, useState, useCallback } from 'react'
import { BookOpen, AlertCircle, X } from 'lucide-react'
import { fetchWithAuth, fetchWithCookie } from '@/lib/api/base'
import type { ProblemPickItem } from '@/lib/assignment/problemSelection'
import AssignmentProblemPicker from '@/components/class/AssignmentProblemPicker'

// 将 Date 转为 <input type="datetime-local"> 所需的本地时间字符串 "YYYY-MM-DDTHH:mm"
// 不能用 toISOString().slice(0,16) —— 那会返回 UTC 时间，导致默认值显示偏移 8 小时
function toLocalDatetimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function defaultStartTime() {
  // 默认开始时间：当前时间 + 1 分钟（避免 upcoming 状态立即变 active 的边界情况）
  const date = new Date()
  date.setMinutes(date.getMinutes() + 1)
  return toLocalDatetimeInput(date)
}

function defaultEndTime() {
  // 默认结束时间：当前时间 + 7 天
  const date = new Date()
  date.setDate(date.getDate() + 7)
  return toLocalDatetimeInput(date)
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
    startTime: defaultStartTime(),
    endTime: defaultEndTime(),
  })

  const resetForm = useCallback(() => {
    setFormData({ title: '', description: '', startTime: defaultStartTime(), endTime: defaultEndTime() })
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
    if (!formData.startTime) {
      setError('请选择开始时间')
      return
    }
    if (!formData.endTime) {
      setError('请选择截止时间')
      return
    }
    if (selectedProblems.length === 0) {
      setError('请至少选择一个题目')
      return
    }
    const startMs = new Date(formData.startTime).getTime()
    const endMs = new Date(formData.endTime).getTime()
    if (Number.isNaN(startMs)) {
      setError('开始时间格式无效')
      return
    }
    if (Number.isNaN(endMs)) {
      setError('截止时间格式无效')
      return
    }
    if (startMs >= endMs) {
      setError('开始时间必须早于截止时间')
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
          startTime: new Date(formData.startTime).toISOString(),
          endTime: new Date(formData.endTime).toISOString(),
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
        className="card-static rounded-xl w-full max-w-2xl h-[80vh] flex flex-col shadow-xl border border-border overflow-hidden"
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
            className="flex-1 min-h-0 overflow-y-auto flex flex-col"
          >
          <div className="px-5 pt-4 pb-3 space-y-3 border-b border-border/60">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  开始时间 <span className="text-error">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="input w-full"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">到达此时间后学生可提交</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  截止时间 <span className="text-error">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="input w-full"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">超过此时间为逾期提交</p>
              </div>
            </div>
          </div>

          <div className="px-5 py-3">
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

          <div className="px-5 pb-2 space-y-2 border-t border-border/60 pt-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex gap-2 text-xs text-muted-foreground">
              <AlertCircle className="w-4 h-4 shrink-0 text-primary mt-0.5" />
              <span>仅支持按题号添加；成员按下方列表顺序做题。</span>
            </div>
            {error && (
              <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error">{error}</div>
            )}
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-border">
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