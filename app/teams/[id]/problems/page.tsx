'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { 
  BookOpen, 
  ArrowLeft, 
  Search, 
  Plus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Filter
} from 'lucide-react'

interface Problem {
  id: string
  title: string
  difficulty: string
  tags: string[]
  totalSubmit: number
  totalAccepted: number
  status?: string
}

export default function TeamProblemsPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDifficulty, setSelectedDifficulty] = useState('全部')

  const difficulties = ['全部', '入门', '普及-', '普及', '普及+', '提高', '提高+', '省选', 'NOI']

  useEffect(() => {
    fetchProblems()
  }, [params.id])

  const fetchProblems = async () => {
    try {
      setLoading(true)
      
      const response = await fetchWithAuth(`/api/teams/${params.id}/problems`)

      const data = await response.json()

      if (data.success) {
        setProblems(data.data.problems || [])
      } else {
        setError(data.error || '获取题目失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    const colorMap: Record<string, string> = {
      '入门': 'bg-muted/50 text-muted-foreground border border-border',
      '普及-': 'bg-secondary/15 text-secondary-light border border-secondary/25',
      '普及': 'bg-info/15 text-cyan-400 border border-info/25',
      '普及+': 'bg-accent/15 text-accent-light border border-accent/25',
      '提高': 'bg-accent/15 text-accent-light border border-accent/25',
      '提高+': 'bg-error/15 text-red-400 border border-error/25',
      '省选': 'bg-error/15 text-red-400 border border-error/25',
      'NOI': 'bg-purple-500/15 text-purple-400 border border-purple-500/25',
    }
    return colorMap[difficulty] || 'bg-muted/50 text-muted-foreground border border-border'
  }

  const filteredProblems = problems.filter(problem => {
    const matchesSearch = problem.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesDifficulty = selectedDifficulty === '全部' || problem.difficulty === selectedDifficulty
    return matchesSearch && matchesDifficulty
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载题目中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center card-static rounded-2xl p-12 max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <p className="text-error text-lg mb-6">{error}</p>
          <button
            onClick={() => router.push(`/teams/${params.id}`)}
            className="btn-primary btn"
          >
            返回团队详情
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <button
          onClick={() => router.push(`/teams/${params.id}`)}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary-light mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          返回团队详情
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">团队题库</h1>
              <p className="text-muted-foreground text-sm">团队专属题目列表</p>
            </div>
          </div>
        </div>

        <div className="card-static rounded-2xl p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <input
                  type="text"
                  placeholder="搜索题目..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-12 py-3"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="input w-auto min-w-[140px] py-3"
              >
                {difficulties.map((diff) => (
                  <option key={diff} value={diff}>{diff}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {filteredProblems.length === 0 ? (
          <div className="card-static rounded-2xl p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">暂无题目</div>
            <div className="text-muted-foreground">
              {searchQuery || selectedDifficulty !== '全部' ? '没有符合条件的题目' : '团队暂未添加题目'}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProblems.map((problem, index) => {
              const acceptRate = problem.totalSubmit > 0 
                ? ((problem.totalAccepted / problem.totalSubmit) * 100).toFixed(1) 
                : '0.0'

              return (
                <Link
                  key={problem.id}
                  href={`/problem/${problem.id}?teamId=${params.id}`}
                  className="card p-5 flex items-center gap-4 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center font-mono font-bold text-muted-foreground">
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-medium text-foreground group-hover:text-primary-light transition-colors truncate">
                        {problem.title}
                      </span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getDifficultyColor(problem.difficulty)}`}>
                        {problem.difficulty}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>通过率: {acceptRate}%</span>
                      <span>提交: {problem.totalSubmit || 0}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {problem.status === 'AC' ? (
                      <span className="tag-success">
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                        已通过
                      </span>
                    ) : problem.status ? (
                      <span className="tag-warning">已尝试</span>
                    ) : null}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
