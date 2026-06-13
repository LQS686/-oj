'use client'

/**
 * app/training/page.tsx
 * 题单列表页
 *
 * 设计要点：
 * 1. 3 大来源分类卡片（官方题单 / 竞赛考级真题 / 我的题单）
 * 2. 卡片网格：编号+标题+作者+收藏+进度环
 * 3. 用户可创建自己的题单（"我的"分类）
 * 4. 防御性：API 字段错位时降级为空
 * 5. fetch：cache: 'no-store'
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { BookOpen, AlertCircle, RefreshCw, Plus, UserCheck } from 'lucide-react'
import TrainingCard from '@/components/training/TrainingCard'
import SourceFilterCards, { type TrainingSource } from '@/components/training/SourceFilterCards'
import type { TrainingListItem } from '@/lib/training/types'

export default function TrainingListPage() {
  const [trainings, setTrainings] = useState<TrainingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [source, setSource] = useState<TrainingSource>('all')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const fetchTrainings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({
        page: String(page),
        limit: '18',
      })
      // 后端过滤：official 用 isRecommended；contest 用 categoryType
      if (source === 'official') {
        params.set('recommended', 'true')
      } else if (source === 'contest') {
        params.set('categoryType', 'contest')
      }

      const res = await fetch(`/api/trainings?${params.toString()}`, {
        cache: 'no-store',
        headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' },
      })
      const data = await res.json()
      if (data.success) {
        let items: TrainingListItem[] = Array.isArray(data.data?.items) ? data.data.items : []

        // 来源筛选：客户端再过滤一次（确保精准）
        if (source === 'contest') {
          // 1) 优先按 categoryType === 'contest' 匹配（admin 创建时打标）
          // 2) 兼容老题单：tag/title 包含竞赛/考级/CSP/NOIP 等关键词
          const contestKeywords = ['竞赛', '考级', '真题', 'CSP', 'NOIP', 'NOI', 'ICPC', 'GESP', '省选']
          items = items.filter(t => {
            if (t.categoryType === 'contest') return true
            const haystack = [
              ...(t.tags || []),
              t.title,
              t.category?.name || '',
            ].join(' ').toLowerCase()
            return contestKeywords.some(k => haystack.includes(k.toLowerCase()))
          })
        } else if (source === 'mine') {
          // 我的题单：已加入 + 自己创建的
          items = items.filter(t =>
            t.userProgress?.isJoined || t.author?.id === currentUserId
          )
        } else if (source === 'official') {
          // 官方题单：categoryType === 'official' 或 isRecommended（兼容老数据）
          items = items.filter(t => t.categoryType === 'official' || t.isRecommended)
        }

        // 添加编号（基于倒序，1-based）
        items = items.map((item, idx) => ({ ...item, number: (page - 1) * 18 + idx + 1 } as any))
        setTrainings(items)
        setTotal(typeof data.data?.total === 'number' ? data.data.total : 0)
        setTotalPages(typeof data.data?.totalPages === 'number' ? data.data.totalPages : 1)
      } else {
        setError(data.error || '获取题单失败')
        setTrainings([])
        setTotal(0)
        setTotalPages(1)
      }
    } catch (e) {
      setError('网络错误')
      setTrainings([])
    } finally {
      setLoading(false)
    }
  }, [page, source, currentUserId])

  // 拉取当前用户
  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.success && data.data) {
          setIsLoggedIn(true)
          setCurrentUserId(data.data.id)
        } else {
          setIsLoggedIn(false)
          setCurrentUserId(null)
        }
      })
      .catch(() => {
        setIsLoggedIn(false)
        setCurrentUserId(null)
      })
  }, [])

  useEffect(() => { fetchTrainings() }, [fetchTrainings])

  const handleSourceChange = (s: TrainingSource) => {
    setSource(s)
    setPage(1)
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        {/* 大标题 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">训练题单</h1>
              <p className="text-muted-foreground text-sm mt-0.5">分组学习，循序渐进</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex glass px-4 py-2 rounded-xl border border-primary/20">
              <span className="text-primary-light font-bold">{total}</span>
              <span className="text-muted-foreground ml-1.5 text-sm">个题单</span>
            </div>
            {isLoggedIn && (
              <Link
                href="/training/create"
                className="btn-primary btn"
                title="创建我自己的题单"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">创建题单</span>
              </Link>
            )}
          </div>
        </div>

        {/* 3 大来源分类卡片 */}
        <SourceFilterCards
          active={source === 'all' ? 'official' : source}
          onChange={handleSourceChange}
          isLoggedIn={isLoggedIn}
        />

        {/* 列表 */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="relative w-12 h-12 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
              <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            </div>
            <p className="text-muted-foreground">加载中...</p>
          </div>
        ) : error ? (
          <div className="card-static rounded-2xl p-12 text-center max-w-md mx-auto">
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
        ) : trainings.length === 0 ? (
          <div className="card-static rounded-2xl p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
              {source === 'mine' ? <UserCheck className="w-8 h-8 text-muted-foreground" /> : <BookOpen className="w-8 h-8 text-muted-foreground" />}
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">
              {source === 'mine' ? '还没有我的题单' : '暂无题单'}
            </div>
            <div className="text-muted-foreground mb-4">
              {source === 'mine'
                ? isLoggedIn ? '去"官方题单"或"竞赛真题"逛逛，加入感兴趣的题单；或自己创建一个' : '登录后即可查看'
                : '当前分类下还没有题单'}
            </div>
            {isLoggedIn && source === 'mine' && (
              <Link href="/training/create" className="btn-primary btn">
                <Plus className="w-4 h-4" />
                创建我的第一个题单
              </Link>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {trainings.map(t => (
              <TrainingCard key={t.id} training={t} />
            ))}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-6">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="btn-ghost btn"
            >
              上一页
            </button>
            <span className="text-sm text-muted-foreground px-3">
              第 {page} / {totalPages} 页
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="btn-ghost btn"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
