'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { 
  Search, 
  Check, 
  Filter, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  BookOpen,
  MoreHorizontal
} from 'lucide-react'
import { calculateAcceptRate } from '@/lib/utils'
import { getDifficultyColor } from '@/lib/status'
import { useUser } from '@/contexts/UserContext'
import { DIFFICULTIES } from '@/lib/constants'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchWithAuth } from '@/lib/api/base'

interface Problem {
  id: string
  problemNumber: string
  title: string
  difficulty: string
  totalSubmit: number
  totalAccepted: number
  tags: string[]
}

const MotionLink = motion(Link)

export default function ProblemsPage() {
  const { user } = useUser()
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDifficulty, setSelectedDifficulty] = useState('全部')
  const [selectedTag, setSelectedTag] = useState('全部')
  const [sortBy, setSortBy] = useState('default')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalProblems, setTotalProblems] = useState(0)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  
  const [problemStatus, setProblemStatus] = useState<{ [problemId: string]: { score: number, submitted: boolean } }>({})
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const difficulties = ['全部', ...DIFFICULTIES]

  useEffect(() => {
    fetchProblems()
    fetchTags()
  }, [page])

  useEffect(() => {
    if (user && problems.length > 0) {
      fetchProblemStatus()
    }
  }, [user, problems])

  const fetchTags = async () => {
    try {
      const response = await fetch('/api/problems/tags')
      const data = await response.json()
      if (data.success) {
        setAvailableTags(data.data)
      }
    } catch (error) {
      console.error('获取标签失败:', error)
    }
  }

  const filteredProblems = useMemo(() => {
    let filtered = [...problems]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.problemNumber?.toLowerCase().includes(query) ||
          p.title.toLowerCase().includes(query)
      )
    }

    if (selectedDifficulty !== '全部') {
      filtered = filtered.filter((p) => p.difficulty === selectedDifficulty)
    }

    if (selectedTag !== '全部') {
      filtered = filtered.filter((p) => p.tags?.includes(selectedTag))
    }

    if (sortBy === 'difficulty') {
      filtered.sort((a, b) => DIFFICULTIES.indexOf(a.difficulty as any) - DIFFICULTIES.indexOf(b.difficulty as any))
    } else if (sortBy === 'acceptRate') {
      filtered.sort((a, b) => {
        const rateA = a.totalSubmit > 0 ? a.totalAccepted / a.totalSubmit : 0
        const rateB = b.totalSubmit > 0 ? b.totalAccepted / b.totalSubmit : 0
        return rateB - rateA
      })
    } else if (sortBy === 'submitCount') {
      filtered.sort((a, b) => b.totalSubmit - a.totalSubmit)
    }

    return filtered
  }, [problems, searchQuery, selectedDifficulty, selectedTag, sortBy])

  const fetchProblems = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/problems?page=${page}&limit=30`)
      const data = await response.json()

      if (data.success) {
        setProblems(data.data.problems)
        setTotalPages(data.data.pagination.totalPages)
        setTotalProblems(data.data.pagination.total)
      }
    } catch (error) {
      console.error('获取题目列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProblemStatus = async () => {
    if (!user) return

    try {
      setLoadingStatus(true)
      const problemIds = problems.map(p => p.id).join(',')
      
      const response = await fetchWithAuth(
        `/api/problems/status?problemIds=${problemIds}`
      )
      const data = await response.json()

      if (data.success && data.data) {
        setProblemStatus(data.data)
      }
    } catch (error) {
      console.error('获取题目状态失败:', error)
    } finally {
      setLoadingStatus(false)
    }
  }

  const hasFilters = searchQuery || selectedDifficulty !== '全部' || selectedTag !== '全部' || sortBy !== 'default'

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedDifficulty('全部')
    setSelectedTag('全部')
    setSortBy('default')
  }

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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/25">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">题库</h1>
                <p className="text-muted-foreground text-sm mt-0.5">共 {totalProblems} 道题目</p>
              </div>
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="btn btn-ghost flex items-center gap-2 hover:bg-primary/10 transition-colors"
            >
              <Filter className="w-4.5 h-4.5" />
              筛选
            </button>
          </div>

          <div className="max-w-2xl mx-auto mb-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <input
                type="text"
                placeholder="输入 ID 或标题或来源"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </div>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
                className="bg-white dark:bg-card rounded-lg shadow-lg p-6 mb-6 border border-border"
              >
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-foreground mb-3">难度</label>
                    <div className="flex flex-wrap gap-2">
                      {difficulties.map((diff) => (
                        <button
                          key={diff}
                          onClick={() => setSelectedDifficulty(diff)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            selectedDifficulty === diff
                              ? 'bg-primary text-white shadow-md shadow-primary/25'
                              : 'bg-muted/30 text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                          }`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-foreground mb-3">标签</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setSelectedTag('全部')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          selectedTag === '全部'
                            ? 'bg-secondary text-white shadow-md shadow-secondary/25'
                            : 'bg-muted/30 text-muted-foreground hover:bg-secondary/10 hover:text-secondary-light'
                        }`}
                      >
                        全部
                      </button>
                      {availableTags.slice(0, 8).map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setSelectedTag(tag)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            selectedTag === tag
                              ? 'bg-secondary text-white shadow-md shadow-secondary/25'
                              : 'bg-muted/30 text-muted-foreground hover:bg-secondary/10 hover:text-secondary-light'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                      {availableTags.length > 8 && (
                        <span className="text-xs text-muted-foreground px-3 py-1.5">+{availableTags.length - 8}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-foreground mb-3">排序</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    >
                      <option value="default">默认排序</option>
                      <option value="difficulty">按难度</option>
                      <option value="acceptRate">按通过率</option>
                      <option value="submitCount">按提交量</option>
                    </select>
                  </div>

                  {hasFilters && (
                    <div className="flex items-end">
                      <button
                        onClick={clearFilters}
                        className="btn btn-ghost flex items-center gap-2 hover:bg-error/10 hover:text-error transition-colors"
                      >
                        <X className="w-4 h-4" />
                        重置
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {filteredProblems.length === 0 ? (
          <div className="bg-white dark:bg-card rounded-lg shadow-lg p-12 text-center border border-border">
            <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-6">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">没有找到符合条件的题目</div>
            <div className="text-muted-foreground mb-6">尝试调整筛选条件或搜索关键词</div>
            {hasFilters && (
              <button onClick={clearFilters} className="btn btn-primary hover:shadow-lg hover:shadow-primary/25 transition-all">
                清除筛选
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-card rounded-t-lg shadow-lg overflow-hidden border border-border">
              <div className="bg-muted/20 px-4 py-3 text-sm font-semibold text-muted-foreground border-b border-border">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-1 text-center">Y/N</div>
                  <div className="col-span-1 text-center">题号</div>
                  <div className="col-span-4">标题</div>
                  <div className="col-span-3">标签</div>
                  <div className="col-span-1 text-center">难度</div>
                  <div className="col-span-1 text-center">正确</div>
                  <div className="col-span-1 text-center"></div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-card rounded-b-lg shadow-lg border-t-0 border border-border overflow-hidden">
              {filteredProblems.map((problem, index) => {
                const status = problemStatus[problem.id]
                const score = status?.score || 0
                const submitted = status?.submitted || false
                const isSolved = score === 100

                return (
                  <motion.div
                    key={problem.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Link
                      href={`/problem/${problem.problemNumber || problem.id}`}
                      className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border hover:bg-primary/5 transition-colors group"
                    >
                      <div className="col-span-1 flex items-center justify-center">
                        {user ? (
                          loadingStatus ? (
                            <div className="w-4 h-4 rounded-full bg-muted animate-pulse"></div>
                          ) : isSolved ? (
                            <Check className="w-5 h-5 text-secondary" />
                          ) : (
                            <div className="w-4 h-4"></div>
                          )
                        ) : (
                          <div className="w-4 h-4"></div>
                        )}
                      </div>

                      <div className="col-span-1 flex items-center justify-center">
                        <span className="font-mono text-sm text-foreground font-semibold">
                          {problem.problemNumber || problem.id}
                        </span>
                      </div>

                      <div className="col-span-4 flex items-center">
                        <span className="text-foreground font-medium group-hover:text-primary-light transition-colors truncate">
                          {problem.title}
                        </span>
                      </div>

                      <div className="col-span-3 flex items-center gap-1.5 flex-wrap">
                        {problem.tags && problem.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-xs px-2 py-1 rounded-md bg-muted/40 text-muted-foreground hover:bg-primary/10 hover:text-primary-light transition-colors">
                            {tag}
                          </span>
                        ))}
                        {problem.tags && problem.tags.length > 3 && (
                          <span className="text-xs text-muted-foreground">+{problem.tags.length - 3}</span>
                        )}
                      </div>

                      <div className="col-span-1 flex items-center justify-center">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-md ${getDifficultyColor(problem.difficulty)}`}>
                          {problem.difficulty}
                        </span>
                      </div>

                      <div className="col-span-1 flex items-center justify-center">
                        <span className="text-sm text-muted-foreground font-medium">
                          {problem.totalAccepted}
                        </span>
                      </div>

                      <div className="col-span-1 flex items-center justify-center">
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center mt-8">
                <div className="flex items-center gap-2 bg-white dark:bg-card rounded-lg shadow-md p-1 border border-border">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="btn btn-ghost px-3 py-2 rounded-md hover:bg-primary/10 transition-colors"
                  >
                    <ChevronLeft className="w-4.5 h-4.5" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = i + 1
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 rounded-md font-semibold transition-all ${
                            page === pageNum
                              ? 'bg-primary text-white shadow-md shadow-primary/25'
                              : 'text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    {totalPages > 5 && (
                      <>
                        <span className="px-2 text-muted-foreground">...</span>
                        <button
                          onClick={() => setPage(totalPages)}
                          className={`w-8 h-8 rounded-md font-semibold transition-all ${
                            page === totalPages
                              ? 'bg-primary text-white shadow-md shadow-primary/25'
                              : 'text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                          }`}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="btn btn-ghost px-3 py-2 rounded-md hover:bg-primary/10 transition-colors"
                  >
                    <ChevronRight className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
