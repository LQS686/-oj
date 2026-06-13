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
  Sparkles
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { motion, easeOut } from 'framer-motion'

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

const MotionLink = motion(Link)

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
        bgClass: 'bg-muted/50'
      }
    default:
      return { 
        tag: 'tag', 
        icon: AlertCircle,
        iconClass: 'text-muted-foreground',
        bgClass: 'bg-muted/50'
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

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
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
  const [contests, setContests] = useState<Contest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'ongoing' | 'upcoming' | 'ended'>('all')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    fetchContests()
  }, [activeTab, page])

  const fetchContests = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const statusParam = activeTab === 'all' ? '' : `&status=${activeTab}`
      const keywordParam = keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''
      const response = await fetch(`/api/contests?page=${page}&limit=10${statusParam}${keywordParam}`, {
        cache: 'no-store',
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      })
      const data = await response.json()

      if (data.success) {
        setContests(data.data.contests || [])
        setTotalPages(data.data.pagination?.totalPages || Math.ceil((data.data.pagination?.total || 0) / 10))
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-3 border-accent/15"></div>
            <div className="absolute inset-0 rounded-full border-3 border-accent border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-xl">加载竞赛中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center card-static rounded-3xl p-14 max-w-md border border-error/10"
        >
          <div className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-8">
            <AlertCircle className="w-10 h-10 text-error" />
          </div>
          <p className="text-error text-xl mb-8">{error}</p>
          <button 
            onClick={fetchContests}
            className="btn-primary btn px-8 py-4 rounded-2xl"
          >
            <Sparkles className="w-5 h-5" />
            重试
          </button>
        </motion.div>
      </div>
    )
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.4,
        ease: easeOut
      }
    }
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-xl shadow-accent/25">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">竞赛</h1>
              <p className="text-muted-foreground text-sm mt-1">参加竞赛，挑战自我</p>
            </div>
          </div>
          <button 
            onClick={handleCreateContest}
            className="btn-primary btn px-6 py-3 rounded-2xl"
          >
            <Plus className="w-5 h-5" />
            创建竞赛
          </button>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-10">
          <div className="flex items-center gap-2 glass p-1.5 rounded-2xl overflow-x-auto">
            {[
              { key: 'all', label: '全部' },
              { key: 'ongoing', label: '进行中' },
              { key: 'upcoming', label: '即将开始' },
              { key: 'ended', label: '已结束' }
            ].map((tab) => (
              <button 
                key={tab.key}
                className={`px-6 py-3 rounded-xl font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-primary text-white shadow-lg shadow-primary/25'
                    : 'text-muted-foreground hover:bg-primary/8 hover:text-primary-light'
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
                className="input pl-13 py-3.5 rounded-2xl"
              />
            </div>
            <button 
              type="submit"
              className="btn-ghost btn px-5 py-3 rounded-2xl"
            >
              搜索
            </button>
          </form>
        </div>

        {contests.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-static rounded-3xl p-20 text-center border border-accent/5"
          >
            <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-8">
              <Trophy className="w-10 h-10 text-accent" />
            </div>
            <div className="text-foreground text-2xl font-semibold mb-3">暂无竞赛</div>
            <div className="text-muted-foreground mb-10 text-lg">当前筛选条件下没有竞赛</div>
            {activeTab === 'all' && (
              <button 
                onClick={handleCreateContest}
                className="btn-primary btn px-8 py-4 rounded-2xl"
              >
                <Plus className="w-5 h-5" />
                创建第一个竞赛
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-5"
          >
            {contests.map((contest) => {
              const status = getContestStatus(contest.startTime, contest.endTime)
              const statusConfig = getStatusConfig(status)
              const StatusIcon = statusConfig.icon
              
              return (
                <motion.div
                  key={contest.id}
                  variants={itemVariants}
                >
                  <div className="card p-7 rounded-3xl">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-4 mb-4 flex-wrap">
                          <div className={`w-12 h-12 rounded-2xl ${statusConfig.bgClass} flex items-center justify-center`}>
                            <StatusIcon className={`w-6 h-6 ${statusConfig.iconClass}`} />
                          </div>
                          <Link
                            href={`/contests/${contest.id}`}
                            className="text-xl font-bold text-foreground hover:text-primary-light transition-colors truncate"
                          >
                            {contest.title}
                          </Link>
                          <span className={statusConfig.tag}>
                            {status}
                          </span>
                          <span className="tag tag-primary">
                            {contest.type}
                          </span>
                          {!contest.isPublic && (
                            <Lock className="w-4.5 h-4.5 text-muted-foreground" />
                          )}
                        </div>

                        {contest.description && (
                          <p className="text-muted-foreground mb-5 line-clamp-2 leading-relaxed">
                            {contest.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-7 gap-y-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2.5">
                            <Calendar className="w-4.5 h-4.5 text-primary-light" />
                            <span className="font-medium">{formatTime(contest.startTime)}</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <Clock className="w-4.5 h-4.5 text-accent" />
                            <span className="font-medium">{contest.duration} 分钟</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <Users className="w-4.5 h-4.5 text-secondary-light" />
                            <span className="font-medium">{contest._count.participants} 人参加</span>
                          </div>
                          {status === '即将开始' && (
                            <div className="flex items-center gap-2.5 text-primary-light font-semibold">
                              <Timer className="w-4.5 h-4.5" />
                              <span>{getTimeRemaining(contest.startTime)}后开始</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 lg:ml-8">
                        {status === '进行中' ? (
                          <MotionLink
                            href={`/contests/${contest.id}`}
                            className={`btn ${contest.isRegistered ? 'btn-secondary' : 'btn-primary'} rounded-2xl px-6 py-3`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            {contest.isRegistered ? '进入竞赛' : '立即报名'}
                          </MotionLink>
                        ) : status === '即将开始' ? (
                          contest.isRegistered ? (
                            <div className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-secondary/10 text-secondary-light font-semibold">
                              <CheckCircle2 className="w-5 h-5" />
                              已报名
                            </div>
                          ) : (
                            <MotionLink
                              href={`/contests/${contest.id}`}
                              className="btn-primary btn rounded-2xl px-6 py-3"
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              报名参加
                            </MotionLink>
                          )
                        ) : (
                          <MotionLink
                            href={`/contests/${contest.id}/rank`}
                            className="btn-ghost btn rounded-2xl px-6 py-3"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            查看排名
                          </MotionLink>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}

        {totalPages > 1 && (
          <div className="mt-12 flex justify-center">
            <div className="flex items-center gap-2.5 glass-strong rounded-2xl p-2.5 border border-primary/5">
              <button 
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="btn-ghost btn px-4 py-3 rounded-xl"
              >
                <ChevronLeft className="w-5.5 h-5.5" />
              </button>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + 1
                  return (
                    <button 
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-11 h-11 rounded-xl font-semibold transition-all ${
                        page === pageNum
                          ? 'bg-primary text-white shadow-lg shadow-primary/25'
                          : 'text-muted-foreground hover:bg-primary/8 hover:text-primary-light'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
                {totalPages > 5 && (
                  <>
                    <span className="px-3 text-muted-foreground">...</span>
                    <button 
                      onClick={() => setPage(totalPages)}
                      className={`w-11 h-11 rounded-xl font-semibold transition-all ${
                        page === totalPages
                          ? 'bg-primary text-white shadow-lg shadow-primary/25'
                          : 'text-muted-foreground hover:bg-primary/8 hover:text-primary-light'
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
                className="btn-ghost btn px-4 py-3 rounded-xl"
              >
                <ChevronRight className="w-5.5 h-5.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
