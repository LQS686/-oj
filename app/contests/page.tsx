'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
 Calendar, 
 Clock, 
 Trophy, 
 Users, 
 Lock, 
 Plus, 
 Search,
 Play,
 Timer,
 CheckCircle2,
 AlertCircle,
 ChevronLeft,
 ChevronRight,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { canCreateContest } from '@/lib/permissions'
import { fetchWithCookie } from '@/lib/api/base'
import { formatDateTimeShort } from '@/lib/utils'
import {
  EducationalPageShell,
  LIST_GRID_CLASS,
  LIST_GRID_CARD_META_ROW,
  LIST_GRID_CARD_TITLE,
  LIST_GRID_CARD_FOOTER,
  LIST_GRID_CARD_MIDDLE,
  listGridCardLinkClass,
} from '@/components/common'

interface Contest {
 id: string
 title: string
 description: string
 type: string
 startTime: string
 endTime: string
 duration: number
 isPublic: boolean
 password: string | null
 author: {
 id: string
 username: string
 nickname: string
 }
 _count: {
 participants: number
 problems: number
 }
 isRegistered?: boolean
}

function getStatusConfig(status: string) {
 switch (status) {
 case '进行中':
 return { 
 tag: 'tag-success', 
 icon: Play,
 iconClass: 'text-secondary-light',
 bgClass: 'bg-secondary/10'
 }
 case '即将开始':
 return { 
 tag: 'tag-primary', 
 icon: Timer,
 iconClass: 'text-primary-light',
 bgClass: 'bg-primary/10'
 }
 case '已结束':
 return { 
 tag: 'tag', 
 icon: CheckCircle2,
 iconClass: 'text-muted-foreground',
 bgClass: 'bg-muted'
 }
 default:
 return { 
 tag: 'tag', 
 icon: AlertCircle,
 iconClass: 'text-muted-foreground',
 bgClass: 'bg-muted'
 }
 }
}

function getContestStatus(startTime: string, endTime: string): string {
 const now = new Date()
 const start = new Date(startTime)
 const end = new Date(endTime)
 
 if (now >= start && now <= end) {
 return '进行中'
 } else if (now < start) {
 return '即将开始'
 } else {
 return '已结束'
 }
}

function getTimeRemaining(startTime: string): string {
 const now = new Date()
 const start = new Date(startTime)
 const diff = start.getTime() - now.getTime()
 
 if (diff <= 0) return '已开始'
 
 const days = Math.floor(diff / (1000 * 60 * 60 * 24))
 const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
 const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
 
 if (days > 0) return `${days}天${hours}小时`
 if (hours > 0) return `${hours}小时${minutes}分钟`
 return `${minutes}分钟`
}

