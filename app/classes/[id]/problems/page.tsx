'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import ProblemOpenLink from '@/components/problem/ProblemOpenLink'
import { fetchWithAuth } from '@/lib/api/base'
import { BookOpen, Search, AlertCircle, CheckCircle2, Filter } from 'lucide-react'
import {
  ClassWorkspaceShell,
  PageLoading,
  DenseListShell,
  denseListRowClass,
} from '@/components/common'
import { useClass } from '@/hooks/useClass'

interface Problem {
  id: string
  title: string
  difficulty: string
  tags: string[]
  totalSubmit: number
  totalAccepted: number
  status?: string
}

export default function ClassProblemsPage() {
  const params = useParams()
  const classId = params.id as string
  const { classData } = useClass(classId)

  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDifficulty, setSelectedDifficulty] = useState('全部')

  const difficulties = ['全部', '入门', '普及-', '普及', '普及+', '提高', '提高+', '省选', 'NOI']

  useEffect(() => {
    fetchProblems()
  }, [classId])

  const fetchProblems = async () => {
    try {
      setLoading(true)
      const response = await fetchWithAuth(`/api/classes/${classId}/problems`)
      const data = await response.json()
      if (data.success) {
        setProblems(data.data.problems || [])
      } else {
        setError(data.error || '获取题目失败')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    const colorMap: Record<string, string> = {
      入门: 'bg-muted text-muted-foreground border border-border',
      '普及-': 'bg-secondary/15 text-secondary-light border border-secondary/25',
      普及: 'bg-info/15 text-cyan-400 border border-info/25',
      '普及+': 'bg-accent/15 text-accent-light border border-accent/25',
      提高: 'bg-accent/15 text-accent-light border border-accent/25',
      '提高+': 'bg-error/15 text-red-400 border border-error/25',
      省选: 'bg-error/15 text-red-400 border border-error/25',
      NOI: 'bg-purple-500/15 text-purple-400 border border-purple-500/25',
    }
    return colorMap[difficulty] || 'bg-muted text-muted-foreground border border-border'
  }

  const filteredProblems = problems.filter((problem) => {
    const matchesSearch = problem.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesDifficulty =
      selectedDifficulty === '全部' || problem.difficulty === selectedDifficulty
    return matchesSearch && matchesDifficulty
  })

  if (loading) {
    return <PageLoading label="加载班级题目中..." />
  }

  if (error) {
    return (
      <ClassWorkspaceShell
        classId={classId}
        className={classData?.name}
        title="班级题库"
        icon={BookOpen}
      >
        <div className="card-static rounded-lg p-8 text-center border border-border">
          <AlertCircle className="w-10 h-10 text-error mx-auto mb-4" />
          <p className="text-error mb-4">{error}</p>
          <Link href={`/classes/${classId}`} className="btn btn-primary">
            返回班级概览
          </Link>
        </div>
      </ClassWorkspaceShell>
    )
  }

  const columns = [
    { span: 'col-span-6 md:col-span-6', label: '题目' },
    { span: 'col-span-3 md:col-span-2', label: '难度' },
    { span: 'col-span-3 md:col-span-2', label: '状态' },
    { span: 'hidden md:block md:col-span-2', label: '标签' },
  ]

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title="班级题库"
      description={`共 ${problems.length} 道题目`}
      icon={BookOpen}
      toolbar={
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              type="text"
              placeholder="搜索题目..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9 w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="input w-auto min-w-[120px]"
            >
              {difficulties.map((diff) => (
                <option key={diff} value={diff}>
                  {diff}
                </option>
              ))}
            </select>
          </div>
        </div>
      }
    >
      {filteredProblems.length === 0 ? (
        <div className="card-static rounded-lg p-12 text-center border border-border">
          <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-foreground">暂无题目</p>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery || selectedDifficulty !== '全部'
              ? '没有符合条件的题目'
              : '班级暂未添加题目'}
          </p>
        </div>
      ) : (
        <DenseListShell columns={columns}>
          {filteredProblems.map((problem, index) => {
            const acceptRate =
              problem.totalSubmit > 0
                ? ((problem.totalAccepted / problem.totalSubmit) * 100).toFixed(1)
                : '0.0'

            return (
              <ProblemOpenLink
                key={problem.id}
                href={`/problem/${problem.id}?classId=${classId}${classData?.name ? `&className=${encodeURIComponent(classData.name)}` : ''}`}
                problemTitle={problem.title}
                titleContext={{ kind: 'class', className: classData?.name }}
                className={`${denseListRowClass} group`}
              >
                <div className="col-span-6 md:col-span-6 flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-mono font-bold text-muted-foreground text-sm shrink-0">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-foreground group-hover:text-primary truncate">
                      {problem.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      通过率 {acceptRate}% · 提交 {problem.totalSubmit || 0}
                    </div>
                  </div>
                </div>
                <div className="col-span-3 md:col-span-2 flex items-center">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md ${getDifficultyColor(problem.difficulty)}`}
                  >
                    {problem.difficulty}
                  </span>
                </div>
                <div className="col-span-3 md:col-span-2 flex items-center">
                  {problem.status === 'AC' ? (
                    <span className="tag-success text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                      已通过
                    </span>
                  ) : problem.status ? (
                    <span className="tag-warning text-xs">已尝试</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </div>
                <div className="hidden md:flex md:col-span-2 items-center min-w-0">
                  {problem.tags?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {problem.tags.slice(0, 2).map((tag, i) => (
                        <span key={i} className="tag tag-primary text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </div>
              </ProblemOpenLink>
            )
          })}
        </DenseListShell>
      )}
    </ClassWorkspaceShell>
  )
}