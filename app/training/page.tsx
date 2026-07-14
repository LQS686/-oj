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
import { useEffect, useState, useCallback, useRef } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import Link from 'next/link'
import { BookOpen, AlertCircle, RefreshCw, Plus, UserCheck } from 'lucide-react'
import TrainingCard from '@/components/training/TrainingCard'
import SourceFilterCards, { type TrainingSource } from '@/components/training/SourceFilterCards'
import type { TrainingListItem } from '@/lib/training/types'
import { canManageContent } from '@/lib/permissions'
import { EducationalPageShell, LIST_GRID_CLASS } from '@/components/common'

const SOURCE_LABELS: Record<TrainingSource, string> = {
  all: '全部题单',
  official: '官方题单',
  contest: '竞赛/考级真题',
  mine: '我的题单',
}

export default function TrainingListPage() {
  const [trainings, setTrainings] = useState<TrainingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [source, setSource] = useState<TrainingSource>('official')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const currentUserIdRef = useRef<string | null>(null)
  const isFirstLoad = useRef(true)

  const fetchTrainings = useCallback(async (signal?: AbortSignal) => {
    try {
      if (isFirstLoad.current) {
        setLoading(true)
      }
      // stale-while-revalidate: keep old data visible during re-fetch
      setError(null)
      const params = new URLSearchParams({
        page: String(page),
        limit: '24',
      })
      if (source === 'official') {
        params.set('categoryType', 'official')
      } else if (source === 'contest') {
        params.set('categoryType', 'contest')
      }

      const res = await fetchWithCookie(`/api/trainings?${params.toString()}`, {
        cache: 'no-store',
        signal,
        headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' },
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || '获取题单失败')
        setTrainings([])
        setTotal(0)
        setTotalPages(1)
        return
      }
      let items: TrainingListItem[] = Array.isArray(data.data?.items) ? data.data.items : []

      if (source === 'mine') {
        items = items.filter(t =>
          t.userProgress?.isJoined || t.author?.id === currentUserIdRef.current
        )
      }

      items = items.map((item, idx) => ({ ...item, number: (page - 1) * 24 + idx + 1 } as any))
      setTrainings(items)
      setTotal(typeof data.data?.total === 'number' ? data.data.total : 0)
      setTotalPages(typeof data.data?.totalPages === 'number' ? data.data.totalPages : 1)
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      setError('网络错误')
      setTrainings([])
    } finally {
      isFirstLoad.current = false
      setLoading(false)
    }
  }, [page, source])

  // 拉取当前用户
  useEffect(() => {
    fetchWithCookie('/api/auth/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.success && data.data) {
          setIsLoggedIn(true)
          currentUserIdRef.current = data.data.id
          setCurrentUserRole(data.data.role ?? null)
        } else {
          setIsLoggedIn(false)
          currentUserIdRef.current = null
          setCurrentUserRole(null)
        }
      })
      .catch(() => {
        setIsLoggedIn(false)
        currentUserIdRef.current = null
        setCurrentUserRole(null)
      })
  }, [])

  // 切换 source/page 时拉取，AbortController 取消旧请求
  useEffect(() => {
    const ac = new AbortController()
    fetchTrainings(ac.signal)
    return () => ac.abort()
  }, [fetchTrainings])

  const handleSourceChange = (s: TrainingSource) => {
    setSource(s)
    setPage(1)
  }

  const canCreateTraining = canManageContent({ role: currentUserRole })

  return (
    <EducationalPageShell
      title="训练题单"
      description={`分组学习，循序渐进 · 共 ${total} 个题单`}
      icon={BookOpen}
      actions={
        isLoggedIn && canCreateTraining ? (
          <Link href="/training/create" className="btn-primary btn" title="创建我自己的题单">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">创建题单</span>
          </Link>
        ) : undefined
      }
      toolbar={
        <SourceFilterCards active={source} onChange={handleSourceChange} isLoggedIn={isLoggedIn} />
      }
    >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              {SOURCE_LABELS[source] ?? '题单列表'}
            </h2>
            <span className="text-xs text-muted-foreground">
              共 <span className="text-primary-light font-semibold">{total}</span> 个题单
            </span>
          </div>
          {source !== 'mine' && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              点击题单查看详情
            </span>
          )}
        </div>

        {/* 列表 */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card rounded-lg p-5 border border-border animate-pulse">
                <div className="h-4 w-3/4 rounded bg-muted mb-3" />
                <div className="h-3 w-1/2 rounded bg-muted mb-2" />
                <div className="h-3 w-1/3 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card-static rounded-lg p-12 text-center max-w-md mx-auto animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-error" />
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">加载失败</div>
            <p className="text-muted-foreground mb-6">{error}</p>
            <button onClick={() => fetchTrainings()} className="btn-primary btn">
              <RefreshCw className="w-4 h-4" />
              重试
            </button>
          </div>
        ) : trainings.length === 0 ? (
          <div className="card-static rounded-lg p-16 text-center animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
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
          <div className={`${LIST_GRID_CLASS} animate-fadeIn`}>
            {trainings.map((t) => (
              <TrainingCard key={t.id} training={t} variant="grid" />
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
    </EducationalPageShell>
  )
}
