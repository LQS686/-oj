'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { BookOpen, AlertCircle, ArrowLeft } from 'lucide-react'
import { getDifficultyColor } from '@/lib/status'

interface Problem {
  id: string
  problemNumber: string
  title: string
  difficulty: string
  tags: string[]
}

export default function CreateAssignmentPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const [loading, setLoading] = useState(false)
  const [problemsLoading, setProblemsLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [problems, setProblems] = useState<Problem[]>([])
  const [selectedProblems, setSelectedProblems] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all')

  const getDefaultDeadline = () => {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    return date.toISOString().slice(0, 16)
  }

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    deadline: getDefaultDeadline()
  })

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    fetchProblems()
  }, [user, router])

  const fetchProblems = async () => {
    try {
      setProblemsLoading(true)
      const response = await fetch('/api/problems?pageSize=100&isPublic=true')
      const data = await response.json()
      if (data.success) {
        setProblems(data.data.problems || [])
      } else {
        setError(data.error || '获取题目列表失败')
      }
    } catch (err) {
      setError('获取题目列表失败')
    } finally {
      setProblemsLoading(false)
    }
  }

  const toggleProblem = (problemId: string) => {
    if (selectedProblems.includes(problemId)) {
      setSelectedProblems(selectedProblems.filter(id => id !== problemId))
    } else {
      setSelectedProblems([...selectedProblems, problemId])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

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

    const deadline = new Date(formData.deadline)
    if (deadline <= new Date()) {
      setError('截止时间必须晚于当前时间')
      return
    }

    try {
      setLoading(true)

      const response = await fetchWithAuth(`/api/teams/${params.id}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          deadline: formData.deadline,
          problemIds: selectedProblems
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('作业创建成功')
        setTimeout(() => {
          router.push(`/teams/${params.id}`)
        }, 1500)
      } else {
        setError(data.error || '创建失败')
      }
    } catch (err) {
      setError('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const filteredProblems = problems.filter(problem => {
    const matchesSearch =
      problem.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      problem.problemNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      problem.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesDifficulty = difficultyFilter === 'all' || problem.difficulty === difficultyFilter

    return matchesSearch && matchesDifficulty
  })

  const difficultyOptions = [
    { key: 'all', label: '全部' },
    { key: 'easy', label: '简单' },
    { key: 'medium', label: '中等' },
    { key: 'hard', label: '困难' }
  ]

  if (!user) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">创建团队作业</h1>
          <p className="mt-1 text-sm text-muted-foreground">为团队成员布置作业任务</p>
        </div>

        <div className="bg-white dark:bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="p-6">
            <form onSubmit={handleSubmit}>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    作业标题 <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="例如：第一周练习作业"
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    作业描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="描述作业要求和注意事项"
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm resize-y focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
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
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
                    required
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">默认为7天后，可手动调整</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    从平台题库选择题目 <span className="text-error">*</span>
                  </label>

                  {problemsLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    </div>
                  ) : problems.length === 0 ? (
                    <div className="text-center py-10">
                      <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">平台暂无公开题目</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="搜索题目编号、标题或标签..."
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors"
                        />
                        <div className="flex gap-1.5">
                          {difficultyOptions.map(opt => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setDifficultyFilter(opt.key)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                difficultyFilter === opt.key
                                  ? 'bg-primary text-white shadow-sm'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>已选择 <strong className="text-foreground">{selectedProblems.length}</strong> 个题目</span>
                        <span>显示 {filteredProblems.length} / {problems.length}</span>
                      </div>

                      <div className="space-y-2 max-h-[360px] overflow-y-auto rounded-lg border border-border mt-2">
                        {filteredProblems.map(problem => (
                          <div
                            key={problem.id}
                            onClick={() => toggleProblem(problem.id)}
                            className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-all border-b border-border/60 last:border-b-0 ${
                              selectedProblems.includes(problem.id)
                                ? 'bg-primary/5'
                                : 'hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={selectedProblems.includes(problem.id)}
                                onChange={() => {}}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {problem.problemNumber && (
                                    <span className="shrink-0 text-xs font-mono text-muted-foreground">{problem.problemNumber}</span>
                                  )}
                                  <span className="font-medium text-foreground text-sm truncate">{problem.title}</span>
                                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium ${getDifficultyColor(problem.difficulty)}`}>
                                    {problem.difficulty}
                                  </span>
                                </div>
                                <div className="flex gap-1 mt-1 flex-wrap">
                                  {problem.tags.slice(0, 3).map((tag, idx) => (
                                    <span key={idx} className="px-1.5 py-0.5 bg-muted rounded text-[11px] text-muted-foreground">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="p-3.5 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-primary-light mt-0.5 shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">温馨提示</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>作业题目来自平台公开题库，所有成员都可以查看</li>
                        <li>成员需要在截止时间前完成所有题目</li>
                        <li>可以在团队详情页查看成员的完成进度</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-error/5 border border-error/15">
                    <p className="text-sm text-error">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-3 rounded-lg bg-secondary/5 border border-secondary/15">
                    <p className="text-sm text-secondary font-medium">{success}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={loading || problemsLoading}
                    className="btn-primary btn flex-1"
                  >
                    {loading ? '创建中...' : '创建作业'}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/teams/${params.id}`)}
                    className="btn-ghost btn"
                  >
                    取消
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
