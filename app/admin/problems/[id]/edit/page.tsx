'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import {
  ArrowLeft,
  Plus,
  X,
  Save,
  Loader2,
  Edit,
  Eye,
  Trash2,
  Sparkles,
  RefreshCw,
  Clock,
  Code2,
  AlertCircle,
  MessageSquare
} from 'lucide-react'
import { DIFFICULTIES } from '@/lib/constants'
import { formatRelativeTime } from '@/lib/utils'

interface Sample {
  input: string
  output: string
  explanation?: string
}

interface AdminSolutionItem {
  id: string
  title: string
  codeLanguage: string | null
  views: number
  likes: number
  isOfficial: boolean
  isAiGenerated: boolean
  sourceType: string
  createdAt: string
  author: {
    id: string
    username: string
    nickname: string | null
    avatar: string | null
  }
}

export default function EditProblemPage() {
  const router = useRouter()
  const params = useParams()
  const problemId = params.id as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [problemNumber, setProblemNumber] = useState('')
  const [title, setTitle] = useState('')
  const [difficulty, setDifficulty] = useState('入门')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [timeLimit, setTimeLimit] = useState(1000)
  const [memoryLimit, setMemoryLimit] = useState(128)
  const [visibility, setVisibility] = useState('public')

  const [description, setDescription] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [hint, setHint] = useState('')
  const [source, setSource] = useState('')

  const [samples, setSamples] = useState<Sample[]>([{ input: '', output: '', explanation: '' }])

  // 题解管理
  const [solutions, setSolutions] = useState<AdminSolutionItem[]>([])
  const [solutionsLoading, setSolutionsLoading] = useState(true)
  const [solutionsError, setSolutionsError] = useState('')
  const [deletingSolutionId, setDeletingSolutionId] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchProblemData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetchWithAuth(`/api/admin/problems/${problemId}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        const problem = data.data
        setProblemNumber(problem.problemNumber || '')
        setTitle(problem.title)
        setDescription(problem.description)
        setInput(problem.input || '')
        setOutput(problem.output || '')
        setHint(problem.hint || '')
        setSource(problem.source || '')
        setDifficulty(problem.difficulty)
        setTags(problem.tags || [])
        setTimeLimit(problem.timeLimit)
        setMemoryLimit(problem.memoryLimit)
        setVisibility(problem.visibility || (problem.isPublic ? 'public' : 'private'))
        setSamples(problem.samples?.length > 0 ? problem.samples : [{ input: '', output: '', explanation: '' }])
      } else {
        setError(data.error || '获取题目数据失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [problemId])

  useEffect(() => {
    fetchProblemData()
  }, [problemId, fetchProblemData])

  const fetchSolutions = useCallback(async () => {
    try {
      setSolutionsLoading(true)
      setSolutionsError('')
      const response = await fetchWithAuth(
        `/api/solutions?problemId=${problemId}&pageSize=100`
      )
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      if (data.success) {
        const list = Array.isArray(data.data?.items)
          ? data.data.items
          : Array.isArray(data.data?.solutions)
            ? data.data.solutions
            : Array.isArray(data.data)
              ? data.data
              : []
        setSolutions(list as AdminSolutionItem[])
      } else {
        setSolutionsError(data.error || '获取题解列表失败')
      }
    } catch (err: any) {
      setSolutionsError(err?.message || '网络错误')
    } finally {
      setSolutionsLoading(false)
    }
  }, [problemId])

  useEffect(() => {
    fetchSolutions()
  }, [problemId, fetchSolutions])

  const handleViewSolution = (solutionId: string) => {
    router.push(`/problems/${problemId}/solutions/${solutionId}`)
  }

  const handleDeleteSolution = async (solutionId: string) => {
    const ok = window.confirm('确定要删除此题解吗？此操作不可撤销。')
    if (!ok) return
    try {
      setDeletingSolutionId(solutionId)
      const response = await fetchWithAuth(`/api/solutions/${solutionId}`, {
        method: 'DELETE'
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.success) {
        setActionMessage({ type: 'success', text: '题解已删除' })
        setSolutions((prev) => prev.filter((s) => s.id !== solutionId))
      } else {
        setActionMessage({
          type: 'error',
          text: data?.error || '删除题解失败'
        })
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || '网络错误' })
    } finally {
      setDeletingSolutionId(null)
      setTimeout(() => setActionMessage(null), 3000)
    }
  }

  const handleRegenerateSolution = async () => {
    const ok = window.confirm(
      '将删除原 AI 官方题解并重新生成。确定继续吗？'
    )
    if (!ok) return
    try {
      setRegenerating(true)
      setActionMessage(null)
      const response = await fetchWithAuth(
        `/api/admin/problems/${problemId}/regenerate-solution`,
        { method: 'POST' }
      )
      const data = await response.json().catch(() => null)
      if (response.ok && data?.success) {
        setActionMessage({ type: 'success', text: 'AI 题解已重新入队生成' })
        await fetchSolutions()
      } else {
        setActionMessage({
          type: 'error',
          text: data?.error || '重新生成失败'
        })
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || '网络错误' })
    } finally {
      setRegenerating(false)
      setTimeout(() => setActionMessage(null), 4000)
    }
  }

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index))
  }

  const handleAddSample = () => {
    setSamples([...samples, { input: '', output: '', explanation: '' }])
  }

  const handleRemoveSample = (index: number) => {
    setSamples(samples.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) {
      setError('请填写题目标题')
      return
    }

    if (!description.trim()) {
      setError('请填写题目描述')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await fetchWithAuth(`/api/admin/problems/${problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemNumber: problemNumber.trim() || null,
          title: title.trim(),
          description,
          input,
          output,
          samples: samples.filter(s => s.input || s.output),
          hint: hint || null,
          source: source || null,
          difficulty,
          tags,
          timeLimit,
          memoryLimit,
          isPublic: visibility === 'public',
          visibility
        })
      })

      const data = await response.json()

      if (data.success) {
        router.push('/admin/problems')
      } else {
        setError(data.error || '更新失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-400">加载中...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
              <Edit className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">编辑题目</h1>
              <p className="text-sm text-slate-400">修改题目基本信息和描述</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-error/100/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-bold text-white mb-4">基本信息</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  题目编号（可选）
                </label>
                <input
                  type="text"
                  value={problemNumber}
                  onChange={(e) => setProblemNumber(e.target.value)}
                  placeholder="如：P1001"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  难度 <span className="text-red-400">*</span>
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="input"
                >
                  {DIFFICULTIES.map(diff => (
                    <option key={diff} value={diff}>{diff}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                题目标题 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入题目标题"
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">标签</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="输入标签后按回车"
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="btn btn-primary"
                >
                  添加
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="tag flex items-center gap-2"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(idx)}
                      className="hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  时间限制（ms）
                </label>
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value) || 1000)}
                  min="100"
                  max="10000"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  内存限制（MB）
                </label>
                <input
                  type="number"
                  value={memoryLimit}
                  onChange={(e) => setMemoryLimit(parseInt(e.target.value) || 128)}
                  min="32"
                  max="1024"
                  className="input"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-slate-300">题目可见性：</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="input w-auto"
              >
                <option value="public">公开 (Public)</option>
                <option value="private">隐藏 (Private)</option>
                <option value="contest">竞赛专用 (Contest)</option>
              </select>
              <span className="text-xs text-muted-foreground">
                {visibility === 'public' && '题目将在题库中对所有用户可见'}
                {visibility === 'private' && '题目仅管理员可见（草稿状态）'}
                {visibility === 'contest' && '题目仅在竞赛中可见'}
              </span>
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-bold text-white mb-4">题目描述</h2>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                题目描述 <span className="text-red-400">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                placeholder="详细描述题目要求..."
                className="input min-h-[200px] font-mono text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">输入格式</label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={4}
                placeholder="描述输入格式..."
                className="input font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">输出格式</label>
              <textarea
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                rows={4}
                placeholder="描述输出格式..."
                className="input font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">提示（可选）</label>
              <textarea
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                rows={3}
                placeholder="给出解题提示..."
                className="input font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">来源（可选）</label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="如：NOIP 2020 普及组"
                className="input"
              />
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-white">样例</h2>
              <button
                type="button"
                onClick={handleAddSample}
                className="btn btn-ghost text-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                添加样例
              </button>
            </div>

            {samples.map((sample, idx) => (
              <div key={idx} className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-slate-300">样例 {idx + 1}</h3>
                  {samples.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSample(idx)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">输入</label>
                    <textarea
                      value={sample.input}
                      onChange={(e) => {
                        const newSamples = [...samples]
                        newSamples[idx].input = e.target.value
                        setSamples(newSamples)
                      }}
                      rows={3}
                      className="input font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">输出</label>
                    <textarea
                      value={sample.output}
                      onChange={(e) => {
                        const newSamples = [...samples]
                        newSamples[idx].output = e.target.value
                        setSamples(newSamples)
                      }}
                      rows={3}
                      className="input font-mono text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">说明（可选）</label>
                  <input
                    type="text"
                    value={sample.explanation || ''}
                    onChange={(e) => {
                      const newSamples = [...samples]
                      newSamples[idx].explanation = e.target.value
                      setSamples(newSamples)
                    }}
                    className="input text-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn btn-ghost flex-1"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  更新中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  更新题目
                </>
              )}
            </button>
          </div>
        </form>

        <section className="card p-6 space-y-4" aria-label="题解管理">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background:
                    'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                }}
              >
                <MessageSquare className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  题解管理（{solutions.length}）
                </h2>
                <p className="text-xs text-slate-400">
                  管理该题下的所有题解，AI 题解可一键重新生成
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRegenerateSolution}
              disabled={regenerating}
              className="btn btn-primary text-sm flex items-center gap-2"
              title="删除原 AI 官方题解并重新入队生成"
            >
              {regenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              AI 重新生成
            </button>
          </div>

          {actionMessage && (
            <div
              className={`px-4 py-3 rounded-lg text-sm border ${
                actionMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              {actionMessage.text}
            </div>
          )}

          {solutionsLoading && (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-lg bg-white/5 border border-white/10 p-4 animate-pulse"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/10" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 bg-white/10 rounded" />
                      <div className="h-3 w-1/3 bg-white/10 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!solutionsLoading && solutionsError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{solutionsError}</span>
            </div>
          )}

          {!solutionsLoading && !solutionsError && solutions.length === 0 && (
            <div className="text-center py-12 rounded-lg bg-white/5 border border-white/10">
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-slate-400">暂无题解</p>
            </div>
          )}

          {!solutionsLoading && !solutionsError && solutions.length > 0 && (
            <div className="space-y-3">
              {solutions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl bg-white/5 border border-white/10 p-4 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="avatar avatar-md flex-shrink-0">
                        {s.author?.avatar ? (
                          <img
                            src={s.author.avatar}
                            alt={s.author.nickname || s.author.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="avatar-fallback text-sm">
                            {(s.author?.nickname || s.author?.username || '?')
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-sm font-semibold text-white line-clamp-1">
                            {s.title}
                          </h3>
                          {s.isAiGenerated && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-purple-500 to-purple-700 text-white">
                              <Sparkles className="w-3 h-3" />
                              AI 生成
                            </span>
                          )}
                          {s.isOfficial && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950">
                              标程
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                          <span className="text-slate-300">
                            {s.author?.nickname || s.author?.username || '匿名'}
                          </span>
                          <span className="opacity-50">·</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelativeTime(s.createdAt)}
                          </span>
                          {s.codeLanguage && (
                            <>
                              <span className="opacity-50">·</span>
                              <span className="inline-flex items-center gap-1">
                                <Code2 className="w-3 h-3" />
                                {s.codeLanguage}
                              </span>
                            </>
                          )}
                          <span className="opacity-50">·</span>
                          <span>👁 {s.views}</span>
                          <span>👍 {s.likes}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleViewSolution(s.id)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        查看
                      </button>
                      {s.isAiGenerated && (
                        <button
                          type="button"
                          onClick={handleRegenerateSolution}
                          disabled={regenerating}
                          className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 border border-purple-500/30 flex items-center gap-1"
                          title="删除此题解并重新生成"
                        >
                          {regenerating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3.5 h-3.5" />
                          )}
                          AI 重新生成
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteSolution(s.id)}
                        disabled={deletingSolutionId === s.id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1"
                      >
                        {deletingSolutionId === s.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  )
}
