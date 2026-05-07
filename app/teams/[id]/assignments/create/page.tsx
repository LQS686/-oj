'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { Calendar, BookOpen, AlertCircle, ArrowLeft } from 'lucide-react'
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

      console.log('[CreateAssignment] 提交数据:', {
        teamId: params.id,
        title: formData.title,
        deadline: formData.deadline,
        problemCount: selectedProblems.length
      })
      
      const response = await fetchWithAuth(`/api/teams/${params.id}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          deadline: formData.deadline,
          problemIds: selectedProblems
        })
      })

      console.log('[CreateAssignment] 响应状态:', response.status)
      const data = await response.json()
      console.log('[CreateAssignment] 响应数据:', data)

      if (data.success) {
        setSuccess('作业创建成功')
        setTimeout(() => {
          router.push(`/teams/${params.id}`)
        }, 1500)
      } else {
        setError(data.error || '创建失败')
      }
    } catch (err) {
    console.error('[CreateAssignment] 请求异常:', err)
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

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">创建团队作业</h1>
          <p className="mt-1 text-gray-400">为团队成员布置作业任务</p>
        </div>

        <div className="card">
          <div className="p-6">
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    作业标题 <span className="text-red-400">*</span>
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
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    作业描述
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="描述作业要求和注意事项"
                    rows={4}
                    className="input w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    截止时间 <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="datetime-local"
                      value={formData.deadline}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                      className="input w-full"
                      required
                    />
                    <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">默认为7天后，可手动调整</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    从平台题库选择题目 <span className="text-red-400">*</span>
                  </label>

                  {problemsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                    </div>
                  ) : problems.length === 0 ? (
                    <div className="text-center py-8">
                      <BookOpen className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                      <p className="text-gray-400">平台暂无公开题目</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4 space-y-3">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="搜索题目编号、标题或标签..."
                          className="input w-full"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDifficultyFilter('all')}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                              difficultyFilter === 'all'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white/10 text-gray-300 hover:bg-white/20'
                            }`}
                          >
                            全部
                          </button>
                          <button
                            type="button"
                            onClick={() => setDifficultyFilter('easy')}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                              difficultyFilter === 'easy'
                                ? 'bg-green-600 text-white'
                                : 'bg-white/10 text-gray-300 hover:bg-white/20'
                            }`}
                          >
                            简单
                          </button>
                          <button
                            type="button"
                            onClick={() => setDifficultyFilter('medium')}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                              difficultyFilter === 'medium'
                                ? 'bg-yellow-600 text-white'
                                : 'bg-white/10 text-gray-300 hover:bg-white/20'
                            }`}
                          >
                            中等
                          </button>
                          <button
                            type="button"
                            onClick={() => setDifficultyFilter('hard')}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                              difficultyFilter === 'hard'
                                ? 'bg-red-600 text-white'
                                : 'bg-white/10 text-gray-300 hover:bg-white/20'
                            }`}
                          >
                            困难
                          </button>
                        </div>
                      </div>

                      <div className="mb-3 text-sm text-gray-400">
                        已选择 {selectedProblems.length} 个题目 | 显示 {filteredProblems.length} / {problems.length} 个题目
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto border border-white/10 rounded-lg p-4">
                        {filteredProblems.map(problem => (
                          <div
                            key={problem.id}
                            onClick={() => toggleProblem(problem.id)}
                            className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                              selectedProblems.includes(problem.id)
                                ? 'border-indigo-500 bg-indigo-500/10'
                                : 'border-white/10 hover:border-indigo-500/50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  {problem.problemNumber && (
                                    <span className="text-sm font-mono text-gray-500">
                                      {problem.problemNumber}
                                    </span>
                                  )}
                                  <h3 className="font-medium text-white">{problem.title}</h3>
                                  <span className={`px-2 py-0.5 rounded text-xs ${
                                    getDifficultyColor(problem.difficulty)
                                  }`}>
                                    {problem.difficulty}
                                  </span>
                                </div>
                                <div className="flex gap-1">
                                  {problem.tags.slice(0, 4).map((tag, idx) => (
                                    <span key={idx} className="px-2 py-0.5 bg-white/10 rounded text-xs text-gray-400">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="ml-4">
                                <input
                                  type="checkbox"
                                  checked={selectedProblems.includes(problem.id)}
                                  onChange={() => {}}
                                  className="w-5 h-5 text-indigo-600 border-gray-600 rounded focus:ring-indigo-500 bg-white/10"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-indigo-400 mt-0.5" />
                    <div className="text-sm text-indigo-300">
                      <p className="font-medium mb-1">温馨提示</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>作业题目来自平台公开题库，所有成员都可以查看</li>
                        <li>成员需要在截止时间前完成所有题目</li>
                        <li>可以在团队详情页查看成员的完成进度</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-error/100/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="p-4 bg-secondary/100/10 border border-green-500/20 rounded-lg">
                    <p className="text-sm text-green-400">{success}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={loading || problemsLoading}
                    className="btn-primary flex-1"
                  >
                    {loading ? '创建中...' : '创建作业'}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/teams/${params.id}`)}
                    className="px-6 py-2 bg-white/10 text-gray-300 rounded-lg hover:bg-white/20 font-medium transition-colors"
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
