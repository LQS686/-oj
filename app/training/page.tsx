'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { BookOpen, Target, Clock, CheckCircle, GraduationCap, ArrowRight, RefreshCw, AlertCircle, Play, Loader2 } from 'lucide-react'

interface Training {
  id: string
  title: string
  description: string
  difficulty: string
  problemCount: number
  completedCount?: number
  estimatedTime: string
  tags: string[]
  createdAt: string
  updatedAt: string
  userProgress?: {
    solvedCount: number
    attemptedCount: number
    progressPercentage: number
    isJoined: boolean
  }
}

export default function TrainingPage() {
  const [trainings, setTrainings] = useState<Training[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  useEffect(() => {
    fetchTrainings()
  }, [page])

  const fetchTrainings = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/trainings?page=${page}&limit=10`, {
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      })
      const data = await response.json()

      if (data.success) {
        const items = Array.isArray(data.data?.items) ? data.data.items : []
        const trainingsWithProgress = items.map((t: Training) => ({
          ...t,
          completedCount: t.userProgress?.solvedCount || 0,
          estimatedTime: t.estimatedTime || '2周',
          tags: t.tags || [],
        }))
        setTrainings(trainingsWithProgress)
        setTotalPages(data.data?.pagination?.totalPages || Math.ceil((data.data?.pagination?.total || 0) / 10) || 1)
      } else {
        setError(data.error || '获取训练计划失败')
        setTrainings([])
        setTotalPages(1)
      }
    } catch (err) {
      console.error('获取训练计划失败:', err)
      setError('网络错误，获取训练计划失败')
      setTrainings([])
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }

  const handleJoinTraining = async (trainingId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    try {
      setJoiningId(trainingId)
      
      const response = await fetch(`/api/trainings/${trainingId}/progress`, {
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      })
      const data = await response.json()

      if (data.success) {
        setTrainings(prev => prev.map(t => {
          if (t.id === trainingId) {
            return {
              ...t,
              userProgress: {
                solvedCount: data.data.progress.solvedCount,
                attemptedCount: data.data.progress.attemptedCount,
                progressPercentage: data.data.progress.progressPercentage,
                isJoined: true
              },
              completedCount: data.data.progress.solvedCount
            }
          }
          return t
        }))
      }
    } catch (err) {
      console.error('加入训练计划失败:', err)
    } finally {
      setJoiningId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载训练计划中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card-static rounded-2xl p-12 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <div className="text-foreground text-xl font-semibold mb-2">加载失败</div>
          <p className="text-muted-foreground mb-6">{error}</p>
          <button onClick={fetchTrainings} className="btn-primary btn">
            <RefreshCw className="w-4 h-4" />
            重试
          </button>
        </div>
      </div>
    )
  }

  const totalTrainings = trainings.length
  const totalProblems = trainings.reduce((sum, t) => sum + t.problemCount, 0)
  const totalCompleted = trainings.reduce((sum, t) => sum + (t.completedCount || 0), 0)
  const totalRemaining = totalProblems - totalCompleted
  const estimatedWeeks = trainings.reduce((sum, t) => {
    const weeks = parseInt(t.estimatedTime)
    return sum + (isNaN(weeks) ? 0 : weeks)
  }, 0)

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">训练计划</h1>
              <p className="text-muted-foreground text-sm mt-0.5">系统化学习，稳步提升</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="glass px-4 py-2 rounded-xl border border-primary/20">
              <span className="text-primary-light font-bold">{totalTrainings}</span>
              <span className="text-muted-foreground ml-1.5 text-sm">个计划</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card-static rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary-light" />
              </div>
              <div>
                <div className="text-xl font-bold text-foreground">{totalTrainings}</div>
                <div className="text-xs text-muted-foreground">训练计划</div>
              </div>
            </div>
          </div>
          <div className="card-static rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary/15 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-secondary-light" />
              </div>
              <div>
                <div className="text-xl font-bold text-foreground">{totalCompleted}</div>
                <div className="text-xs text-muted-foreground">已完成题目</div>
              </div>
            </div>
          </div>
          <div className="card-static rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
                <Target className="w-5 h-5 text-accent-light" />
              </div>
              <div>
                <div className="text-xl font-bold text-foreground">{totalRemaining}</div>
                <div className="text-xs text-muted-foreground">剩余题目</div>
              </div>
            </div>
          </div>
          <div className="card-static rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-info/15 flex items-center justify-center">
                <Clock className="w-5 h-5 text-info" />
              </div>
              <div>
                <div className="text-xl font-bold text-foreground">{estimatedWeeks}</div>
                <div className="text-xs text-muted-foreground">预计周数</div>
              </div>
            </div>
          </div>
        </div>

        {trainings.length === 0 ? (
          <div className="card-static rounded-2xl p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">暂无训练计划</div>
            <div className="text-muted-foreground mb-6">系统中还没有训练计划</div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-5 mb-10">
            {trainings.map((training) => {
              const progress = ((training.completedCount || 0) / training.problemCount) * 100

              return (
                <Link
                  key={training.id}
                  href={`/training/${training.id}`}
                  className="card p-6 group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-foreground group-hover:text-primary-light transition-colors mb-2">
                        {training.title}
                      </h3>
                      <p className="text-muted-foreground text-sm line-clamp-2">
                        {training.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {training.tags.map((tag) => (
                      <span key={tag} className="tag tag-primary">
                        {tag}
                      </span>
                    ))}
                    <span className={`tag ${training.difficulty.includes('入门') ? 'tag-success' : training.difficulty.includes('提高') ? 'tag-error' : 'tag-warning'}`}>
                      {training.difficulty}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">进度</span>
                      <span className="font-semibold text-foreground">
                        {training.completedCount || 0} / {training.problemCount}
                      </span>
                    </div>
                    <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full transition-all bg-gradient-to-r from-primary to-secondary"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Target className="w-4 h-4" />
                        {training.problemCount} 题
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {training.estimatedTime}
                      </span>
                    </div>

                    {training.userProgress?.isJoined ? (
                      <div className="flex items-center gap-1.5 text-primary-light font-medium text-sm group-hover:gap-2.5 transition-all">
                        {(training.completedCount || 0) > 0 ? '继续学习' : '开始学习'}
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    ) : joiningId === training.id ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        加入中...
                      </div>
                    ) : (
                      <button
                        onClick={(e) => handleJoinTraining(training.id, e)}
                        className="flex items-center gap-1.5 text-secondary-light font-medium text-sm hover:text-secondary transition-colors"
                      >
                        <Play className="w-4 h-4" />
                        参与
                      </button>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2 glass-strong rounded-xl p-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="btn-ghost btn px-3 py-2"
              >
                上一页
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + 1
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-10 h-10 rounded-lg font-semibold transition-all ${
                        page === pageNum
                          ? 'bg-primary text-white shadow-lg shadow-primary/30'
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
                      className={`w-10 h-10 rounded-lg font-semibold transition-all ${
                        page === totalPages
                          ? 'bg-primary text-white shadow-lg shadow-primary/30'
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
                className="btn-ghost btn px-3 py-2"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
