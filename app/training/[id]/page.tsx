'use client'

/**
 * 题单详情：与作业页同构
 * - 顶栏：分类徽章+标题，进度只出现一次；Tab 为「简介 / 练习」
 * - 简介：说明 + 可点题号构成/难度；侧栏动作/进度/元信息各司其职
 * - 练习：内嵌三栏工作台，不再跳转独立题目页
 */
import { useState, useCallback, useMemo, Suspense } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { fetchWithCookie } from '@/lib/api/base'
import { isNonFinalSubmissionStatus } from '@/lib/constants/submission-status'
import { useUser } from '@/contexts/UserContext'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  BookOpen,
  Eye,
  AlertCircle,
  RefreshCw,
  Tag,
  CheckCircle2,
  Users,
  Sparkles,
  Trophy,
  ListOrdered,
  Target,
  Play,
} from 'lucide-react'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import JoinTrainingButton from '@/components/training/JoinTrainingButton'
import { ProgressCircle } from '@/components/training/ProgressCircle'
import TrainingProblemWorkspace from '@/components/training/TrainingProblemWorkspace'
import type { TrainingDetail } from '@/lib/training/types'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDate } from '@/lib/utils'
import { PageLoading, RouteSuspenseFallback } from '@/components/common'
import { PageContainer } from '@/components/layout'
import {
  EntityDescriptionCard,
  EntityDetailHeader,
  EntityInfoCard,
  EntityOverviewLayout,
} from '@/components/entity'

type Tab = 'intro' | 'problems'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const CATEGORY_TYPE_LABEL: Record<
  string,
  { label: string; className: string; icon: typeof BookOpen }
