'use client'

/**
 * app/training/[id]/page.tsx
 * 题单详情页
 *
 * - Tab：题单简介 / 题目列表（支持 ?tab=）
 * - 简介：Markdown、标签、难度分布、结构概览
 * - 侧栏：开始学习（跳下一题）、元信息、进度
 * - 实时：WebSocket + 3s 兜底轮询
 */
import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  Suspense,
  type ReactNode,
} from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import { useUser } from '@/contexts/UserContext'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ProblemOpenLink from '@/components/problem/ProblemOpenLink'
import {
  BookOpen,
  Eye,
  AlertCircle,
  RefreshCw,
  Tag,
  CheckCircle2,
  Circle,
  AlertOctagon,
  Heart,
  ChevronRight,
  Loader2,
  Sparkles,
  Trophy,
  ListOrdered,
  Target,
} from 'lucide-react'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import JoinTrainingButton from '@/components/training/JoinTrainingButton'
import { ProgressCircle } from '@/components/training/ProgressCircle'
import type { TrainingDetail, TrainingProblemStatus } from '@/lib/training/types'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDate } from '@/lib/utils'
import { EducationalPageShell, PageLoading } from '@/components/common'
import MarkdownRenderer from '@/components/common/MarkdownRenderer'

type Tab = 'intro' | 'problems'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const CATEGORY_TYPE_LABEL: Record<string, { label: string; className: string; icon: typeof BookOpen }> = {
  official: {
    label: '官方题单',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    icon: BookOpen,
  },
  contest: {
    label: '竞赛/考级',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    icon: Trophy,
  },
}

function statusBadge(status: TrainingProblemStatus | undefined) {
  switch (status) {
    case 'AC':
      return <CheckCircle2 className="w-4 h-4 text-success" />
    case 'ATTEMPTED':
      return <AlertOctagon className="w-4 h-4 text-error" />
    default:
      return <Circle className="w-4 h-4 text-muted-foreground" />
  }
}

function difficultyTag(diff: string | null | undefined) {
  if (!diff) return null
  const cls = diff.includes('入门')
    ? 'bg-success/15 text-success border-success/20'
    : diff.includes('普及')
      ? 'bg-warning/15 text-warning border-warning/20'
      : diff.includes('提高') || diff.includes('省选') || diff.includes('NOI')
        ? 'bg-error/15 text-error border-error/20'
        : 'bg-primary/15 text-primary-light border-primary/20'
  return <span className={`text-xs px-1.5 py-0.5 rounded border ${cls}`}>{diff}</span>
}

function difficultyBarColor(diff: string): string {
  if (diff.includes('入门')) return 'bg-success'
  if (diff.includes('普及')) return 'bg-warning'
  if (diff.includes('提高') || diff.includes('省选') || diff.includes('NOI')) return 'bg-error'
  return 'bg-primary'
}

