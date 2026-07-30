'use client'

import { useState, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { Trophy, Plus, Search, Trash2, AlertCircle, Loader2, Edit } from 'lucide-react'
import { CreateModalShell } from '@/components/common'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { useDialog } from '@/components/common/DialogProvider'

interface Problem {
  id: string
  problemNumber: string
  title: string
  difficulty: string
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

  // 题目管理 state
  const [contestProblems, setContestProblems] = useState<Problem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Problem[]>([])
  const [searching, setSearching] = useState(false)
  const [batchInput, setBatchInput] = useState('')

  const resetForm = useCallback(() => {
    setFormData(defaultForm())
    setContestProblems([])
    setSearchQuery('')
    setSearchResults([])
    setBatchInput('')
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

    if (!isEdit || !contestId) {
      resetForm()
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
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
            }))
          : []

        applyContest(contestData.data, problems)
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

  const searchProblems = async (query: string) => {
    if (!query) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const response = await fetchWithCookie(`/api/problems?search=${encodeURIComponent(query)}&limit=5`)
      const data = await response.json()
      if (data.success) {
        const filtered = (data.data.problems || []).filter((p: Problem) =>
          !contestProblems.find(cp => cp.id === p.id)
        )
        setSearchResults(filtered)
      }
    } catch (err) {
      logger.error('CreateContestModal searchProblems failed', err)
    } finally {
      setSearching(false)
    }
  }

  const handleAddProblem = (problem: Problem) => {
    setContestProblems([...contestProblems, problem])
    setSearchResults([])
    setSearchQuery('')
  }

  const handleRemoveProblem = (problemId: string) => {
    setContestProblems(contestProblems.filter(p => p.id !== problemId))
  }

  const handleBatchAdd = async () => {
    if (!batchInput.trim()) return

    setSearching(true)
    try {
      const numbers = batchInput.split(/[,，\s\n]+/)
        .filter(s => s.trim())
        .map(s => s.trim().toUpperCase().startsWith('P') ? s.trim().toUpperCase() : `P${s.trim()}`)

      if (numbers.length === 0) return

      const response = await fetchWithCookie(`/api/problems?numbers=${encodeURIComponent(numbers.join(','))}`)
      const data = await response.json()

      if (data.success) {
        const foundProblems = (data.data.problems || []) as Problem[]
        const newProblems: Problem[] = []
        const foundNumbers = new Set(foundProblems.map(p => p.problemNumber))
        const notFound: string[] = []

        numbers.forEach(num => {
          if (!foundNumbers.has(num)) {
            notFound.push(num)
          }
        })

        foundProblems.forEach(p => {
          if (!contestProblems.find(cp => cp.id === p.id)) {
            newProblems.push(p)
          }
        })

        setContestProblems([...contestProblems, ...newProblems])
        setBatchInput('')

        if (notFound.length > 0) {
          await dialog.alert({
            tone: 'warning',
            message: `以下题目未找到或未公开: ${notFound.join(', ')}`,
          })
        }
      }
    } catch (err) {
      logger.error('CreateContestModal handleBatchAdd failed', err)
      await dialog.alert({ tone: 'error', message: '批量添加失败：网络错误' })
    } finally {
      setSearching(false)
    }
  }

  const buildPayload = () => {
    const duration = Math.floor(
      (new Date(formData.endTime).getTime() - new Date(formData.startTime).getTime()) / 60000
    )
    return {
      title: formData.title,
      description: formData.description,
      type: formData.type,
      startTime: formData.startTime,
      endTime: formData.endTime,
      duration,
      isPublic: formData.isPublic,
      password: formData.isPublic ? undefined : formData.password,
      sealRankTime: formData.sealRankTime || null,
      problemIds: contestProblems.map(p => p.id),
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (new Date(formData.endTime) <= new Date(formData.startTime)) {
      setError('结束时间必须晚于开始时间')
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleBatchAdd()
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleBatchAdd}
                    disabled={searching || !batchInput.trim()}
                    className="btn btn-primary whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    {searching ? '添加中...' : '批量添加'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  提示：直接输入数字（如 1001）将自动识别为 P1001。仅能添加已公开的题目。
                </p>
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  搜索添加题目
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="输入题目名称或题号进行搜索..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      searchProblems(e.target.value)
                    }}
                    className="input w-full pl-10"
                  />
                  <Search className="w-5 h-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                </div>

                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 card rounded-xl shadow-xl z-50 max-h-80 overflow-y-auto divide-y divide-border">
                    {searchResults.map(problem => (
                      <button
                        key={problem.id}
                        type="button"
                        onClick={() => handleAddProblem(problem)}
                        className="w-full px-4 py-3 text-left hover:bg-primary/5 flex justify-between items-center group transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded text-sm group-hover:bg-primary/10 group-hover:text-primary-light transition-colors">
                            {problem.problemNumber}
                          </span>
                          <span className="font-medium text-foreground group-hover:text-primary-light">{problem.title}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            problem.difficulty === '入门' ? 'bg-secondary/10 text-secondary-light' :
                            problem.difficulty.includes('普及') ? 'bg-accent/10 text-accent-light' :
                            'bg-error/10 text-error'
                          }`}>
                            {problem.difficulty}
                          </span>
                          <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary-light" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-border rounded-xl overflow-hidden">
                {contestProblems.length === 0 ? (
                  <div className="py-10 text-center">
                    <div className="bg-muted w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Search className="w-6 h-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-muted-foreground font-medium text-sm">暂无题目</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">请使用上方工具搜索或批量添加题目</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-60 overflow-y-auto">
                    {contestProblems.map((problem, index) => (
                      <div key={problem.id} className="p-3 flex items-center justify-between hover:bg-primary/5 transition-colors group">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 flex items-center justify-center bg-muted text-muted-foreground rounded-lg text-xs font-bold group-hover:bg-primary/10 group-hover:text-primary-light transition-colors">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{problem.problemNumber}</span>
                              <span className="font-medium text-foreground text-sm">{problem.title}</span>
                            </div>
                            <span className="text-xs text-muted-foreground/60 mt-0.5">{problem.difficulty}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveProblem(problem.id)}
                          className="p-2 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-all"
                          title="移除题目"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
