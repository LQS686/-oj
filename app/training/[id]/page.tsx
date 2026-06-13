'use client'

/**
 * app/training/[id]/page.tsx
 * 题单详情页（洛谷风格）
 *
 * 设计要点：
 * 1. 面包屑：题单广场 / 标题
 * 2. Tab 切换：题单简介 / 题目列表
 * 3. 右侧侧栏：操作按钮 + 信息卡 + 进度
 * 4. 题目表格：题号、题目名称、难度、通过率、状态
 * 5. 实时更新：WebSocket + 3s 兜底轮询
 * 6. 草稿 404 友好处理
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  BookOpen, Users, Eye, Calendar, User as UserIcon,
  AlertCircle, RefreshCw, Sparkles, Tag, CheckCircle2,
  Circle, AlertOctagon, Heart, ChevronRight, Loader2
} from 'lucide-react'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import JoinTrainingButton from '@/components/training/JoinTrainingButton'
import { ProgressCircle } from '@/components/training/ProgressCircle'
import type { TrainingDetail, TrainingProblemStatus } from '@/lib/training/types'

interface User {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
}

type Tab = 'intro' | 'problems'

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
  const cls = diff.includes('入门') ? 'bg-success/15 text-success border-success/20'
    : diff.includes('普及') ? 'bg-warning/15 text-warning border-warning/20'
    : diff.includes('提高') || diff.includes('省选') || diff.includes('NOI') ? 'bg-error/15 text-error border-error/20'
    : 'bg-primary/15 text-primary-light border-primary/20'
  return <span className={`text-xs px-1.5 py-0.5 rounded border ${cls}`}>{diff}</span>
}

function formatCount(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

export default function TrainingDetailPage() {
  const params = useParams<{ id: string }>()
  const trainingId = params?.id ?? ''

  const [training, setTraining] = useState<TrainingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('intro')
  const [judgeStatus, setJudgeStatus] = useState<{ problemId: string; status: string } | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const fetchDetail = useCallback(async (showLoading = true) => {
    if (!trainingId) return
    try {
      if (showLoading) setLoading(true)
      const res = await fetch(`/api/trainings/${trainingId}`, {
        cache: 'no-store',
        headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' },
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
    } catch (e) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [trainingId])

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.success && data.data) setUser(data.data as User)
        else setUser(null)
      })
      .catch(() => setUser(null))
  }, [])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  // WebSocket 实时更新：终态事件触发刷新
  useSubmissionSocket({
    userId: user?.id || '',
    enabled: !!user,
    onSubmissionUpdate: (data) => {
      if (!data?.id) return
      if (data.status && ['Pending', 'Judging', 'Running'].includes(data.status)) {
        setJudgeStatus({ problemId: data.problemId || '', status: data.status })
        return
      }
      // 终态：拉一次详情（兜底）
      setJudgeStatus(null)
      void fetchDetail(false)
    },
  })

  // 兜底轮询：有评测中题目时每 3s 拉一次
  useEffect(() => {
    if (judgeStatus !== null) {
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = setInterval(() => {
        fetchDetail(false)
      }, 3000)
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [judgeStatus, fetchDetail])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载中...</p>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card-static rounded-2xl p-12 text-center max-w-md">
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
        <div className="card-static rounded-2xl p-12 text-center max-w-md">
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
  const progressPercent = progress.progressPercentage
  const totalProblems = training.problems.length

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-6">
        {/* 面包屑（洛谷风格） */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/training" className="hover:text-foreground">
            题单广场
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground line-clamp-1">{training.title}</span>
        </div>

        {/* 标题 + Tabs + 右上角元信息（洛谷风格） */}
        <div className="card-static p-6 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            {training.title}
          </h1>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            {/* Tabs */}
            <div className="flex items-center gap-6 border-b border-border md:border-b-0">
              <button
                onClick={() => setActiveTab('intro')}
                className={`pb-2 md:pb-0 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'intro'
                    ? 'border-primary text-primary-light'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                题单简介
              </button>
              <button
                onClick={() => setActiveTab('problems')}
                className={`pb-2 md:pb-0 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'problems'
                    ? 'border-primary text-primary-light'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                题目列表
              </button>
            </div>
            {/* 右上角：题数 + 收藏人数 */}
            <div className="flex items-center gap-6 text-right">
              <div>
                <div className="text-xs text-muted-foreground">题数</div>
                <div className="text-lg font-semibold text-foreground">{totalProblems}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">收藏人数</div>
                <div className="text-lg font-semibold text-foreground">{formatCount(training.joinCount)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* 主内容区 */}
          <div>
            {activeTab === 'intro' ? (
              /* 简介 Tab */
              <div className="space-y-6">
                <div className="card-static p-6">
                  <h2 className="text-lg font-bold text-foreground mb-3">题单简介</h2>
                  {training.description ? (
                    <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-wrap">
                      {training.description}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">该题单暂无简介</p>
                  )}
                </div>

                {/* 标签 */}
                {training.tags && training.tags.length > 0 && (
                  <div className="card-static p-6">
                    <h2 className="text-lg font-bold text-foreground mb-3">标签</h2>
                    <div className="flex flex-wrap gap-2">
                      {training.tags.map(t => (
                        <span key={t} className="tag tag-primary">
                          <Tag className="w-3 h-3" />
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* 题目列表 Tab */
              <div className="card-static p-0 overflow-hidden">
                {training.problems.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>该题单暂无题目</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/20 text-muted-foreground text-xs">
                        <tr>
                          <th className="px-4 py-3 text-center font-medium w-16">题号</th>
                          <th className="px-4 py-3 text-left font-medium">题目名称</th>
                          <th className="px-4 py-3 text-center font-medium w-20">难度</th>
                          <th className="px-4 py-3 text-center font-medium w-32">通过率</th>
                          <th className="px-4 py-3 text-center font-medium w-24">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {training.problems.map(item => {
                          const isJudging = judgeStatus?.problemId === item.problem?.id
                            && ['Pending', 'Judging', 'Running'].includes(judgeStatus.status)
                          const problemId = item.problem?.id || ''
                          const accepted = (item.problem as any)?.totalAccepted || 0
                          const submit = (item.problem as any)?.totalSubmit || 0
                          const rate = submit > 0 ? (accepted / submit) * 100 : 0
                          return (
                            <tr
                              key={problemId}
                              className="border-t border-border hover:bg-primary/5 cursor-pointer"
                              onClick={() => window.location.href = `/problem/${problemId}?from=training&trainingId=${trainingId}`}
                            >
                              <td className="px-4 py-3 text-center font-mono text-muted-foreground text-xs">
                                {(item.problem as any)?.problemNumber || item.orderIndex + 1}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {isJudging ? (
                                    <Loader2 className="w-4 h-4 text-info animate-spin flex-shrink-0" />
                                  ) : (
                                    <span className="flex-shrink-0">
                                      {statusBadge(isJudging ? undefined : item.status)}
                                    </span>
                                  )}
                                  <Link
                                    href={`/problem/${problemId}?from=training&trainingId=${trainingId}`}
                                    className="text-primary-light hover:underline line-clamp-1"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {item.problem?.title}
                                  </Link>
                                  {item.required && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/20 flex-shrink-0">
                                      必做
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {difficultyTag(item.problem?.difficulty || '')}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center gap-2 justify-center">
                                  <div className="w-16 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                                    <div
                                      className="h-1.5 rounded-full"
                                      style={{
                                        width: `${Math.min(100, rate)}%`,
                                        backgroundColor: rate >= 60 ? 'var(--success)' : rate >= 30 ? 'var(--warning)' : 'var(--error)',
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground w-10 text-right">
                                    {rate.toFixed(0)}%
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-xs">
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

          {/* 右侧侧栏（洛谷风格） */}
          <div className="space-y-4">
            {/* 操作按钮 */}
            <div className="card-static p-4">
              <div className="flex items-center gap-2">
                <JoinTrainingButton
                  trainingId={training.id}
                  initialJoined={training.isJoined}
                  isLoggedIn={!!user}
                  solvedCount={progress.solvedCount}
                  onJoinedChange={(joined) => {
                    setTraining(prev => prev ? { ...prev, isJoined: joined, joinCount: prev.joinCount + (joined ? 1 : -1) } : prev)
                  }}
                  className="flex-1"
                />
              </div>
            </div>

            {/* 信息卡（洛谷风格） */}
            <div className="card-static p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">题单编号</span>
                <span className="font-mono text-foreground">{training.id.slice(-6)}</span>
              </div>
              {training.author && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">创建者</span>
                  <Link
                    href={`/user/${training.author.id}`}
                    className="text-primary-light hover:underline flex items-center gap-1"
                  >
                    {training.author.nickname || training.author.username}
                  </Link>
                </div>
              )}
              {training.difficulty && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">难度</span>
                  {difficultyTag(training.difficulty)}
                </div>
              )}
              {training.category && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">分类</span>
                  <span className="tag tag-primary">{training.category.name}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">创建时间</span>
                <span className="text-foreground text-xs">
                  {new Date(training.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5" />
                  收藏
                </span>
                <span className="text-foreground">{formatCount(training.joinCount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" />
                  浏览
                </span>
                <span className="text-foreground">{formatCount(training.viewCount)}</span>
              </div>
            </div>

            {/* 我的进度卡（洛谷风格） */}
            {user && progress.totalProblems > 0 && (
              <div className="card-static p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-foreground">我的进度</span>
                  <ProgressCircle solved={progress.solvedCount} total={progress.totalProblems} size={56} />
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">已通过</span>
                    <span className="font-semibold text-success">{progress.solvedCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">尝试过</span>
                    <span className="font-semibold text-error">
                      {progress.attemptedCount - progress.solvedCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">未开始</span>
                    <span className="font-semibold text-muted-foreground">
                      {progress.totalProblems - progress.attemptedCount}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
