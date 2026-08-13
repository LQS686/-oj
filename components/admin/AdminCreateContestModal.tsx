'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { Trophy, Search, Plus, X, AlertCircle, Edit } from 'lucide-react'
import { CreateModalShell } from '@/components/common'
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
  const [contestProblems, setContestProblems] = useState<Problem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Problem[]>([])
  const [batchInput, setBatchInput] = useState('')
  /** 编辑态：库中已有参赛密码（表单留空表示保持） */
  const [existingHasPassword, setExistingHasPassword] = useState(false)

  const resetForm = useCallback(() => {
    setFormData(defaultForm())
    setContestProblems([])
    setSearchQuery('')
    setSearchResults([])
    setBatchInput('')
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
      }
    }
    fetchProblems()
  }, [open])

  const searchProblems = (query: string) => {
    setSearchQuery(query)
    if (!query) {
      setSearchResults([])
      return
    }

    const lowerQuery = query.toLowerCase()
    // 关键词覆盖题号 / 标题 / 难度 / 标签，便于连续添加同类题目
    const filtered = allProblems.filter((p: Problem) =>
      (p.title.toLowerCase().includes(lowerQuery) ||
        (p.problemNumber && p.problemNumber.toLowerCase().includes(lowerQuery)) ||
        p.difficulty.toLowerCase().includes(lowerQuery) ||
        (p.tags || []).some(t => t.toLowerCase().includes(lowerQuery))) &&
      !contestProblems.find(cp => cp.id === p.id)
    )
    setSearchResults(filtered.slice(0, 10))
  }

  const handleAddProblem = (problem: Problem) => {
    setContestProblems([...contestProblems, problem])
    // 保留关键词与剩余结果，支持连续添加包含该关键词的题目；仅移除已添加项
    setSearchResults(prev => prev.filter(p => p.id !== problem.id))
  }

  const handleRemoveProblem = (problemId: string) => {
    setContestProblems(contestProblems.filter(p => p.id !== problemId))
  }

  const handleBatchAdd = async () => {
    if (!batchInput.trim()) return

    const numbers = batchInput.split(/[,，\s\n]+/).filter(s => s.trim())
    const problemsToAdd: Problem[] = []
    const notFound: string[] = []

    numbers.forEach(num => {
      const targetNum = num.toUpperCase().startsWith('P') ? num.toUpperCase() : `P${num}`

      const problem = allProblems.find((p: Problem) =>
        p.problemNumber && p.problemNumber.toUpperCase() === targetNum
      )

      if (problem) {
        if (!contestProblems.find(cp => cp.id === problem.id) && !problemsToAdd.find(p => p.id === problem.id)) {
          problemsToAdd.push(problem)
        }
      } else {
        notFound.push(num)
      }
    })

    setContestProblems([...contestProblems, ...problemsToAdd])
    setBatchInput('')

    if (notFound.length > 0) {
      await dialog.alert({
        tone: 'warning',
        message: `以下题目未找到: ${notFound.join(', ')}`,
      })
    }
  }

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

              {/* 批量添加 */}
              <div>
                <label className="block text-sm font-bold text-primary-light mb-2">
                  批量添加题目
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="输入题号，例如: P1001, 1002, P1005 (支持逗号或空格分隔)"
                    value={batchInput}
                    onChange={(e) => setBatchInput(e.target.value)}
                    className="input flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleBatchAdd())}
                  />
                  <button
                    type="button"
                    onClick={handleBatchAdd}
                    disabled={!batchInput.trim()}
                    className="btn btn-primary whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    批量添加
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  提示：直接输入数字（如 1001）将自动识别为 P1001。支持一次性添加多个题目。
                </p>
              </div>

              {/* 搜索添加 */}
              <div className="relative">
                <label className="block text-sm font-medium text-foreground mb-2">
                  搜索添加题目
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="搜索题目名称或题号..."
                    value={searchQuery}
                    onChange={(e) => searchProblems(e.target.value)}
                    className="input w-full pl-10"
                  />
                  <Search className="w-5 h-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                </div>

                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 card-static rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                    {searchResults.map(problem => (
                      <button
                        key={problem.id}
                        type="button"
                        onClick={() => handleAddProblem(problem)}
                        className="w-full px-4 py-3 text-left hover:bg-muted flex justify-between items-center border-b border-border last:border-0 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="tag font-mono">
                            {problem.problemNumber}
                          </span>
                          <span className="font-medium text-foreground">{problem.title}</span>
                          <span className={`tag ${
                            (problem.visibility === 'contest') ? 'tag-warning' :
                              (problem.visibility === 'public' || problem.isPublic) ? 'tag-success' : ''
                          }`}>
                            {problem.visibility === 'contest' ? '竞赛专用' :
                              (problem.visibility === 'public' || problem.isPublic) ? '公开' : '隐藏'}
                          </span>
                        </div>
                        <span className={`tag ${
                          problem.difficulty === '入门' ? 'tag-success' :
                            problem.difficulty.includes('普及') ? 'tag-warning' :
                            'tag-error'
                        }`}>
                          {problem.difficulty}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 已添加题目列表 */}
              <div className="space-y-2">
                {contestProblems.map((problem, index) => (
                  <div key={problem.id} className="flex items-center justify-between p-3 card-static rounded-xl border border-border group hover:border-primary/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 flex items-center justify-center bg-primary/10 border border-primary/20 rounded-full text-xs font-bold text-primary-light">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{problem.problemNumber}</span>
                          <span className="font-medium text-foreground text-sm">{problem.title}</span>
                        </div>
                        <div className="flex gap-2 mt-0.5">
                          <span className={`tag text-xs ${
                            (problem.visibility === 'contest') ? 'tag-warning' :
                              (problem.visibility === 'public' || problem.isPublic) ? 'tag-success' : ''
                          }`}>
                            {problem.visibility === 'contest' ? '竞赛' :
                              (problem.visibility === 'public' || problem.isPublic) ? '公开' : '隐藏'}
                          </span>
                          <span className="text-xs text-muted-foreground">{problem.difficulty}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveProblem(problem.id)}
                      className="p-2 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                      title="移除题目"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {contestProblems.length === 0 && (
                  <div className="text-center py-10 card-static rounded-xl border-2 border-dashed border-border text-muted-foreground">
                    <p>暂无题目</p>
                    <p className="text-sm mt-1">请使用上方工具添加题目到竞赛</p>
                  </div>
                )}
              </div>
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
