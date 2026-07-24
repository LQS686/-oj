'use client'

/**
 * app/training/page.tsx
 * 题单列表页
 *
 * 设计要点：
 * 1. 3 大来源分类卡片（官方题单 / 竞赛考级真题 / 我的收藏）
 * 2. 卡片网格：编号+标题+作者+收藏+进度环
 * 3. 题单只能由管理员通过后台管理页面创建
 * 4. "我的收藏"分类通过 API joined=true 过滤，仅显示当前用户已加入的题单
 * 5. 防御性：API 字段错位时降级为空
 * 6. fetch：cache: 'no-store'
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import { useUser } from '@/contexts/UserContext'
import { BookOpen, AlertCircle, RefreshCw, Bookmark, ChevronLeft, ChevronRight } from 'lucide-react'
import TrainingCard from '@/components/training/TrainingCard'
import SourceFilterCards, { type TrainingSource } from '@/components/training/SourceFilterCards'
import type { TrainingListItem } from '@/lib/training/types'
import { EducationalPageShell, LIST_GRID_CLASS, LIST_GRID_SKELETON_CLASS, ListEmptyState } from '@/components/common'

const SOURCE_LABELS: Record<TrainingSource, string> = {
  all: '全部题单',
  official: '官方题单',
  contest: '竞赛/考级真题',
  mine: '我的收藏',
}

export default function TrainingListPage() {
  const { user } = useUser()
  const [trainings, setTrainings] = useState<TrainingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [source, setSource] = useState<TrainingSource>('official')
  const isLoggedIn = !!user
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
      } else if (source === 'mine') {
        // 仅返回当前用户已加入（收藏）的题单
        params.set('joined', 'true')
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
      const items: TrainingListItem[] = Array.isArray(data.data?.items) ? data.data.items : []

      const numberedItems = items.map((item, idx) => ({ ...item, number: (page - 1) * 24 + idx + 1 } as any))
      setTrainings(numberedItems)
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

  return (
    <EducationalPageShell
      title="训练题单"
      icon={BookOpen}
      toolbar={
        <SourceFilterCards
          active={source}
          onChange={handleSourceChange}
          isLoggedIn={isLoggedIn}
        />
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
          <div className={LIST_GRID_SKELETON_CLASS}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card rounded-lg p-4 border border-border animate-pulse h-[9.5rem]">
                <div className="h-4 w-3/4 rounded bg-muted mb-3" />
                <div className="h-3 w-1/2 rounded bg-muted mb-2" />
                <div className="h-3 w-1/3 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ListEmptyState
            icon={AlertCircle}
            tone="error"
            title="加载失败"
            description={error}
            action={
              <button onClick={() => fetchTrainings()} className="btn-primary btn btn-sm">
                <RefreshCw className="w-4 h-4" />
                重试
              </button>
            }
          />
        ) : trainings.length === 0 ? (
          <ListEmptyState
            icon={source === 'mine' ? Bookmark : BookOpen}
            title={source === 'mine' ? '还没有收藏的题单' : '暂无题单'}
            description={
              source === 'mine'
                ? isLoggedIn
                  ? '去「官方题单」或「竞赛真题」逛逛，加入感兴趣的题单即可收藏'
                  : '登录后即可查看收藏的题单'
                : '当前分类下还没有题单'
            }
          />
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
              className="btn-ghost btn p-2.5"
              aria-label="上一页"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-muted-foreground px-3">
              第 {page} / {totalPages} 页
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="btn-ghost btn p-2.5"
              aria-label="下一页"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
    </EducationalPageShell>
  )
}