> = {
  official: {
    label: '官方题单',
    className:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    icon: BookOpen,
  },
  contest: {
    label: '竞赛/考级',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    icon: Trophy,
  },
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
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(
    () => searchParams.get('problem')
  )

  useDocumentTitle(training?.title)

  useDeferredEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'problems' || tab === 'intro') setActiveTab(tab)
    const problem = searchParams.get('problem')
    if (problem) setSelectedProblemId(problem)
  }, [searchParams])

  const replaceQuery = useCallback(
    (tab: Tab, problemId?: string | null) => {
      const qs = new URLSearchParams()
      if (tab === 'problems') qs.set('tab', 'problems')
      if (tab === 'problems' && problemId) qs.set('problem', problemId)
      const q = qs.toString()
      router.replace(`/training/${trainingId}${q ? `?${q}` : ''}`, { scroll: false })
    },
    [router, trainingId]
  )

  const setTab = useCallback(
    (tab: Tab) => {
      setActiveTab(tab)
      replaceQuery(tab, tab === 'problems' ? selectedProblemId : null)
    },
    [replaceQuery, selectedProblemId]
  )

  const startPractice = useCallback(
    (problemId?: string | null) => {
      setActiveTab('problems')
      if (problemId) setSelectedProblemId(problemId)
      replaceQuery('problems', problemId || selectedProblemId)
    },
    [replaceQuery, selectedProblemId]
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

  useDeferredEffect(() => {
    void fetchDetail()
  }, [fetchDetail])

  useSubmissionSocket({
    userId: user?.id || '',
    enabled: !!user,
    onConnected: () => {
      void fetchDetail(false)
    },
    onSubmissionUpdate: (data) => {
      if (!data?.id) return
      if (data.status && isNonFinalSubmissionStatus(data.status)) return
      void fetchDetail(false)
    },
  })

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
    if (attempted) return attempted
    const notStarted = training.problems.find(
      (p) => !p.status || p.status === 'NOT_STARTED'
    )
    return notStarted || training.problems[0]
  }, [training])

  if (loading) return <PageLoading />

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium mb-4">题单不存在或无权访问</p>
          <Link href="/training" className="btn btn-primary btn-sm">
            返回题单广场
          </Link>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-error mx-auto mb-3" />
          <p className="text-foreground mb-4">{error}</p>
          <button type="button" onClick={() => void fetchDetail()} className="btn btn-primary btn-sm">
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
  const nextLetter =
    nextProblem != null
      ? LETTERS[nextProblem.orderIndex] ||
        LETTERS[training.problems.indexOf(nextProblem)] ||
        String(nextProblem.orderIndex + 1)
      : null
  const nextProblemId = nextProblem?.problem?.id || null

  const viewTabs = [
    { key: 'intro' as const, label: '简介', icon: BookOpen },
    { key: 'problems' as const, label: '练习', icon: Play },
  ]

  const aboutItems = [
    ...(training.author
      ? [
          {
            label: '创建者',
            value: (
              <Link
                href={`/user/${training.author.id}`}
                className="text-primary-light hover:underline"
              >
                {training.author.nickname || training.author.username}
              </Link>
            ),
          },
        ]
      : []),
    ...(training.difficulty
      ? [{ label: '建议难度', value: difficultyTag(training.difficulty) }]
      : []),
    ...(training.category
      ? [
          {
            label: '分类',
            value: <span className="tag">{training.category.name}</span>,
          },
        ]
      : []),
    { label: '加入', icon: Users, value: formatCount(training.joinCount) },
    { label: '浏览', icon: Eye, value: formatCount(training.viewCount) },
    { label: '更新', value: <span className="text-xs font-normal">{formatDate(training.updatedAt)}</span> },
  ]

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-6">
      <PageContainer variant="workspace" className="py-4">
        <EntityDetailHeader
          layoutId="training-view-tab-indicator"
          titleLeading={
            <>
              {catType && CatIcon && (
                <span
                  className={`shrink-0 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${catType.className}`}
                >
                  <CatIcon className="w-3 h-3" />
                  {catType.label}
                </span>
              )}
              {training.isRecommended && (
                <Sparkles className="w-3.5 h-3.5 text-warning shrink-0" aria-label="推荐" />
              )}
            </>
          }
          title={training.title}
          meta={
            user && progress.totalProblems > 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-secondary-light" />
                <span className="tabular-nums font-medium text-foreground">
                  {progress.solvedCount}/{progress.totalProblems}
                </span>
                <span className="text-muted-foreground/80">已通过</span>
                {activeTab === 'intro' && (
                  <div className="hidden sm:block w-20 h-1.5 rounded-full bg-muted overflow-hidden ml-1">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{ width: `${Math.min(100, progress.progressPercentage)}%` }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                共 {totalProblems} 题
              </span>
            )
          }
          tabs={viewTabs}
          activeKey={activeTab}
          onSelect={(key) => setTab(key as Tab)}
        />

        {activeTab === 'intro' ? (
          <EntityOverviewLayout
            main={
              <>
                <EntityDescriptionCard
                  title="题单说明"
                  content={training.description}
                  emptyTitle="暂无题单说明"
                  emptyHint="作者尚未填写说明与参考信息"
                  footer={
                    training.tags?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-border">
                        {training.tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded"
                          >
                            <Tag className="w-3 h-3" />
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : undefined
                  }
                />

                <section className="card-static p-5 rounded-xl space-y-5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <ListOrdered className="w-4 h-4 text-primary-light" />
                      题目构成
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      必做 {requiredCount} · 选做 {totalProblems - requiredCount}
                    </p>
                  </div>

                  {totalProblems > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {training.problems.map((item, idx) => {
                        const id = item.problem?.id
                        if (!id) return null
                        const letter =
                          LETTERS[item.orderIndex] || LETTERS[idx] || String(idx + 1)
                        const st = item.status
                        return (
                          <button
                            key={id}
                            type="button"
                            title={item.problem?.title}
                            onClick={() => startPractice(id)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                              st === 'AC'
                                ? 'border-secondary/30 bg-secondary/10 text-secondary'
                                : st === 'ATTEMPTED' || st === 'WRONG'
                                  ? 'border-warning/30 bg-warning/10 text-warning'
                                  : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                            }`}
                          >
                            <span className="font-mono font-bold">{letter}</span>
                            {item.required && (
                              <span className="text-[10px] opacity-80">必做</span>
                            )}
                            {item.problem?.difficulty && (
                              <span className="text-[10px] opacity-70">
                                {item.problem.difficulty}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {difficultyStats.length > 0 && (
                    <div className="pt-4 border-t border-border space-y-2.5">
                      <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5" />
                        难度分布
                      </h3>
                      <ul className="space-y-2">
                        {difficultyStats.map(([diff, count]) => (
                          <li key={diff}>
                            <div className="flex items-center justify-between text-xs mb-1 gap-2">
                              <span className="text-foreground truncate">{diff}</span>
                              <span className="text-muted-foreground tabular-nums shrink-0">
                                {count}
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
                    </div>
                  )}
                </section>
              </>
            }
            aside={
              <>
                <div className="card-static p-4 space-y-3 rounded-xl">
                  <JoinTrainingButton
                    trainingId={training.id}
                    initialJoined={training.isJoined}
                    isLoggedIn={!!user}
                    solvedCount={progress.solvedCount}
                    onStart={() => startPractice(nextProblemId)}
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
                      <button
                        type="button"
                        onClick={() => startPractice(nextProblemId)}
                        className="text-foreground font-medium hover:text-primary-light"
                      >
                        {nextLetter}. {nextProblem.problem.title}
                      </button>
                    </p>
                  )}
                </div>

                {user && progress.totalProblems > 0 && (
                  <div className="card-static p-4 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-foreground">学习进度</span>
                      <ProgressCircle
                        solved={progress.solvedCount}
                        total={progress.totalProblems}
                        size={52}
                      />
                    </div>
                    <div className="space-y-2 text-xs">
                      <ProgressStat label="已通过" value={progress.solvedCount} tone="success" />
                      <ProgressStat label="已尝试" value={attemptedOnly} tone="error" />
                      <ProgressStat label="未开始" value={notStarted} tone="muted" />
                    </div>
                  </div>
                )}

                <EntityInfoCard title="关于本题单" items={aboutItems} />
              </>
            }
          />
        ) : (
          <TrainingProblemWorkspace
            trainingId={trainingId}
            trainingTitle={training.title}
            problems={training.problems}
            initialProblemId={selectedProblemId || nextProblemId}
            onProblemChange={(id) => {
              setSelectedProblemId(id)
              replaceQuery('problems', id)
            }}
            onProgressRefresh={() => void fetchDetail(false)}
          />
        )}
      </PageContainer>
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
    <Suspense fallback={<RouteSuspenseFallback label="加载中..." />}>
      <TrainingDetailPageContent />
    </Suspense>
  )
}
