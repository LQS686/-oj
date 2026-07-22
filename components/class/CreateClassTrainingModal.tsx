'use client'

/**
 * 班级私有题单创建弹窗
 *
 * 与 CreateAssignmentModal 类似，但：
 * - 没有 deadline，题单长期有效
 * - 调用 POST /api/classes/[id]/trainings
 * - 创建后跳转题单详情页 /training/[id]（题单详情页支持班级私有题单）
 */
import { useEffect, useState, useCallback } from 'react'
import { ListChecks, AlertCircle } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { CreateModalShell } from '@/components/common'
import type { ProblemPickItem } from '@/lib/assignment/problemSelection'
import AssignmentProblemPicker from '@/components/class/AssignmentProblemPicker'

export default function CreateClassTrainingModal({
  classId,
  open,
  onClose,
  onCreated,
}: {
  classId: string
  open: boolean
  onClose: () => void
  onCreated: (trainingId: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [problemsLoading, setProblemsLoading] = useState(false)
  const [error, setError] = useState('')
  const [problems, setProblems] = useState<ProblemPickItem[]>([])
  const [selectedProblems, setSelectedProblems] = useState<string[]>([])
  const [formData, setFormData] = useState({
    title: '',
    description: '',
  })

  const resetForm = useCallback(() => {
    setFormData({ title: '', description: '' })
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.title.trim()) {
      setError('请输入题单标题')
      return
    }
    if (!formData.description.trim()) {
      setError('请输入题单描述')
      return
    }
    if (selectedProblems.length === 0) {
      setError('请至少选择一个题目')
      return
    }

    try {
      setLoading(true)
      const response = await fetchWithCookie(`/api/classes/${classId}/trainings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          problemIds: selectedProblems,
        }),
      })
      const data = await response.json()
      if (data.success) {
        onCreated(data.data?.id)
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

  return (
    <CreateModalShell
      open={open}
      onClose={onClose}
      title="创建班级题单"
      icon={ListChecks}
      labelledById="create-class-training-title"
    >
      <form
        onSubmit={handleSubmit}
        className="grid flex-1 min-h-0 overflow-hidden grid-rows-[auto_minmax(0,1fr)_auto_auto]"
      >
        <div className="px-5 pt-4 pb-3 space-y-3 border-b border-border/60 min-h-0">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              题单标题 <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="例如：图论基础练习"
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              题单描述 <span className="text-error">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="描述题单的学习目标、推荐顺序等"
              rows={3}
              className="input w-full resize-none"
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
            <span>班级题单仅班级成员可见；创建后可在题单详情页继续添加/调整题目。</span>
          </div>
          {error && (
            <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error">{error}</div>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
          <button type="submit" disabled={loading || problemsLoading} className="btn btn-primary flex-1">
            {loading ? '创建中...' : '创建题单'}
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            取消
          </button>
        </div>
      </form>
    </CreateModalShell>
  )
}
