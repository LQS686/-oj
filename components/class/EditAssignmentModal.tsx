'use client'

import { useEffect, useState, useCallback } from 'react'
import { Pencil, AlertCircle, X, Trash2 } from 'lucide-react'
import { fetchWithAuth, fetchWithCookie } from '@/lib/api/base'
import type { ProblemPickItem } from '@/lib/assignment/problemSelection'
import AssignmentProblemPicker from '@/components/class/AssignmentProblemPicker'

interface Assignment {
  id: string
  title: string
  description: string
  startTime: string
  endTime: string
  allowLateSubmission?: boolean
  status?: 'upcoming' | 'active' | 'ended'
  problems: ProblemPickItem[]
}

function formatDateForInput(dateString: string) {
  if (!dateString) return ''
  const date = new Date(dateString)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

async function fetchAllPublicProblems(): Promise<ProblemPickItem[]> {
  const all: ProblemPickItem[] = []
  let page = 1
  const pageSize = 50
  for (;;) {
    const response = await fetchWithCookie(`/api/problems?page=${page}&pageSize=${pageSize}`)
    const data = await response.json()
    if (!data.success) throw new Error(data.error || '获取题目列表失败')
    const batch = data.data?.problems || []
    all.push(...batch)
    const totalPages = data.data?.totalPages ?? 1
    if (page >= totalPages || batch.length === 0) break
    page += 1
  }
  return all
}

export default function EditAssignmentModal({
  classId,
  assignmentId,
  open,
  onClose,
  onSaved,
  onDeleted,
}: {
  classId: string
  assignmentId: string | null
  open: boolean
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState('')
  const [problems, setProblems] = useState<ProblemPickItem[]>([])
  const [selectedProblems, setSelectedProblems] = useState<string[]>([])
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    allowLateSubmission: false,
  })
  const [assignmentStatus, setAssignmentStatus] = useState<'upcoming' | 'active' | 'ended' | null>(null)

  const loadAssignment = useCallback(async () => {
    if (!assignmentId) return
    try {
      setDataLoading(true)
      setError('')
      const [assignmentRes, allProblems] = await Promise.all([
        fetchWithAuth(`/api/classes/${classId}/assignments/${assignmentId}`),
        fetchAllPublicProblems(),
      ])
      const assignmentData = await assignmentRes.json()
      if (!assignmentData.success) throw new Error(assignmentData.error || '获取作业详情失败')
      const assignment: Assignment = assignmentData.data.assignment
      setFormData({
        title: assignment.title,
        description: assignment.description || '',
        startTime: formatDateForInput(assignment.startTime),
        endTime: formatDateForInput(assignment.endTime),
        allowLateSubmission: !!assignment.allowLateSubmission,
      })
      setAssignmentStatus(assignment.status ?? null)
      setSelectedProblems(assignment.problems.map((p) => p.id))
      setProblems(allProblems)
    } catch (err: unknown) {
      setError((err as Error).message || '加载失败')
    } finally {
      setDataLoading(false)
    }
  }, [classId, assignmentId])

  useEffect(() => {
    if (!open || !assignmentId) return
    void loadAssignment()
  }, [open, assignmentId, loadAssignment])

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
    if (!assignmentId) return
    setError('')

    if (!formData.title.trim()) {
      setError('请输入作业标题')
      return
    }
    if (!formData.endTime) {
      setError('请选择截止时间')
      return
    }
    if (selectedProblems.length === 0) {
      setError('请至少添加一道题目')
      return
    }
    const endTime = new Date(formData.endTime)
    if (formData.startTime) {
      const startTime = new Date(formData.startTime)
      if (startTime >= endTime) {
        setError('开始时间必须早于截止时间')
        return
      }
    }

    try {
      setLoading(true)
      const response = await fetchWithAuth(`/api/classes/${classId}/assignments/${assignmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          startTime: formData.startTime ? new Date(formData.startTime) : undefined,
          endTime,
          problemIds: selectedProblems,
          allowLateSubmission: formData.allowLateSubmission,
        }),
      })
      const data = await response.json()
      if (data.success) {
        onSaved()
        onClose()
      } else {
        setError(data.error || '保存失败')
      }
    } catch {
      setError('保存失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!assignmentId) return
    if (!confirm('确定要删除这个作业吗？此操作不可恢复。')) return
    try {
      setLoading(true)
      const response = await fetchWithAuth(`/api/classes/${classId}/assignments/${assignmentId}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      if (data.success) {
        onDeleted?.()
        onClose()
      } else {
        setError(data.error || '删除失败')
      }
    } catch {
      setError('删除失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (!open || !assignmentId) return null

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
        aria-labelledby="edit-assignment-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 id="edit-assignment-title" className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary-light" />
            编辑作业
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:bg-muted" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        {dataLoading ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">加载中…</div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex-1 min-h-0 overflow-y-auto flex flex-col"
          >
            <div className="px-5 pt-4 pb-3 space-y-3 border-b border-border/60">
              {assignmentStatus && (
                <div className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${
                  assignmentStatus === 'upcoming'
                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                    : assignmentStatus === 'active'
                    ? 'border-green-500/30 bg-green-500/10 text-green-400'
                    : 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                }`}>
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    当前状态：
                    {assignmentStatus === 'upcoming' && '未开始（学生暂时无法提交）'}
                    {assignmentStatus === 'active' && '进行中（学生可正常提交）'}
                    {assignmentStatus === 'ended' && '已结束（题目列表已锁定，仅可修改标题/描述/时间）'}
                  </span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  作业标题 <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">作业描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="input w-full resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">开始时间</label>
                  <input
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="input w-full"
                  />
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
                </div>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-border bg-muted/30 px-3 py-2.5 hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.allowLateSubmission}
                  onChange={(e) => setFormData({ ...formData, allowLateSubmission: e.target.checked })}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">允许逾期提交</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    开启后，作业结束后学生仍可提交，但提交记录会被标记为「逾期」。
                  </div>
                </div>
              </label>
            </div>

            <div className="px-5 py-3">
              <label className="block text-sm font-medium text-foreground mb-2">
                题目 <span className="text-error">*</span>
              </label>
              <AssignmentProblemPicker
                orderedIds={selectedProblems}
                onChange={setSelectedProblems}
                problems={problems}
                problemsLoading={false}
              />
            </div>

            <div className="px-5 pb-2 space-y-2 border-t border-border/60 pt-3">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex gap-2 text-xs text-muted-foreground">
                <AlertCircle className="w-4 h-4 shrink-0 text-primary mt-0.5" />
                <span>按题号添加；可调整顺序后保存。</span>
              </div>
              {error && (
                <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error">{error}</div>
              )}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-border">
              <button type="submit" disabled={loading} className="btn btn-primary flex-1">
                {loading ? '保存中...' : '保存修改'}
              </button>
              <button type="button" onClick={handleDelete} disabled={loading} className="btn btn-ghost text-error border border-error/20">
                <Trash2 className="w-4 h-4 inline mr-1" />
                删除
              </button>
              <button type="button" onClick={onClose} className="btn btn-ghost">
                取消
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}