'use client'

import { useState, useMemo, useCallback, Suspense } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import {
  Trophy,
  Plus,
  Search,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { canCreateContest } from '@/lib/permissions'
import { fetchWithCookie } from '@/lib/api/base'
import { useWallClock } from '@/hooks/useWallClock'
import {
  EducationalPageShell,
  ListEmptyState,
  RouteSuspenseFallback,
} from '@/components/common'
import CreateContestModal from '@/components/contest/CreateContestModal'
import ContestCard, { type ContestCardData } from '@/components/contest/ContestCard'

const PAGE_SIZE = 12

const CONTEST_GRID_CLASS = 'grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6'

function ContestsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()
  const [contests, setContests] = useState<ContestCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'ongoing' | 'upcoming' | 'ended'>('all')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [editContestId, setEditContestId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('edit')
  })

  const canCreate = canCreateContest(user)

  // 纯派生：不在 render/useMemo 里调 Date.now；列表非「已结束」且有赛程则开墙钟
  const needsLiveClock = useMemo(
    () =>
      activeTab !== 'ended' &&
      contests.some((c) => Number.isFinite(new Date(c.endTime).getTime())),
    [contests, activeTab]
  )
  const nowMs = useWallClock(needsLiveClock)

  const fetchContests = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const statusParam = activeTab === 'all' ? '' : `&status=${activeTab}`
      const keywordParam = keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''
      const response = await fetchWithCookie(
        `/api/contests?page=${page}&limit=${PAGE_SIZE}${statusParam}${keywordParam}`,
        {
          cache: 'no-store',
          headers: {
            Pragma: 'no-cache',
            'Cache-Control': 'no-cache',
          },
        }
      )
      const data = await response.json()

      if (data.success) {
        setContests(data.data.contests || [])
        setTotal(data.data.pagination?.total || 0)
        setTotalPages(
          data.data.pagination?.totalPages ||
            Math.ceil((data.data.pagination?.total || 0) / PAGE_SIZE) ||
            1
        )
      } else {
        setError(data.error || '获取竞赛列表失败')
        setContests([])
        setTotal(0)
        setTotalPages(1)
      }
    } catch (err) {
      console.error('获取竞赛列表失败:', err)
      setError('网络错误，获取竞赛列表失败')
      setContests([])
      setTotal(0)
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }, [activeTab, page, keyword])

  useDeferredEffect(() => {
    void fetchContests()
  }, [fetchContests])

  useDeferredEffect(() => {
    if (searchParams.get('create') === '1' && user && canCreate) {
      setCreateOpen(true)
      setEditContestId(null)
    }
    const editId = searchParams.get('edit')
    if (editId && user && canCreate) {
      setEditContestId(editId)
      setCreateOpen(false)
    }
    if ((searchParams.get('create') === '1' || editId) && user && canCreate) {
      router.replace('/contests', { scroll: false })
    }
  }, [searchParams, user, router, canCreate])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    void fetchContests()
  }

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab)
    setPage(1)
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className={CONTEST_GRID_CLASS}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="card-static rounded-xl border border-border animate-pulse min-h-[11.5rem] p-4 pl-5"
            >
              <div className="flex gap-2 mb-3">
                <div className="w-4 h-4 rounded bg-muted" />
                <div className="w-12 h-5 rounded-full bg-muted" />
                <div className="w-14 h-5 rounded-full bg-muted" />
              </div>
              <div className="h-5 w-2/3 rounded bg-muted mb-2" />
              <div className="h-3 w-full rounded bg-muted mb-1" />
              <div className="h-3 w-4/5 rounded bg-muted mb-4" />
              <div className="h-3 w-1/2 rounded bg-muted mb-2" />
              <div className="h-1 w-full rounded bg-muted mb-3" />
              <div className="flex gap-3">
                <div className="h-3 w-16 rounded bg-muted" />
                <div className="h-3 w-12 rounded bg-muted" />
                <div className="h-3 w-12 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (error) {
      return (
        <ListEmptyState
          icon={AlertCircle}
          tone="error"
          title={error}
          action={
            <button type="button" onClick={() => void fetchContests()} className="btn-primary btn btn-sm">
              重试
            </button>
          }
        />
      )
    }

    if (contests.length === 0) {
      return (
        <ListEmptyState
          icon={Trophy}
          title="暂无竞赛"
          description={
            keyword
              ? '没有匹配的竞赛，试试其他关键词'
              : activeTab === 'all'
                ? '还没有公开竞赛'
                : '当前筛选条件下没有竞赛'
          }
          action={
            canCreate && activeTab === 'all' && !keyword ? (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="btn-primary btn btn-sm"
              >
                <Plus className="w-4 h-4" />
                创建竞赛
              </button>
            ) : undefined
          }
        />
      )
    }

    return (
      <>
        <div className={`${CONTEST_GRID_CLASS} animate-fadeIn`}>
          {contests.map((contest) => (
            <ContestCard key={contest.id} contest={contest} nowMs={nowMs} />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pb-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-ghost btn btn-sm disabled:opacity-40"
              aria-label="上一页"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-muted-foreground tabular-nums px-2">
              {page} / {totalPages}
              {total > 0 ? (
                <span className="ml-2 text-muted-foreground/70">共 {total} 场</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-ghost btn btn-sm disabled:opacity-40"
              aria-label="下一页"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </>
    )
  }

  return (
    <EducationalPageShell
      title="竞赛"
      icon={Trophy}
      iconClassName="bg-accent text-white"
      actions={
        canCreate ? (
          <button type="button" onClick={() => setCreateOpen(true)} className="btn-primary btn">
            <Plus className="w-5 h-5" />
            创建竞赛
          </button>
        ) : undefined
      }
      toolbar={
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-1 card-static p-1 rounded-lg overflow-x-auto border border-border shrink-0">
            {(
              [
                { key: 'all', label: '全部' },
                { key: 'ongoing', label: '进行中' },
                { key: 'upcoming', label: '即将开始' },
                { key: 'ended', label: '已结束' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`px-3.5 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                onClick={() => handleTabChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0 sm:max-w-md">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
              <input
                type="text"
                placeholder="搜索竞赛标题或简介..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="input pl-10 py-2.5 rounded-lg w-full"
              />
            </div>
            <button type="submit" className="btn-ghost btn px-4 shrink-0">
              搜索
            </button>
          </form>
        </div>
      }
    >
      {renderContent()}
      <CreateContestModal
        open={createOpen || !!editContestId}
        contestId={editContestId}
        onClose={() => {
          setCreateOpen(false)
          setEditContestId(null)
        }}
        onCreated={() => {
          setPage(1)
          void fetchContests()
        }}
        onSaved={() => void fetchContests()}
      />
    </EducationalPageShell>
  )
}

export default function ContestsPage() {
  return (
    <Suspense fallback={<RouteSuspenseFallback label="加载中..." />}>
      <ContestsPageContent />
    </Suspense>
  )
}
