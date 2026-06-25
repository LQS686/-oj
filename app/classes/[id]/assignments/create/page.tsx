'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { BookOpen, AlertCircle } from 'lucide-react'
import { getDifficultyColor } from '@/lib/status'
import { ClassWorkspaceShell } from '@/components/common'
import { useClass } from '@/hooks/useClass'

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
  const classId = params.id as string
  const { classData } = useClass(classId)

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
    deadline: getDefaultDeadline(),
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
    } catch {
      setError('获取题目列表失败')
    } finally {
      setProblemsLoading(false)
    }
  }

  const toggleProblem = (problemId: string) => {
    setSelectedProblems((prev) =>
      prev.includes(problemId) ? prev.filter((id) => id !== problemId) : [...prev, problemId]
    )
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

      const response = await fetchWithAuth(`/api/classes/${classId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          deadline: formData.deadline,
          problemIds: selectedProblems,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('作业创建成功')
        setTimeout(() => {
          router.push(`/classes/${classId}/assignments`)
        }, 1200)
      } else {
        setError(data.error || '创建失败')
      }
    } catch {
      setError('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const filteredProblems = problems.filter((problem) => {
    const matchesSearch =
      problem.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      problem.problemNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      problem.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesDifficulty = difficultyFilter === 'all' || problem.difficulty === difficultyFilter

    return matchesSearch && matchesDifficulty
  })

  const difficultyOptions = [
    { key: 'all', label: '全部' },
    { key: 'easy', label: '简单' },
    { key: 'medium', label: '中等' },
    { key: 'hard', label: '困难' },
  ]

  if (!user) return null

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title="创建作业"
      description="从平台题库选题并设置截止时间"
      icon={BookOpen}
    >
      <div className="bg-card rounded-lg border border-border p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-5">
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
              rows={3}
              className="input w-full resize-y"
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
            <p className="mt-1.5 text-xs text-muted-foreground">默认为 7 天后，可手动调整</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              从平台题库选择题目 <span className="text-error">*</span>
            </label>

            {problemsLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
                加载题目中…
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
                    className="input w-full"
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {difficultyOptions.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setDifficultyFilter(opt.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          difficultyFilter === opt.key
                            ? 'bg-primary text-white border-primary'
                            : 'bg-card text-muted-foreground border-border hover:text-foreground'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    已选择 <strong className="text-foreground">{selectedProblems.length}</strong> 个题目
                  </span>
                  <span>
                    显示 {filteredProblems.length} / {problems.length}
                  </span>
                </div>

                <div className="space-y-0 max-h-[360px] overflow-y-auto rounded-lg border border-border mt-2 divide-y divide-border">
                  {filteredProblems.map((problem) => (
                    <div
                      key={problem.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleProblem(problem.id)}
                      onKeyDown={(e) => e.key === 'Enter' && toggleProblem(problem.id)}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                        selectedProblems.includes(problem.id) ? 'bg-primary/5' : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={selectedProblems.includes(problem.id)}
                          readOnly
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleProblem(problem.id)}
                          className="w-4 h-4 rounded border-border text-primary shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {problem.problemNumber && (
                              <span className="shrink-0 text-xs font-mono text-muted-foreground">
                                {problem.problemNumber}
                              </span>
                            )}
                            <span className="font-medium text-foreground text-sm truncate">{problem.title}</span>
                            <span
                              className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium ${getDifficultyColor(problem.difficulty)}`}
                            >
                              {problem.difficulty}
                            </span>
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {problem.tags.slice(0, 3).map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 bg-muted rounded text-[11px] text-muted-foreground"
                              >
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

          <div className="rounded-lg border border-border bg-muted/30 p-3.5">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                <li>题目来自平台公开题库，成员均可查看</li>
                <li>成员需在截止时间前完成所选题目</li>
                <li>可在作业详情查看完成进度</li>
              </ul>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-error/10 border border-error/20">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg bg-secondary/10 border border-secondary/20">
              <p className="text-sm text-secondary font-medium">{success}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading || problemsLoading} className="btn btn-primary flex-1">
              {loading ? '创建中...' : '创建作业'}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/classes/${classId}/assignments`)}
              className="btn btn-ghost"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </ClassWorkspaceShell>
  )
}