function formatCount(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

function TrainingDetailPageContent() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const trainingId = params?.id ?? ''
  const { user } = useUser()

  const [training, setTraining] = useState<TrainingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>(() =>
    searchParams.get('tab') === 'problems' ? 'problems' : 'intro'
  )
  const [judgeStatus, setJudgeStatus] = useState<{ problemId: string; status: string } | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useDocumentTitle(training?.title)

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'problems' || tab === 'intro') setActiveTab(tab)
  }, [searchParams])

  const setTab = useCallback(
    (tab: Tab) => {
      setActiveTab(tab)
      const qs = tab === 'problems' ? '?tab=problems' : ''
      router.replace(`/training/${trainingId}${qs}`, { scroll: false })
    },
    [router, trainingId]
  )

  const fetchDetail = useCallback(
    async (showLoading = true) => {
      if (!trainingId) return
      try {
        if (showLoading) setLoading(true)
        const res = await fetchWithCookie(`/api/trainings/${trainingId}`, {
          cache: 'no-store',
          headers: { Pragma: 'no-cache', 'Cache-Control': 'no-cache' },
        })
        const data = await res.json()
        if (res.status === 404 || data.error?.includes('不存在')) {
          setNotFound(true)
          setTraining(null)
          return
        }
        if (!data.success) {
          setError(data.error || '加载失败')
          return
        }
        setTraining(data.data as TrainingDetail)
        setError(null)
        setNotFound(false)
      } catch {
        setError('网络错误')
      } finally {
        setLoading(false)
      }
    },
    [trainingId]
  )

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  useSubmissionSocket({
    userId: user?.id || '',
    enabled: !!user,
    onSubmissionUpdate: (data) => {
      if (!data?.id) return
      if (data.status && ['Pending', 'Judging', 'Running'].includes(data.status)) {
        setJudgeStatus({ problemId: data.problemId || '', status: data.status })
        return
      }
      setJudgeStatus(null)
      void fetchDetail(false)
    },
  })

  const judgeStatusRef = useRef<{ problemId: string; status: string } | null>(null)

  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = setInterval(() => {
      fetchDetail(false)
    }, 3000)
  }, [fetchDetail])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  useEffect(() => {
    judgeStatusRef.current = judgeStatus
    if (judgeStatus && document.visibilityState === 'visible') {
      startPolling()
    } else if (!judgeStatus) {
      stopPolling()
    }
  }, [judgeStatus, startPolling, stopPolling])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (judgeStatusRef.current) {
          fetchDetail(false)
          startPolling()
        } else {
          stopPolling()
        }
      } else {
        stopPolling()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingId])

  const difficultyStats = useMemo(() => {
    if (!training) return []
    const map = new Map<string, number>()
    for (const item of training.problems) {
      const d = item.problem?.difficulty?.trim() || '未标注'
      map.set(d, (map.get(d) || 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [training])

  const nextProblem = useMemo(() => {
    if (!training?.problems.length) return null
    const attempted = training.problems.find((p) => p.status === 'ATTEMPTED')
    if (attempted?.problem?.id) return attempted
    const notStarted = training.problems.find(
      (p) => !p.status || p.status === 'NOT_STARTED' || p.status === 'WRONG'
    )
    return notStarted || training.problems[0]
  }, [training])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <p className="text-muted-foreground text-lg">加载中...</p>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card-static rounded-lg p-12 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <div className="text-foreground text-xl font-semibold mb-2">题单不存在</div>
          <p className="text-muted-foreground mb-6">该题单不存在或已被删除</p>
          <Link href="/training" className="btn-primary btn">
            返回题单列表
          </Link>
        </div>
      </div>
    )
  }

  if (error && !training) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card-static rounded-lg p-12 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <div className="text-foreground text-xl font-semibold mb-2">加载失败</div>
          <p className="text-muted-foreground mb-6">{error}</p>
          <button onClick={() => fetchDetail()} className="btn-primary btn">
            <RefreshCw className="w-4 h-4" />
            重试
          </button>
        </div>
      </div>
    )
  }

  if (!training) return null

  const progress = training.userProgress
  const totalProblems = training.problems.length
  const requiredCount = training.problems.filter((p) => p.required).length
  const attemptedOnly = Math.max(0, progress.attemptedCount - progress.solvedCount)
  const notStarted = Math.max(0, progress.totalProblems - progress.attemptedCount)
  const catType = training.categoryType ? CATEGORY_TYPE_LABEL[training.categoryType] : null
  const CatIcon = catType?.icon
  const nextHref = nextProblem?.problem?.id
    ? `/training/${trainingId}/problems/${nextProblem.problem.id}`
    : `/training/${trainingId}?tab=problems`
  const nextLetter =
    nextProblem != null
      ? LETTERS[nextProblem.orderIndex] ||
        LETTERS[training.problems.indexOf(nextProblem)] ||
        String(nextProblem.orderIndex + 1)
      : null

  return (
    <EducationalPageShell title={training.title} icon={BookOpen} width="default">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
        <Link href="/training" className="hover:text-foreground transition-colors">
          题单广场
        </Link>
        <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
        <span className="text-foreground line-clamp-1 font-medium">{training.title}</span>
      </nav>

      {/* 页头 */}
      <header className="card-static p-5 mb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {catType && CatIcon && (
                <span
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border ${catType.className}`}
                >
                  <CatIcon className="w-3 h-3" />
                  {catType.label}
                </span>
              )}
              {training.isRecommended && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border bg-primary/10 text-primary-light border-primary/20">
                  <Sparkles className="w-3 h-3" />
                  推荐
                </span>
              )}
              {training.difficulty && difficultyTag(training.difficulty)}
              {training.category && (
                <span className="tag">{training.category.name}</span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{training.title}</h1>
            {training.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {training.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md"
                  >
                    <Tag className="w-3 h-3" />
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-stretch gap-3 shrink-0">
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-center min-w-[4.5rem]">
              <div className="text-[11px] text-muted-foreground">题目</div>
              <div className="text-xl font-bold text-foreground tabular-nums">{totalProblems}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-center min-w-[4.5rem]">
              <div className="text-[11px] text-muted-foreground">收藏</div>
              <div className="text-xl font-bold text-foreground tabular-nums">
                {formatCount(training.joinCount)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-center min-w-[4.5rem]">
              <div className="text-[11px] text-muted-foreground">浏览</div>
              <div className="text-xl font-bold text-foreground tabular-nums">
                {formatCount(training.viewCount)}
              </div>
            </div>
          </div>
        </div>

        {user && progress.totalProblems > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between gap-3 mb-1.5 text-xs">
              <span className="text-muted-foreground">我的进度</span>
              <span className="font-medium text-foreground tabular-nums">
                {progress.solvedCount}/{progress.totalProblems}
                <span className="text-muted-foreground font-normal ml-1.5">
                  ({progress.progressPercentage}%)
                </span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${Math.min(100, progress.progressPercentage)}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-5 mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setTab('intro')}
            className={`text-sm font-medium pb-0.5 border-b-2 transition-colors ${
              activeTab === 'intro'
                ? 'border-primary text-primary-light'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            题单简介
          </button>
          <button
            type="button"
            onClick={() => setTab('problems')}
            className={`text-sm font-medium pb-0.5 border-b-2 transition-colors ${
              activeTab === 'problems'
                ? 'border-primary text-primary-light'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            题目列表
            <span className="ml-1 text-xs text-muted-foreground font-normal">({totalProblems})</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_17.5rem] gap-4 items-start">
        <div className="min-w-0 space-y-4">
          {activeTab === 'intro' ? (
            <>
              <section className="card-static p-5">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary-light" />
                  题单简介
                </h2>
                {training.description?.trim() ? (
                  <div className="prose-sm max-w-none text-foreground/90 leading-relaxed">
                    <MarkdownRenderer content={training.description} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">该题单暂无简介。</p>
                )}
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card-static p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <ListOrdered className="w-4 h-4 text-primary-light" />
                    结构概览
                  </h3>
                  <dl className="space-y-2.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">题目总数</dt>
                      <dd className="font-medium tabular-nums">{totalProblems}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">必做题</dt>
                      <dd className="font-medium tabular-nums text-warning">
                        {requiredCount}
                        {totalProblems > 0 && (
                          <span className="text-muted-foreground font-normal ml-1">
                            ({Math.round((requiredCount / totalProblems) * 100)}%)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">选做题</dt>
                      <dd className="font-medium tabular-nums">{totalProblems - requiredCount}</dd>
                    </div>
                    {difficultyStats.length > 0 && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">难度档位</dt>
                        <dd className="font-medium tabular-nums">{difficultyStats.length}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                <div className="card-static p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary-light" />
                    难度分布
                  </h3>
                  {difficultyStats.length === 0 ? (
                    <p className="text-sm text-muted-foreground">暂无题目</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {difficultyStats.map(([diff, count]) => (
                        <li key={diff}>
                          <div className="flex items-center justify-between text-xs mb-1 gap-2">
                            <span className="text-foreground truncate">{diff}</span>
                            <span className="text-muted-foreground tabular-nums shrink-0">
                              {count} 题
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${difficultyBarColor(diff)}`}
                              style={{
                                width: `${totalProblems ? (count / totalProblems) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              {totalProblems > 0 && (
                <div className="flex justify-end">
                  <button type="button" onClick={() => setTab('problems')} className="btn btn-ghost text-sm">
                    查看题目列表
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="card-static overflow-hidden">
              {training.problems.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>该题单暂无题目</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/80 text-muted-foreground text-xs sticky top-0">
                      <tr>
                        <th className="px-3 py-2.5 text-center font-medium w-12">题号</th>
                        <th className="px-3 py-2.5 text-left font-medium">题目</th>
                        <th className="px-3 py-2.5 text-center font-medium w-[4.5rem]">难度</th>
                        <th className="px-3 py-2.5 text-center font-medium w-28">通过率</th>
                        <th className="px-3 py-2.5 text-center font-medium w-20">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {training.problems.map((item, idx) => {
                        const isJudging =
                          judgeStatus?.problemId === item.problem?.id &&
                          ['Pending', 'Judging', 'Running'].includes(judgeStatus.status)
                        const problemId = item.problem?.id || ''
                        const accepted = item.problem?.totalAccepted || 0
                        const submit = item.problem?.totalSubmit || 0
                        const rate = submit > 0 ? (accepted / submit) * 100 : 0
                        const letter = LETTERS[item.orderIndex] || LETTERS[idx] || String(idx + 1)
                        const problemHref = `/training/${trainingId}/problems/${problemId}`
                        const pn = item.problem?.problemNumber

                        return (
                          <tr
                            key={problemId || idx}
                            className="border-t border-border hover:bg-primary/[0.04] transition-colors"
                          >
                            <td className="px-3 py-2.5 text-center font-mono font-bold text-primary-light">
                              {letter}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                {isJudging ? (
                                  <Loader2 className="w-4 h-4 text-info animate-spin shrink-0" />
                                ) : (
                                  <span className="shrink-0">
                                    {statusBadge(isJudging ? undefined : item.status)}
                                  </span>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {pn && (
                                      <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                                        {pn}
                                      </span>
                                    )}
                                    <ProblemOpenLink
                                      href={problemHref}
                                      problemTitle={item.problem?.title || '题目'}
                                      titleContext={{
                                        kind: 'training',
                                        label: letter,
                                        trainingTitle: training.title,
                                      }}
                                      className="text-foreground hover:text-primary-light font-medium line-clamp-1"
                                    >
                                      {item.problem?.title}
                                    </ProblemOpenLink>
                                    {item.required && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/20 shrink-0">
                                        必做
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {difficultyTag(item.problem?.difficulty || '')}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center gap-2 justify-center">
                                <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-1.5 rounded-full"
                                    style={{
                                      width: `${Math.min(100, rate)}%`,
                                      backgroundColor:
                                        rate >= 60
                                          ? 'var(--success)'
                                          : rate >= 30
                                            ? 'var(--warning)'
                                            : 'var(--error)',
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
                                  {rate.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs">
                              {isJudging ? (
                                <span className="text-info">评测中</span>
                              ) : item.status === 'AC' ? (
                                <span className="text-success">已通过</span>
                              ) : item.status === 'ATTEMPTED' ? (
                                <span className="text-error">尝试过</span>
                              ) : (
                                <span className="text-muted-foreground">未开始</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 侧栏 */}
        <aside className="space-y-3 lg:sticky lg:top-20">
          <div className="card-static p-4 space-y-3">
            <JoinTrainingButton
              trainingId={training.id}
              initialJoined={training.isJoined}
              isLoggedIn={!!user}
              solvedCount={progress.solvedCount}
              startHref={nextHref}
              onJoinedChange={(joined) => {
                setTraining((prev) =>
                  prev
                    ? {
                        ...prev,
                        isJoined: joined,
                        joinCount: prev.joinCount + (joined ? 1 : -1),
                      }
                    : prev
                )
              }}
              className="w-full"
            />
            {training.isJoined && nextProblem?.problem && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                下一题{' '}
                <span className="text-foreground font-medium">
                  {nextLetter}. {nextProblem.problem.title}
                </span>
              </p>
            )}
          </div>

          <div className="card-static p-4 space-y-2.5">
            <h3 className="text-sm font-semibold text-foreground mb-1">题单信息</h3>
            <InfoRow label="编号">
              <span className="font-mono text-xs">{training.id.slice(-6)}</span>
            </InfoRow>
            {training.author && (
              <InfoRow label="创建者">
                <Link
                  href={`/user/${training.author.id}`}
                  className="text-primary-light hover:underline"
                >
                  {training.author.nickname || training.author.username}
                </Link>
              </InfoRow>
            )}
            {training.difficulty && (
              <InfoRow label="难度">{difficultyTag(training.difficulty)}</InfoRow>
            )}
            {training.category && (
              <InfoRow label="分类">
                <span className="tag">{training.category.name}</span>
              </InfoRow>
            )}
            <InfoRow label="创建时间">
              <span className="text-xs">{formatDate(training.createdAt)}</span>
            </InfoRow>
            <InfoRow label="更新时间">
              <span className="text-xs">{formatDate(training.updatedAt)}</span>
            </InfoRow>
            <InfoRow
              label={
                <span className="inline-flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5" />
                  收藏
                </span>
              }
            >
              {formatCount(training.joinCount)}
            </InfoRow>
            <InfoRow
              label={
                <span className="inline-flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  浏览
                </span>
              }
            >
              {formatCount(training.viewCount)}
            </InfoRow>
          </div>

          {user && progress.totalProblems > 0 && (
            <div className="card-static p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">我的进度</span>
                <ProgressCircle
                  solved={progress.solvedCount}
                  total={progress.totalProblems}
                  size={52}
                />
              </div>
              <div className="space-y-2 text-xs">
                <ProgressStat label="已通过" value={progress.solvedCount} tone="success" />
                <ProgressStat label="尝试过" value={attemptedOnly} tone="error" />
                <ProgressStat label="未开始" value={notStarted} tone="muted" />
              </div>
            </div>
          )}
        </aside>
      </div>
    </EducationalPageShell>
  )
}

function InfoRow({
  label,
  children,
}: {
  label: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right min-w-0">{children}</span>
    </div>
  )
}

function ProgressStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'success' | 'error' | 'muted'
}) {
  const cls =
    tone === 'success'
      ? 'text-success'
      : tone === 'error'
        ? 'text-error'
        : 'text-muted-foreground'
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${cls}`}>{value}</span>
    </div>
  )
}

export default function TrainingDetailPage() {
  return (
    <Suspense fallback={<PageLoading label="加载中..." />}>
      <TrainingDetailPageContent />
    </Suspense>
  )
}
