'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { Trophy, X, AlertCircle, Edit } from 'lucide-react'
import { CreateModalShell, ProblemPicker } from '@/components/common'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { useDialog } from '@/components/common/DialogProvider'

interface Problem {
  id: string
  problemNumber: string | null
  title: string
  difficulty: string
  visibility: string
  isPublic: boolean
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
  sealRankTime: ''
})

export default function AdminCreateContestModal({
  open,
  onClose,
  onCreated,
  onSaved,
  /** 传入则为编辑模式 */
  contestId = null,
}: {
  open: boolean
  onClose: () => void
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

  const [allProblems, setAllProblems] = useState<Problem[]>([])
  const [problemsLoading, setProblemsLoading] = useState(false)
  const [contestProblems, setContestProblems] = useState<Problem[]>([])
  /** 编辑态：库中已有参赛密码（表单留空表示保持） */
  const [existingHasPassword, setExistingHasPassword] = useState(false)

  const resetForm = useCallback(() => {
    setFormData(defaultForm())
    setContestProblems([])
    setError('')
    setSubmitting(false)
    setLoading(false)
    setExistingHasPassword(false)
  }, [])

  const applyContest = useCallback((contest: Record<string, unknown>) => {
    const hasPassword = !!contest.hasPassword || (typeof contest.password === 'string' && contest.password.length > 0)
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
      isPublic: !!contest.isPublic,
      // 绝不把 bcrypt 哈希填入表单；编辑时留空表示保持原密码
      password: '',
      sealRankTime: contest.sealRankTime
        ? new Date(contest.sealRankTime as string).toISOString().slice(0, 16)
        : '',
    })
    setExistingHasPassword(hasPassword)
    const problems = Array.isArray(contest.problems)
      ? (contest.problems as { problem: Problem }[]).map((p) => p.problem)
      : []
    setContestProblems(problems)
  }, [])

  useDeferredEffect(() => {
    if (!open) return

    if (!isEdit || !contestId) {
      resetForm()
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        const response = await fetchWithCookie(`/api/admin/contests/${contestId}`)
        const data = await response.json()
        if (cancelled) return
        if (!response.ok || !data.success) {
          const msg = data.error?.message || data.error || '获取竞赛失败'
          await dialog.alert({
            tone: 'error',
            message: typeof msg === 'string' ? msg : '获取竞赛失败',
          })
          onClose()
          return
        }
        applyContest(data.data)
      } catch {
        if (!cancelled) {
          await dialog.alert({ tone: 'error', message: '网络错误，请稍后重试' })
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, isEdit, contestId, resetForm, applyContest, dialog, onClose])

  useEffect(() => {
    if (!open) return
    const fetchProblems = async () => {
      try {
        // 循环分页加载全部题目（避免默认 pageSize=20 导致搜索范围不全），供客户端关键词过滤
        setProblemsLoading(true)
        const all: Problem[] = []
        let page = 1
        const pageSize = 100
        for (;;) {
          const response = await fetchWithCookie(`/api/admin/problems?page=${page}&pageSize=${pageSize}`)
          const data = await response.json()
          if (!data.success) break
          const payload = data.data
          const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []
          all.push(...rows)
          const totalPages = payload?.pagination?.totalPages ?? 1
          if (page >= totalPages || rows.length === 0) break
          page += 1
        }
        setAllProblems(all)
      } catch (err) {
        logger.error('加载题目列表失败', err)
        setAllProblems([])
      } finally {
        setProblemsLoading(false)
      }
    }
    fetchProblems()
  }, [open])

  const handleProblemsChange = useCallback((ids: string[]) => {
    // 公开题从 allProblems 重建；编辑态/加载中竞赛可能含不在 allProblems 里的题目，从原 contestProblems 保留
    const map = new Map(allProblems.map((p) => [p.id, p]))
    const existing = new Map(contestProblems.map((p) => [p.id, p]))
    setContestProblems(ids.map((id) => map.get(id) ?? existing.get(id)).filter((p): p is Problem => !!p))
  }, [allProblems, contestProblems])

  const buildPayload = () => {
    const payload: Record<string, unknown> = {
      ...formData,
      problems: contestProblems.map((p) => p.id),
    }
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
        isEdit ? `/api/admin/contests/${contestId}` : '/api/admin/contests',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        }
      )

      const data = await response.json()
      if (data.success) {
        if (isEdit) {
          onSaved?.()
          onClose()
        } else {
          onCreated?.()
          onClose()
        }
      } else {
        setError(data.error || (isEdit ? '更新失败' : '创建失败'))
      }
    } catch {
      setError('网络错误')
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
      labelledById={isEdit ? 'admin-edit-contest-title' : 'admin-create-contest-title'}
      variant="admin"
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
                placeholder="例如：2024年春季校赛"
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
                  参赛密码{' '}
                  {!(isEdit && existingHasPassword) && <span className="text-error">*</span>}
                </label>
                <input
                  type="text"
                  required={!(isEdit && existingHasPassword)}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input w-full"
                  placeholder={
                    isEdit && existingHasPassword
                      ? '已设置密码，留空表示保持不变'
                      : '请设置参赛密码'
                  }
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
                emptyText="请使用上方工具添加题目到竞赛"
                renderSelectedItem={(problem, index) => {
                  const p = problem as Problem
                  const vis = p.visibility ?? (p.isPublic ? 'public' : 'private')
                  return (
                    <>
                      <span className="w-7 h-7 flex items-center justify-center bg-primary/10 border border-primary/20 rounded-full text-xs font-bold text-primary-light shrink-0">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{problem.problemNumber}</span>
                          <span className="font-medium text-foreground text-sm">{problem.title}</span>
                        </div>
                        <div className="flex gap-2 mt-0.5">
                          <span className={`tag text-xs ${
                            vis === 'contest' ? 'tag-warning' :
                              vis === 'public' ? 'tag-success' : ''
                          }`}>
                            {vis === 'contest' ? '竞赛' : vis === 'public' ? '公开' : '隐藏'}
                          </span>
                          <span className="text-xs text-muted-foreground">{problem.difficulty}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleProblemsChange(contestProblems.filter(p => p.id !== problem.id).map(p => p.id))}
                        className="p-2 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-colors shrink-0"
                        title="移除题目"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )
                }}
              />
            </div>
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button type="submit" disabled={submitting} className="btn btn-primary flex-1">
              {submitting ? (isEdit ? '保存中…' : '创建中…') : isEdit ? '保存' : '创建竞赛'}
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
