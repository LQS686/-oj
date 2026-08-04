'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { motion, AnimatePresence } from 'motion/react'
import { Trophy, AlertCircle, ChevronUp, Crown, Medal, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { acquireAppSocket, releaseAppSocket } from '@/hooks/socket-client'
import { EducationalPageShell, ListEmptyState, ListToolbar, ListToolbarTabs } from '@/components/common'
import { fetchWithCookie } from '@/lib/api/base'
import { errorLike } from '@/lib/api/errors'
import { PageContainer } from '@/components/layout'

interface UserRanking {
 id: string
 username: string
 nickname: string
 position: number
 rank: string
 color: string
 avatar: string | null
 solvedProblems: number
}

interface MyRankData {
 rank: number
 userId: string
}

type RankingPeriod = 'total' | 'month' | 'week' | 'day'

const PERIOD_TABS: { key: RankingPeriod; label: string }[] = [
 { key: 'total', label: '总榜' },
 { key: 'month', label: '月榜' },
 { key: 'week', label: '周榜' },
 { key: 'day', label: '日榜' },
]

export default function RankPage() {
 const [rankings, setRankings] = useState<UserRanking[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [activePeriod, setActivePeriod] = useState<RankingPeriod>('total')
 const [myRank, setMyRank] = useState<MyRankData | null>(null)
 const [hasMore, setHasMore] = useState(true)
 const [loadingMore, setLoadingMore] = useState(false)
 
 const pageRef = useRef(1)
 const loadingRef = useRef(false)
 const containerRef = useRef<HTMLDivElement>(null)

 const fetchRankings = useCallback(async (pageNum: number, period: string, reset = false) => {
 if (loadingRef.current && !reset) return

 try {
 loadingRef.current = true
 if (reset) {
 setLoading(true)
 } else {
 setLoadingMore(true)
 }
 
 const res = await fetchWithCookie(`/api/rankings?period=${period}&page=${pageNum}&limit=50`)
 
 if (!res.ok) throw new Error('Failed to fetch')
 
 const data = await res.json()
 if (data.success) {
 setRankings(prev => reset ? data.data.users : [...prev, ...data.data.users])
 setHasMore(data.data.pagination.page < data.data.pagination.totalPages)
 pageRef.current = pageNum
 } else {
 throw new Error(data.error)
 }
 } catch (err: unknown) {
 const e = errorLike(err)
 setError(e.message || '加载失败')
 } finally {
 loadingRef.current = false
 setLoading(false)
 setLoadingMore(false)
 }
 }, [])

 const fetchMyRank = useCallback(async (period: string) => {
 try {
 const res = await fetchWithCookie(`/api/rankings/my-rank?period=${period}`)
 if (res.ok) {
 const data = await res.json()
 if (data.success) {
 setMyRank(data.data)
 }
 }
 } catch (e) {
 console.error(e)
 }
 }, [])

 useDeferredEffect(() => {
 pageRef.current = 1
 setRankings([])
 setHasMore(true)
 setError(null)
 fetchRankings(1, activePeriod, true)
 fetchMyRank(activePeriod)
 }, [activePeriod, fetchRankings, fetchMyRank])

 useEffect(() => {
 // 复用全局 socket 单例（与提交/通知/公告共用一条连接），避免单独建立连接
 const socket = acquireAppSocket()

 const onLeaderboardUpdate = () => {
 if (pageRef.current === 1) {
 fetchRankings(1, activePeriod, true)
 }
 }
 socket.on('leaderboard:update', onLeaderboardUpdate)

 return () => {
 socket.off('leaderboard:update', onLeaderboardUpdate)
 releaseAppSocket()
 }
 }, [activePeriod, fetchRankings])

 useEffect(() => {
 const handleScroll = () => {
 if (!containerRef.current || loadingRef.current || !hasMore) return
 
 const { scrollTop, scrollHeight, clientHeight } = containerRef.current
 if (scrollTop + clientHeight >= scrollHeight - 200) {
 const nextPage = pageRef.current + 1
 fetchRankings(nextPage, activePeriod, false)
 }
 }

 // 初始 loading 时容器未挂载（null），依赖 loading 让监听器在
 // 列表渲染完成后重新绑定，否则无限滚动永远不触发
 const container = containerRef.current
 container?.addEventListener('scroll', handleScroll)
 return () => container?.removeEventListener('scroll', handleScroll)
 }, [hasMore, activePeriod, fetchRankings, loading])

 const handleRetry = () => {
 setError(null)
 fetchRankings(pageRef.current, activePeriod, pageRef.current === 1)
 }

 const getRankIcon = (rank: number) => {
 if (rank === 1) {
 return (
 <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
 <Crown className="w-4 h-4 text-white" />
 </div>
 )
 }
 if (rank === 2) {
 return (
 <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
 <Medal className="w-4 h-4 text-white" />
 </div>
 )
 }
 if (rank === 3) {
 return (
 <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
 <Medal className="w-4 h-4 text-white" />
 </div>
 )
 }
 return (
 <span className="w-8 h-8 flex items-center justify-center font-bold text-muted-foreground">
 {rank}
 </span>
 )
 }

 const showSkeleton = loading && rankings.length === 0

  return (
  <EducationalPageShell
  title="全站排行榜"
  icon={Trophy}
  iconClassName="bg-accent text-white"
  toolbar={
  <ListToolbar
  leading={
  <ListToolbarTabs
  ariaLabel="排行榜周期"
  value={activePeriod}
  onChange={(key) => setActivePeriod(key as RankingPeriod)}
  items={PERIOD_TABS}
  />
  }
  />
  }
  className="flex flex-col"
  >
  <div className="flex-1 flex flex-col min-h-0">
  {showSkeleton ? (
  <div className="card-static rounded-xl overflow-hidden">
  <div className="flex px-4 py-3 text-sm font-semibold text-muted-foreground border-b border-border/50">
  <div className="w-16 text-center">排名</div>
  <div className="flex-1">选手</div>
  <div className="w-24 text-right">解题数</div>
  </div>
  {Array.from({ length: 8 }).map((_, i) => (
  <div key={i} className="flex items-center border-b border-border/50 px-4 py-3 animate-pulse">
  <div className="w-16 flex justify-center"><div className="w-8 h-8 rounded bg-muted" /></div>
  <div className="flex-1 flex items-center gap-3">
  <div className="w-10 h-10 rounded-full bg-muted" />
  <div className="h-4 w-24 rounded bg-muted" />
  </div>
  <div className="w-24 text-right"><div className="h-5 w-12 rounded bg-muted ml-auto" /></div>
  </div>
  ))}
  </div>
   ) : (
   <div className="animate-fadeIn">
   {error && (
 <div className="card-static rounded-xl p-4 mb-6 border border-error/30 bg-error/5">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
 <AlertCircle className="w-5 h-5 text-error" />
 </div>
 <span className="text-error">{error}</span>
 </div>
 <button 
 onClick={handleRetry}
 className="btn btn-ghost text-error hover:bg-error/10"
 >
 重试
 </button>
 </div>
 </div>
 )}

 <div className="card-static rounded-t-xl flex px-4 py-3 text-sm font-semibold text-muted-foreground border-b border-border/50">
 <div className="w-16 text-center">排名</div>
 <div className="flex-1">选手</div>
 <div className="w-24 text-right">解题数</div>
 </div>

 <div 
 ref={containerRef}
 className="flex-1 card-static rounded-b-xl overflow-y-auto custom-scrollbar max-h-[calc(100vh-14rem)]"
 >
 {rankings.map((user) => {
 const isTop3 = user.position <= 3
 const isCurrentUser = user.id === myRank?.userId
 
 return (
 <div
 key={user.id}
 className={`flex items-center border-b border-border/50 hover:bg-primary/5 transition-all duration-200 px-4 py-3 ${
 isCurrentUser ? 'bg-primary/10' : ''
 }`}
 >
 <div className="w-16 flex-shrink-0 flex justify-center">
 {getRankIcon(user.position)}
 </div>
 
 <div className="flex-1 flex items-center gap-3 min-w-0">
 <Link href={`/user/${user.id}`} className="flex items-center gap-3 flex-1 min-w-0 group">
 <div className="relative transition-transform duration-200 group-hover:scale-110">
 {user.avatar ? (
 <img
 src={user.avatar}
 alt={user.username}
 className="w-10 h-10 rounded-full object-cover border-2 border-transparent group-hover:border-primary-light transition-all duration-200"
 />
 ) : (
 <div
 className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg transition-all duration-200 group-hover:shadow-xl"
 style={{ backgroundColor: user.color }}
 >
 {user.username?.charAt(0).toUpperCase() || '?'}
 </div>
 )}
 {isTop3 && (
 <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center animate-pulse-glow">
 <Trophy className="w-2.5 h-2.5 text-white" />
 </div>
 )}
 </div>
 <div className="truncate">
 <div className="font-medium truncate flex items-center gap-2" style={{ color: user.color }}>
 {user.nickname || user.username}
 </div>
 </div>
 </Link>
 </div>

 <div className="w-24 text-right font-bold text-lg" style={{ color: user.color }}>
 {user.solvedProblems}
 </div>
 </div>
 )
 })}
 
 {loadingMore && (
 <div className="flex items-center justify-center py-6">
 <Loader2 className="w-6 h-6 text-primary animate-spin" />
 </div>
 )}
 
 {!hasMore && rankings.length > 0 && (
 <div className="text-center py-6 text-muted-foreground text-sm">
 已加载全部数据
 </div>
 )}
 </div>

 {rankings.length === 0 && !loading && (
  <div className="mt-4">
    <ListEmptyState icon={Trophy} title="暂无排名数据" description="还没有用户上榜" />
  </div>
   )}
   </div>
   )}
  </div>

 <AnimatePresence>
 {myRank && myRank.rank > 100 && (
 <motion.div
 initial={{ y: 100 }}
 animate={{ y: 0 }}
 exit={{ y: 100 }}
 className="fixed bottom-0 left-0 right-0 card-static border-t border-border z-40"
 >
 <PageContainer className="py-3 flex items-center justify-between">
 <div className="flex items-center gap-4">
 <span className="text-muted-foreground text-sm">我的当前排名</span>
 <div className="flex items-center gap-2">
 <span className="font-bold text-2xl text-primary-light">{myRank.rank}</span>
 </div>
 </div>
 <button 
 onClick={() => {
 containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
 }}
 className="btn btn-ghost flex items-center gap-2"
 >
 <ChevronUp className="w-4 h-4" />
 回到顶部
 </button>
 </PageContainer>
 </motion.div>
 )}
 </AnimatePresence>
 </EducationalPageShell>
 )
}
