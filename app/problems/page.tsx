'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import ProblemOpenLink from '@/components/problem/ProblemOpenLink'
import {
  Search,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  MoreHorizontal,
  ChevronDown,
  Tag,
  Shuffle,
} from 'lucide-react'
import { getDifficultyColor } from '@/lib/status'
import { useUser } from '@/contexts/UserContext'
import { DIFFICULTIES } from '@/lib/constants'
import { fetchWithCookie } from '@/lib/api/base'
import { useClickOutside } from '@/hooks/useClickOutside'
import { EducationalPageShell, DenseListShell, denseListRowClass } from '@/components/common'

interface Problem {
  id: string
  problemNumber: string
  title: string
  difficulty: string
  totalSubmit: number
  totalAccepted: number
  tags: string[]
  source?: string
}

export default function ProblemsPage() {
  const { user } = useUser()
  const router = useRouter()
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalProblems, setTotalProblems] = useState(0)
  const [availableTags, setAvailableTags] = useState<string[]>([])

  const [problemStatus, setProblemStatus] = useState<{ [problemId: string]: { score: number, submitted: boolean } }>({})
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [difficultyOpen, setDifficultyOpen] = useState(false)
  const [tagModalOpen, setTagModalOpen] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [randomLoading, setRandomLoading] = useState(false)

  const difficultyRef = useRef<HTMLDivElement>(null)
  useClickOutside(difficultyRef, () => setDifficultyOpen(false))

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
      const response = await fetchWithCookie('/api/problems/tags')
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

    if (selectedDifficulties.length > 0) {
      filtered = filtered.filter((p) => selectedDifficulties.includes(p.difficulty))
    }

    if (selectedTags.length > 0) {
      filtered = filtered.filter((p) =>
        selectedTags.some((tag) => p.tags?.includes(tag))
      )
    }

    return filtered
  }, [problems, searchQuery, selectedDifficulties, selectedTags])

  const fetchProblems = async () => {
    try {
      setLoading(true)
      const response = await fetchWithCookie(`/api/problems?page=${page}&limit=30`)
      const data = await response.json()

      if (data.success) {
        setProblems(data.data.problems || [])
        setTotalPages(data.data.pagination?.totalPages || 1)
        setTotalProblems(data.data.pagination?.total || 0)
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

      const response = await fetchWithCookie(
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

  const hasFilters =
    !!searchQuery || selectedDifficulties.length > 0 || selectedTags.length > 0

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedDifficulties([])
    setSelectedTags([])
  }

  // 随机一题（参考 HOJ 题库 "随机一题" 按钮）
  // 尊重当前筛选条件（search/difficulty/tag），从结果集中随机抽一题跳转
  const handleRandomProblem = async () => {
    try {
      setRandomLoading(true)
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      // 多选难度/标签只取第一个作为随机筛选条件（API 单值）
      if (selectedDifficulties.length > 0) params.set('difficulty', selectedDifficulties[0])
      if (selectedTags.length > 0) params.set('tag', selectedTags[0])
      const queryString = params.toString()
      const url = `/api/problems/random${queryString ? `?${queryString}` : ''}`
      const res = await fetchWithCookie(url)
      const data = await res.json()
      if (data.success && data.data) {
        const target = data.data.problemNumber || data.data.id
        router.push(`/problem/${target}`)
      } else {
        alert(data.error || '没有符合条件的题目')
      }
    } catch (err) {
      alert('网络错误，请稍后重试')
    } finally {
      setRandomLoading(false)
    }
  }

  const toggleDifficulty = (d: string) => {
    setSelectedDifficulties((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    )
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    )
  }

  const filteredTagOptions = useMemo(() => {
    const q = tagSearch.trim().toLowerCase()
    if (!q) return availableTags
    return availableTags.filter((t) => t.toLowerCase().includes(q))
  }, [availableTags, tagSearch])

  const difficultyLabel =
    selectedDifficulties.length === 0
      ? '全部难度'
      : selectedDifficulties.length === 1
        ? selectedDifficulties[0]
        : `难度 · ${selectedDifficulties.length}`

  const tagLabel =
    selectedTags.length === 0
      ? '标签'
      : selectedTags.length === 1
        ? selectedTags[0]
        : `标签 · ${selectedTags.length}`

  const problemListColumns = [
    { span: 'col-span-1 text-center', label: '状态' },
    { span: 'col-span-1 text-center', label: '题号' },
    { span: 'col-span-4', label: '标题' },
    { span: 'col-span-2', label: '标签' },
    { span: 'col-span-1 text-center', label: '难度' },
    { span: 'col-span-2 text-center', label: 'AC 率' },
    { span: 'col-span-1 text-center', label: '' },
  ]

  const renderContent = () => {
    if (loading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-lg animate-pulse">
              <div className="w-5 h-5 rounded bg-muted" />
              <div className="w-16 h-4 rounded bg-muted" />
              <div className="flex-1 h-4 rounded bg-muted" />
              <div className="flex gap-1.5">
                <div className="w-12 h-5 rounded bg-muted" />
                <div className="w-8 h-5 rounded bg-muted" />
              </div>
              <div className="w-10 h-4 rounded bg-muted" />
              <div className="w-8 h-4 rounded bg-muted" />
              <div className="w-5 h-5 rounded bg-muted" />
            </div>
          ))}
        </div>
      )
    }

    if (filteredProblems.length === 0) {
      return (
        <div className="card-static rounded-lg p-12 text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-foreground text-xl font-semibold mb-2">没有找到符合条件的题目</div>
          <div className="text-muted-foreground mb-6">尝试调整筛选条件或搜索关键词</div>
          {hasFilters && (
            <button onClick={clearFilters} className="btn btn-primary">
              清除筛选
            </button>
          )}
        </div>
      )
    }

    return (
      <div className="animate-fadeIn">
        <DenseListShell columns={problemListColumns}>
          {filteredProblems.map((problem) => {
            const status = problemStatus[problem.id]
            const score = status?.score || 0
            const submitted = status?.submitted || false
            const isSolved = score === 100

            return (
              <ProblemOpenLink
                key={problem.id}
                href={`/problem/${problem.problemNumber || problem.id}`}
                problemTitle={problem.title}
                titleContext={{
                  kind: 'library',
                  problemNumber: problem.problemNumber || problem.id,
                }}
                className={`${denseListRowClass} group`}
              >
                <div className="col-span-1 flex items-center justify-center">
                  {user ? (
                    loadingStatus ? (
                      <div className="w-4 h-4 rounded-full bg-muted animate-pulse"></div>
                    ) : isSolved ? (
                      <Check className="w-5 h-5 text-secondary" aria-label="已通过" />
                    ) : submitted ? (
                      <X className="w-5 h-5 text-error" aria-label="已尝试未通过" />
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

                <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
                  {problem.tags && problem.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary-light transition-colors">
                      {tag}
                    </span>
                  ))}
                  {problem.tags && problem.tags.length > 2 && (
                    <span className="text-xs text-muted-foreground">+{problem.tags.length - 2}</span>
                  )}
                </div>

                <div className="col-span-1 flex items-center justify-center">
                  <span className={`difficulty-tag ${getDifficultyColor(problem.difficulty)}`}>
                    {problem.difficulty}
                  </span>
                </div>

                <div className="col-span-2 flex items-center justify-center">
                  {(() => {
                    // AC 率进度条（参考 HOJ ProblemList.vue el-progress 分段色）
                    // 0% 灰、1-39% 红、40-59% 橙、60-79% 蓝、80-100% 绿
                    const total = problem.totalSubmit || 0
                    const accepted = problem.totalAccepted || 0
                    if (total === 0) {
                      return <span className="text-xs text-muted-foreground/50">-</span>
                    }
                    const rate = Math.round((accepted / total) * 100)
                    const colorClass =
                      rate >= 80 ? 'bg-secondary' :
                      rate >= 60 ? 'bg-primary' :
                      rate >= 40 ? 'bg-accent' :
                      rate >= 1  ? 'bg-error' :
                                   'bg-muted'
                    return (
                      <div className="w-full max-w-[100px]">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                          <span className="font-mono tabular-nums">{rate}%</span>
                          <span className="font-mono tabular-nums">{accepted}/{total}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${colorClass} rounded-full transition-all`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                      </div>
                    )
                  })()}
                </div>

                <div className="col-span-1 flex items-center justify-center">
                  <MoreHorizontal className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </ProblemOpenLink>
            )
          })}
        </DenseListShell>

        {totalPages > 1 && (
          <div className="flex justify-center mt-8">
            <div className="flex items-center gap-2 card-static rounded-lg p-1">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="btn btn-ghost px-3 py-2 rounded-md"
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
                      className={`w-8 h-8 rounded-md font-semibold transition-colors ${
                        page === pageNum
                          ? 'btn btn-primary'
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
                      className={`w-8 h-8 rounded-md font-semibold transition-colors ${
                        page === totalPages
                          ? 'btn btn-primary'
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
                className="btn btn-ghost px-3 py-2 rounded-md"
              >
                <ChevronRight className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <EducationalPageShell
        title="题库"
        icon={BookOpen}
        toolbar={
          <div className="card-static rounded-lg border border-border p-2 relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="relative flex-1 min-w-0 flex items-center">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
                <input
                  type="text"
                  placeholder="输入题号、标题或来源"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-md border-0 bg-transparent text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-0"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 sm:border-l border-border pt-2 sm:pt-0 sm:pl-2">
                <div className="relative" ref={difficultyRef}>
                  <button
                    type="button"
                    onClick={() => setDifficultyOpen((o) => !o)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted transition-colors max-w-[9rem] truncate ${
                      selectedDifficulties.length > 0 ? 'border-primary/40 text-primary' : 'text-foreground'
                    }`}
                  >
                    <span className="truncate">{difficultyLabel}</span>
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${difficultyOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {difficultyOpen && (
                    <div className="absolute right-0 sm:left-0 z-50 mt-1 w-52 max-h-72 overflow-y-auto rounded-lg border border-border bg-background shadow-lg py-1">
                      <button
                        type="button"
                        onClick={() => setSelectedDifficulties([])}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted text-muted-foreground"
                      >
                        全部难度
                      </button>
                      {DIFFICULTIES.map((d) => {
                        const checked = selectedDifficulties.includes(d)
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleDifficulty(d)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                          >
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                checked ? 'bg-primary border-primary text-white' : 'border-border'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3" />}
                            </span>
                            <span className={`difficulty-tag ${getDifficultyColor(d)}`}>{d}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setTagSearch('')
                    setTagModalOpen(true)
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted transition-colors max-w-[9rem] truncate ${
                    selectedTags.length > 0 ? 'border-primary/40 text-primary' : 'text-foreground'
                  }`}
                >
                  <Tag className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tagLabel}</span>
                </button>

                {hasFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="p-2 rounded-md text-muted-foreground hover:bg-error/10 hover:text-error transition-colors"
                    title="清除筛选"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRandomProblem}
                  disabled={randomLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-primary/30 bg-primary/10 text-primary-light hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="随机跳转一道题目（尊重当前筛选条件）"
                >
                  <Shuffle className={`w-4 h-4 ${randomLoading ? 'animate-pulse' : ''}`} />
                  <span className="hidden sm:inline">随机一题</span>
                </button>
              </div>
            </div>
          </div>
        }
      >
        {renderContent()}
      </EducationalPageShell>

      {tagModalOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 animate-backdrop-in"
          onClick={() => setTagModalOpen(false)}
        >
          <div
            className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col border border-border animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">选择标签</h2>
              <button
                type="button"
                onClick={() => setTagModalOpen(false)}
                className="p-2 rounded-md hover:bg-muted text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索标签…"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {selectedTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary/10 text-primary"
                    >
                      {t}
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {filteredTagOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">暂无匹配标签</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filteredTagOptions.map((tag) => {
                    const checked = selectedTags.includes(tag)
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          checked
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-muted/50 text-foreground hover:bg-muted'
                        }`}
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                        {tag}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 p-4 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedTags([])}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                清空已选
              </button>
              <button type="button" onClick={() => setTagModalOpen(false)} className="btn btn-primary">
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
