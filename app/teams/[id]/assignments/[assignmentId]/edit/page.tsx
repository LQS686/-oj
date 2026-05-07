'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { Calendar, BookOpen, AlertCircle, Trash2, ArrowLeft, Save } from 'lucide-react'

interface Problem {
  id: string
  problemNumber: string
  title: string
  difficulty: string
  tags: string[]
}

interface Assignment {
  id: string
  title: string
  description: string
  startTime: string
  endTime: string
  problems: Problem[]
}

export default function EditAssignmentPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const teamId = params.id as string
  const assignmentId = params.assignmentId as string

  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [problems, setProblems] = useState<Problem[]>([])
  const [selectedProblems, setSelectedProblems] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all')

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: ''
  })

  const formatDateForInput = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const offset = date.getTimezoneOffset() * 60000
    const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 16)
    return localISOTime
  }

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    fetchData()
  }, [user, teamId, assignmentId])

  const fetchData = async () => {
    try {
      setDataLoading(true)
      
      const [assignmentRes, problemsRes] = await Promise.all([
        fetchWithAuth(`/api/teams/${teamId}/assignments/${assignmentId}`),
        fetch('/api/problems?pageSize=100&isPublic=true')
      ])

      const assignmentData = await assignmentRes.json()
      const problemsData = await problemsRes.json()

      if (!assignmentData.success) {
        throw new Error(assignmentData.error || '获取作业详情失败')
      }

      if (!problemsData.success) {
        throw new Error(problemsData.error || '获取题目列表失败')
      }

      const assignment: Assignment = assignmentData.data.assignment
      
      setFormData({
        title: assignment.title,
        description: assignment.description || '',
        startTime: formatDateForInput(assignment.startTime),
        endTime: formatDateForInput(assignment.endTime)
      })

      setSelectedProblems(assignment.problems.map(p => p.id))
      setProblems(problemsData.data.problems || [])

    } catch (err: unknown) {
      const error = err as Error
      console.error('获取数据失败:', err)
      setError(error.message || '获取数据失败')
    } finally {
      setDataLoading(false)
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

    if (!formData.endTime) {
      setError('请选择截止时间')
      return
    }

    if (selectedProblems.length === 0) {
      setError('请至少选择一个题目')
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

      const response = await fetchWithAuth(`/api/teams/${teamId}/assignments/${assignmentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          startTime: formData.startTime ? new Date(formData.startTime) : undefined,
          endTime: new Date(formData.endTime),
          deadline: new Date(formData.endTime),
          problemIds: selectedProblems
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('作业更新成功')
        setTimeout(() => {
          router.push(`/teams/${teamId}/assignments/${assignmentId}`)
        }, 1500)
      } else {
        setError(data.error || '更新失败')
      }
    } catch (err) {
      console.error('更新失败:', err)
      setError('更新失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('确定要删除这个作业吗？此操作不可恢复，所有提交记录也将被删除。')) {
      return
    }

    try {
      setLoading(true)
      const response = await fetchWithAuth(`/api/teams/${teamId}/assignments/${assignmentId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        router.push(`/teams/${teamId}?tab=assignments`)
      } else {
        setError(data.error || '删除失败')
        setLoading(false)
      }
    } catch (err) {
      console.error('删除失败:', err)
      setError('删除失败，请重试')
      setLoading(false)
    }
  }

  const difficultyColors: Record<string, string> = {
    easy: 'text-green-400 bg-secondary/100/20',
    medium: 'text-accent-light bg-yellow-500/20',
    hard: 'text-red-400 bg-error/100/20'
  }

  const difficultyText: Record<string, string> = {
    easy: '简单',
    medium: '中等',
    hard: '困难'
  }

  const filteredProblems = problems.filter(problem => {
    const matchesSearch = 
      problem.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (problem.problemNumber && problem.problemNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      problem.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesDifficulty = difficultyFilter === 'all' || problem.difficulty === difficultyFilter
    
    return matchesSearch && matchesDifficulty
  })

  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-gray-400 hover:text-white mb-2 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                返回
            </button>
            <h1 className="text-3xl font-bold text-white">编辑作业</h1>
            <p className="mt-1 text-gray-400">修改作业信息或题目</p>
          </div>
          
          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-error/100/10 text-red-400 rounded-lg hover:bg-error/100/20 transition-colors border border-red-500/20"
          >
            <Trash2 className="w-4 h-4" />
            删除作业
          </button>
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

                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            开始时间
                        </label>
                        <div className="relative">
                            <input
                            type="datetime-local"
                            value={formData.startTime}
                            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                            className="input w-full"
                            />
                            <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                        </div>
                        <p className="mt-1 text-sm text-gray-500">留空则保持原开始时间</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            截止时间 <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                            <input
                            type="datetime-local"
                            value={formData.endTime}
                            onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                            className="input w-full"
                            required
                            />
                            <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                        </div>
                    </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    选择题目 <span className="text-red-400">*</span>
                  </label>

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
                                difficultyColors[problem.difficulty] || 'bg-white/10 text-gray-400'
                                }`}>
                                {difficultyText[problem.difficulty] || problem.difficulty}
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

                <div className="flex gap-3 pt-4 border-t border-white/10">
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary flex items-center justify-center gap-2 flex-1"
                  >
                    <Save className="w-5 h-5" />
                    {loading ? '保存中...' : '保存修改'}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.back()}
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
