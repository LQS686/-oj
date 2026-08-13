'use client'

import { useState, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { Trophy, Trash2, AlertCircle, Loader2, Edit } from 'lucide-react'
import { CreateModalShell, ProblemPicker } from '@/components/common'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { useDialog } from '@/components/common/DialogProvider'

interface Problem {
  id: string
  problemNumber: string
  title: string
  difficulty: string
  tags?: string[]
}

const defaultForm = () => ({
  title: '',
  description: '',
  type: 'OI',
  startTime: '',
  endTime: '',
  isPublic: true,
  password: '',
  sealRankTime: '',
})

export default function CreateContestModal({
  open,
  onClose,
  onCreated,
  onSaved,
  /** 传入则为编辑模式 */
  contestId = null,
}: {
  open: boolean
  onClose: () => void
  /** 创建成功并跳转前可选刷新列表 */
  onCreated?: () => void
  onSaved?: () => void
  contestId?: string | null
}) {
  const dialog = useDialog()
  const isEdit = !!contestId

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState(defaultForm)
  /** 编辑模式：原竞赛是否已有密码（API 不回传密码本身，仅回传 hasPassword） */
  const [existingHasPassword, setExistingHasPassword] = useState(false)

  // 题目管理 state
  const [contestProblems, setContestProblems] = useState<Problem[]>([])
  const [allProblems, setAllProblems] = useState<Problem[]>([])
  const [problemsLoading, setProblemsLoading] = useState(false)

  const resetForm = useCallback(() => {
    setFormData(defaultForm())
    setExistingHasPassword(false)
    setContestProblems([])
    // 注意：不要清空 allProblems —— 它由 useDeferredEffect 每次 open 时重新加载，
    // 若在此清空会把刚加载好的题库清掉，导致新建时搜索/批量添加失效
    setError('')
    setSubmitting(false)
    setLoading(false)
  }, [])

  const applyContest = useCallback((contest: Record<string, unknown>, problems: Problem[]) => {
    setFormData({
      title: typeof contest.title === 'string' ? contest.title : '',
      description: typeof contest.description === 'string' ? contest.description : '',
      type: typeof contest.type === 'string' ? contest.type : 'OI',
      startTime: contest.startTime
        ? new Date(contest.startTime as string).toISOString().slice(0, 16)
        : '',
      endTime: contest.endTime
        ? new Date(contest.endTime as string).toISOString().slice(0, 16)
        : '',
      isPublic: contest.isPublic !== false,
      password: typeof contest.password === 'string' ? contest.password : '',
      sealRankTime: contest.sealRankTime
        ? new Date(contest.sealRankTime as string).toISOString().slice(0, 16)
        : '',
    })
    setContestProblems(problems)
  }, [])

  useDeferredEffect(() => {
    if (!open) return

    let cancelled = false

    // 立即重置表单（新建）或进入加载态（编辑），不等待全量题目加载，
    // 避免用户输入被延迟的 resetForm 清空、或旧表单在加载窗口仍可交互
    if (!isEdit || !contestId) {
      resetForm()
    } else {
      setLoading(true)
    }

    const load = async () => {
      // 加载全量公开题（供 ProblemPicker 客户端搜索/批量添加）
      setProblemsLoading(true)
      try {
        const all: Problem[] = []
        let page = 1
        const pageSize = 50
        for (;;) {
          const res = await fetchWithCookie(`/api/problems?page=${page}&pageSize=${pageSize}`)
          const data = await res.json()
          if (cancelled) return
          if (!data.success) break
          const batch = (data.data?.problems || []).map((p: Problem) => ({
            id: p.id,
            problemNumber: p.problemNumber,
            title: p.title,
            difficulty: p.difficulty,
            tags: p.tags || [],
          }))
          all.push(...batch)
          const totalPages = data.data?.pagination?.totalPages ?? 1
          if (page >= totalPages || batch.length === 0) break
          page += 1
        }
        if (!cancelled) setAllProblems(all)
      } catch (err) {
        logger.error('CreateContestModal 加载题目列表失败', err)
      } finally {
        if (!cancelled) setProblemsLoading(false)
      }

      if (isEdit && contestId) {
        try {
          const contestRes = await fetchWithCookie(`/api/contests/${contestId}`)
        const contestData = await contestRes.json()
        if (cancelled) return
        if (!contestRes.ok || !contestData.success) {
          const msg = contestData.error || '获取竞赛详情失败'
          await dialog.alert({
            tone: 'error',
            message: typeof msg === 'string' ? msg : '获取竞赛详情失败',
          })
          onClose()
          return
        }

        const problemsRes = await fetchWithCookie(`/api/contests/${contestId}/problems`)
        const problemsData = await problemsRes.json()
        if (cancelled) return

        const problems: Problem[] = problemsData.success
          ? (problemsData.data as Problem[]).map((p) => ({
              id: p.id,
              problemNumber: p.problemNumber,
              title: p.title,
              difficulty: p.difficulty,
              tags: p.tags || [],
            }))
          : []

        applyContest(contestData.data, problems)
        setExistingHasPassword(!!(contestData.data as { hasPassword?: boolean }).hasPassword)
      } catch {
        if (!cancelled) {
          await dialog.alert({ tone: 'error', message: '网络错误，请稍后重试' })
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, isEdit, contestId, resetForm, applyContest, dialog, onClose])

  const handleProblemsChange = useCallback((ids: string[]) => {
    // 公开题从 allProblems 重建；编辑态竞赛可能含非公开/已下架题目，从原 contestProblems 保留
    const map = new Map(allProblems.map((p) => [p.id, p]))
    const existing = new Map(contestProblems.map((p) => [p.id, p]))
    setContestProblems(ids.map((id) => map.get(id) ?? existing.get(id)).filter((p): p is Problem => !!p))
  }, [allProblems, contestProblems])

  const buildPayload = () => {
    const duration = Math.floor(
      (new Date(formData.endTime).getTime() - new Date(formData.startTime).getTime()) / 60000
    )
    const payload: Record<string, unknown> = {
      title: formData.title,
      description: formData.description,
      type: formData.type,
      startTime: formData.startTime,
      endTime: formData.endTime,
      duration,
      isPublic: formData.isPublic,
      sealRankTime: formData.sealRankTime || null,
      problemIds: contestProblems.map(p => p.id),
    }
    // 密码语义：公开 -> 清除；私有且填写 -> 设置新密码；
    // 私有且留空 -> 编辑时保持原密码，新建时按空处理（由后端校验）
    if (formData.isPublic) {
      payload.password = null
    } else if (formData.password.trim()) {
      payload.password = formData.password
    } else if (isEdit && existingHasPassword) {
      // 留空：不传 password，服务端保持原哈希
      delete payload.password
    } else {
      payload.password = formData.password
    }
    return payload
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (new Date(formData.endTime) <= new Date(formData.startTime)) {
      setError('结束时间必须晚于开始时间')
      return
    }
    if (!formData.isPublic && !formData.password.trim() && !(isEdit && existingHasPassword)) {
      setError('私有竞赛请设置参赛密码')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetchWithCookie(
        isEdit ? `/api/contests/${contestId}` : '/api/contests',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        }
      )

      const data = await response.json()
      if (data.success) {
        if (isEdit) {
          onSaved?.()
        } else {
          onCreated?.()
        }
        onClose()
      } else {
        setError(data.error || (isEdit ? '更新失败' : '创建失败'))
      }
    } catch (err) {
      logger.error('CreateContestModal submit failed', err)
      setError('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CreateModalShell
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑竞赛' : '创建竞赛'}
      icon={isEdit ? Edit : Trophy}
      labelledById={isEdit ? 'edit-contest-title' : 'create-contest-title'}
    >
      {loading ? (
        <div className="px-5 py-16 text-center text-sm text-muted-foreground">加载竞赛中…</div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
            {error && (
              <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                竞赛名称 <span className="text-error">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="input w-full"
                placeholder="例如：2024年春季程序设计竞赛"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                竞赛描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="input w-full resize-none"
                placeholder="请输入竞赛规则、说明等信息（支持 Markdown）"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  赛制类型
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="input w-full"
                >
                  <option value="ACM">ACM (ICPC) - 罚时制</option>
                  <option value="OI">OI (NOI) - 得分制</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  可见性
                </label>
                <select
                  value={formData.isPublic ? 'public' : 'private'}
                  onChange={(e) => setFormData({ ...formData, isPublic: e.target.value === 'public' })}
                  className="input w-full"
                >
                  <option value="public">公开 (所有人可见)</option>
                  <option value="private">私有 (需要密码)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  开始时间 <span className="text-error">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  结束时间 <span className="text-error">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  封榜时间 (可选)
                </label>
                <input
                  type="datetime-local"
                  value={formData.sealRankTime}
                  onChange={(e) => setFormData({ ...formData, sealRankTime: e.target.value })}
                  className="input w-full"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  到达此时刻后，普通用户看到的是封榜快照；管理员可绕过封榜查看实时数据。留空表示不封榜。
                </p>
              </div>
            </div>

            {!formData.isPublic && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  参赛密码 <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input w-full"
                  placeholder="请设置参赛密码"
                />
              </div>
            )}

            {/* 题目管理区 */}
            <div className="card-static p-4 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-sm font-bold text-foreground">题目管理</h3>
                <span className="tag">已添加 {contestProblems.length} 题</span>
              </div>

              <ProblemPicker
                problems={allProblems}
                problemsLoading={problemsLoading}
                selectedIds={contestProblems.map(p => p.id)}
                selectedProblems={contestProblems}
                onChange={handleProblemsChange}
                emptyText="请使用上方工具搜索或批量添加题目"
                renderSelectedItem={(problem, index) => (
                  <>
                    <span className="w-7 h-7 flex items-center justify-center bg-muted text-muted-foreground rounded-lg text-xs font-bold shrink-0">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{problem.problemNumber}</span>
                        <span className="font-medium text-foreground text-sm">{problem.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground/60 mt-0.5">{problem.difficulty}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleProblemsChange(contestProblems.filter(p => p.id !== problem.id).map(p => p.id))}
                      className="p-2 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-all shrink-0"
                      title="移除题目"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              />
            </div>
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button type="submit" disabled={submitting} className="btn btn-primary flex-1 flex items-center justify-center gap-2">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isEdit ? '保存中…' : '创建中…'}
                </>
              ) : (
                isEdit ? '保存' : '创建竞赛'
              )}
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost">
              取消
            </button>
          </div>
        </form>
      )}
    </CreateModalShell>
  )
}
