'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, TrendingUp, Minus, RefreshCw, AlertCircle, ChevronUp, Crown, Medal, Loader2 } from 'lucide-react'
import Link from 'next/link'
import io from 'socket.io-client'
import { EducationalPageShell, PageLoading } from '@/components/common'
import { fetchWithCookie } from '@/lib/api/base'

interface UserRanking {
 id: string
 username: string
 nickname: string
 rating: number
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

export default function RankPage() {
 const [rankings, setRankings] = useState<UserRanking[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [activeTab, setActiveTab] = useState<'rating' | 'solved'>('rating')
 const [myRank, setMyRank] = useState<MyRankData | null>(null)
 const [hasMore, setHasMore] = useState(true)
 const [loadingMore, setLoadingMore] = useState(false)
 const [isRefreshing, setIsRefreshing] = useState(false)
 
 const pageRef = useRef(1)
 const loadingRef = useRef(false)
 const containerRef = useRef<HTMLDivElement>(null)

 const fetchRankings = useCallback(async (pageNum: number, type: string, reset = false) => {
 if (loadingRef.current && !reset) return

 try {
 loadingRef.current = true
 if (reset) {
 setLoading(true)
 } else {
 setLoadingMore(true)
 }
 
 const res = await fetchWithCookie(`/api/rankings?type=${type}&page=${pageNum}&limit=50`)
 
 if (!res.ok) throw new Error('Failed to fetch')
 
 const data = await res.json()
 if (data.success) {
 setRankings(prev => reset ? data.data.users : [...prev, ...data.data.users])
 setHasMore(data.data.pagination.page < data.data.pagination.totalPages)
 pageRef.current = pageNum
 } else {
 throw new Error(data.error)
 }
 } catch (err: any) {
 setError(err.message)
 } finally {
 loadingRef.current = false
 setLoading(false)
 setLoadingMore(false)
 setIsRefreshing(false)
 }
 }, [])

 const fetchMyRank = useCallback(async (type: string) => {
 try {
 const res = await fetchWithCookie(`/api/rankings/my-rank?type=${type}`)
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

 useEffect(() => {
 pageRef.current = 1
 setRankings([])
 setHasMore(true)
 setError(null)
 fetchRankings(1, activeTab, true)
 fetchMyRank(activeTab)
 }, [activeTab, fetchRankings, fetchMyRank])

 useEffect(() => {
 const socket = io({ path: '/socket.io/' })
 
 socket.on('leaderboard:update', () => {
 if (pageRef.current === 1) {
 fetchRankings(1, activeTab, true)
 }
 })

 return () => {
 socket.disconnect()
 }
 }, [activeTab, fetchRankings])

 useEffect(() => {
 const handleScroll = () => {
 if (!containerRef.current || loadingRef.current || !hasMore) return
 
 const { scrollTop, scrollHeight, clientHeight } = containerRef.current
 if (scrollTop + clientHeight >= scrollHeight - 200) {
 const nextPage = pageRef.current + 1
 fetchRankings(nextPage, activeTab, false)
 }
 }

 const container = containerRef.current
 container?.addEventListener('scroll', handleScroll)
 return () => container?.removeEventListener('scroll', handleScroll)
 }, [hasMore, activeTab, fetchRankings])

 const handleRetry = () => {
 setError(null)
 fetchRankings(pageRef.current, activeTab, pageRef.current === 1)
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
  description="每 30 秒更新一次"
  icon={Trophy}
  iconClassName="bg-accent text-white"
  actions={
  <button
  type="button"
  onClick={() => {
  setIsRefreshing(true)
  fetchRankings(1, activeTab, true)
  }}
  disabled={isRefreshing}
  className="btn btn-ghost"
  >
  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
  刷新
  </button>
  }
  toolbar={
  <div className="flex items-center gap-1 card-static p-1 rounded-lg w-fit border border-border">
  {[
  { key: 'rating', label: 'Rating 排行榜' },
  { key: 'solved', label: 'AC 刷题榜' },
  ].map((tab) => (
  <button
  key={tab.key}
  type="button"
  onClick={() => setActiveTab(tab.key as typeof activeTab)}
  className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${
  activeTab === tab.key
  ? 'bg-primary text-white shadow-sm'
  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`}
  >
  {tab.label}
  </button>
  ))}
  </div>
  }
  className="flex flex-col"
  >
  <div className="flex-1 flex flex-col min-h-0">
  {showSkeleton ? (
  <div className="card-static rounded-xl overflow-hidden">
  <div className="flex px-4 py-3 text-sm font-semibold text-muted-foreground border-b border-border/50">
  <div className="w-16 text-center">排名</div>
  <div className="flex-1">选手</div>
  <div className="w-24 text-right">Rating</div>
  <div className="w-24 text-right">解题数</div>
  <div className="w-16 text-right">趋势</div>
  </div>
  {Array.from({ length: 8 }).map((_, i) => (
  <div key={i} className="flex items-center border-b border-border/50 px-4 py-3 animate-pulse">
  <div className="w-16 flex justify-center"><div className="w-8 h-8 rounded bg-muted" /></div>
  <div className="flex-1 flex items-center gap-3">
  <div className="w-10 h-10 rounded-full bg-muted" />
  <div className="h-4 w-24 rounded bg-muted" />
  </div>
  <div className="w-24 text-right"><div className="h-5 w-12 rounded bg-muted ml-auto" /></div>
  <div className="w-24 text-right"><div className="h-4 w-10 rounded bg-muted ml-auto" /></div>
  <div className="w-16 flex justify-end"><div className="w-4 h-4 rounded bg-muted" /></div>
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
 <div className="w-24 text-right">Rating</div>
 <div className="w-24 text-right">解题数</div>
 <div className="w-16 text-right">趋势</div>
 </div>

 <div 
 ref={containerRef}
 className="flex-1 card-static rounded-b-xl overflow-y-auto custom-scrollbar min-h-[500px] max-h-[600px]"
 >
 {rankings.map((user, index) => {
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
 <Link href={`/profile/${user.id}`} className="flex items-center gap-3 flex-1 min-w-0 group">
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
 {user.rating}
 </div>
 
 <div className="w-24 text-right text-muted-foreground">
 {user.solvedProblems} <span className="text-xs text-muted-foreground/60">题</span>
 </div>
 
 <div className="w-16 flex justify-end">
 {user.rating >= 2000 ? (
 <TrendingUp className="w-4 h-4 text-error" />
 ) : (
 <Minus className="w-4 h-4 text-muted-foreground/40" />
 )}
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
  <div className="card-static rounded-xl p-16 text-center mt-6 animate-fadeIn">
  <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
  <Trophy className="w-8 h-8 text-accent" />
  </div>
  <div className="text-foreground text-xl font-semibold mb-2">暂无排名数据</div>
  <div className="text-muted-foreground">还没有用户上榜</div>
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
 className="fixed bottom-0 left-0 right-0 card-static border-t border-border z-50"
 >
 <div className="container mx-auto px-4 py-3 flex items-center justify-between">
 <div className="flex items-center gap-4">
 <span className="text-muted-foreground text-sm">我的当前排名</span>
 <div className="flex items-center gap-2">
 <span className="font-bold text-2xl text-primary-light">{myRank.rank}</span>
 <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
 距离上一名还差 ? 分
 </span>
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
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </EducationalPageShell>
 )
}