export default function ContestsPage() {
 const router = useRouter()
 const { user } = useUser()
 const [contests, setContests] = useState<Contest[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [activeTab, setActiveTab] = useState<'all' | 'ongoing' | 'upcoming' | 'ended'>('all')
 const [keyword, setKeyword] = useState('')
 const [page, setPage] = useState(1)
 const [totalPages, setTotalPages] = useState(1)

 // 是否可创建竞赛（SYSTEM_ADMIN / ADMIN / TEACHER）
 const canCreate = canCreateContest(user)

 useEffect(() => {
 fetchContests()
 }, [activeTab, page])

 const fetchContests = async () => {
 try {
 setLoading(true)
 setError(null)
 
 const statusParam = activeTab === 'all' ? '' : `&status=${activeTab}`
 const keywordParam = keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''
 const response = await fetchWithCookie(`/api/contests?page=${page}&limit=24${statusParam}${keywordParam}`, {
 cache: 'no-store',
 headers: {
 'Pragma': 'no-cache',
 'Cache-Control': 'no-cache'
 }
 })
 const data = await response.json()

 if (data.success) {
 setContests(data.data.contests || [])
 setTotalPages(data.data.pagination?.totalPages || Math.ceil((data.data.pagination?.total || 0) / 24))
 } else {
 setError(data.error || '获取竞赛列表失败')
 setContests([])
 setTotalPages(1)
 }
 } catch (err) {
 console.error('获取竞赛列表失败:', err)
 setError('网络错误，获取竞赛列表失败')
 setContests([])
 setTotalPages(1)
 } finally {
 setLoading(false)
 }
 }

 const handleSearch = (e: React.FormEvent) => {
 e.preventDefault()
 setPage(1)
 fetchContests()
 }

 const handleCreateContest = () => {
 router.push('/contests/create')
 }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card rounded-lg p-5 border border-border animate-pulse">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-4 h-4 rounded bg-muted" />
                <div className="w-16 h-5 rounded-full bg-muted" />
              </div>
              <div className="h-5 w-3/4 rounded bg-muted mb-3" />
              <div className="space-y-2">
                <div className="h-4 w-1/2 rounded bg-muted" />
                <div className="h-4 w-1/3 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (error) {
      return (
        <div className="card-static rounded-lg p-12 text-center max-w-md mx-auto border border-border">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <p className="text-error mb-6">{error}</p>
          <button onClick={fetchContests} className="btn-primary btn">
            重试
          </button>
        </div>
      )
    }

    if (contests.length === 0) {
      return (
        <div className="card-static rounded-lg p-16 text-center border border-border animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-8 h-8 text-muted-foreground" />
          </div>
          <div className="text-foreground text-xl font-semibold mb-2">暂无竞赛</div>
          <div className="text-muted-foreground mb-6">当前筛选条件下没有竞赛</div>
          {activeTab === 'all' && (
            <button 
              onClick={handleCreateContest}
              className="btn-primary btn px-8 py-4 rounded-lg"
            >
              <Plus className="w-5 h-5" />
              创建第一个竞赛
            </button>
          )}
        </div>
      )
    }

    return (
      <div className={`${LIST_GRID_CLASS} animate-fadeIn`}>
        {contests.map((contest) => {
          const status = getContestStatus(contest.startTime, contest.endTime)
          const statusConfig = getStatusConfig(status)
          const StatusIcon = statusConfig.icon
          const rowHref = status === '已结束' ? `/contests/${contest.id}/rank` : `/contests/${contest.id}`

          return (
            <Link
              key={contest.id}
              href={rowHref}
              className={listGridCardLinkClass()}
            >
              <div className={LIST_GRID_CARD_META_ROW}>
                <StatusIcon className={`w-4 h-4 ${statusConfig.iconClass} shrink-0`} />
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
                  {contest.type}
                </span>
              </div>
              <div className={LIST_GRID_CARD_MIDDLE}>
                <div className="flex items-center gap-1.5 min-w-0">
                  {!contest.isPublic && (
                    <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                  <h3 className={`${LIST_GRID_CARD_TITLE} flex-1 min-w-0 !line-clamp-1`}>
                    {contest.title}
                  </h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusConfig.tag}`}
                  >
                    {status}
                  </span>
                </div>
                {status === '即将开始' && contest.isRegistered && (
                  <span className="text-xs text-secondary-light font-semibold mt-1 block">已报名</span>
                )}
              </div>
              <div className={`space-y-1 overflow-hidden ${LIST_GRID_CARD_FOOTER}`}>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{formatDateTimeShort(contest.startTime)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>{contest.duration} 分钟</span>
                </span>
                {status === '即将开始' && (
                  <span className="flex items-center gap-1 text-primary-light font-medium line-clamp-1">
                    <Timer className="w-3.5 h-3.5 shrink-0" />
                    {getTimeRemaining(contest.startTime)}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  {contest._count.participants} 人
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <EducationalPageShell
      title="竞赛"
      icon={Trophy}
      iconClassName="bg-accent text-white"
      actions={
        canCreate ? (
          <button onClick={handleCreateContest} className="btn-primary btn">
            <Plus className="w-5 h-5" />
            创建竞赛
          </button>
        ) : undefined
      }
      toolbar={
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 card-static p-1 rounded-lg overflow-x-auto border border-border">
            {[
              { key: 'all', label: '全部' },
              { key: 'ongoing', label: '进行中' },
              { key: 'upcoming', label: '即将开始' },
              { key: 'ended', label: '已结束' }
            ].map((tab) => (
              <button 
                key={tab.key}
                className={`px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="relative flex-1 lg:w-72">
              <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4.5 h-4.5" />
              <input
                type="text"
                placeholder="搜索竞赛..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="input pl-13 py-3.5 rounded-lg"
              />
            </div>
            <button 
              type="submit"
              className="btn-ghost btn px-5 py-3 rounded-lg"
            >
              搜索
            </button>
          </form>
        </div>
      }
    >
      {renderContent()}
    </EducationalPageShell>
  )
}
