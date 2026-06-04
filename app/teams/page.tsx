'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Users, Search, Plus, Calendar, TrendingUp, X, ChevronLeft, ChevronRight, Globe, Lock } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { useRouter } from 'next/navigation'

interface Team {
  id: string
  name: string
  description: string
  avatar: string
  isPublic: boolean
  memberCount: number
  maxMembers: number
  createdAt: string
  members?: any[]
  stats?: {
    memberCount: number
    problemCount: number
    assignmentCount: number
    noteCount: number
  }
}

export default function TeamsPage() {
  const { user } = useUser()
  const router = useRouter()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showMyTeams, setShowMyTeams] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const fetchTeams = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setInitialLoading(true)
      } else {
        setLoading(true)
      }
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '12'
      })
      
      if (searchQuery) params.append('search', searchQuery)
      if (showMyTeams) params.append('myTeams', 'true')

      const headers: any = {}

      const response = await fetchWithAuth(`/api/teams?${params}`, { headers })
      const data = await response.json()

      if (data.success) {
        setTeams(data.data.teams)
        setTotalPages(data.data.totalPages)
      }
    } catch (error) {
      logger.error('获取团队列表失败', error)
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [page, searchQuery, showMyTeams, user])

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      fetchTeams()
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [fetchTeams])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchTeams()
  }

  const handleTeamClick = async (team: Team) => {
    if (!user) {
      try {
        const response = await fetch(`/api/teams/${team.id}`)
        const data = await response.json()
        
        if (data.success) {
          setSelectedTeam({
            ...team,
            members: data.data.members || [],
            stats: data.data.stats || {
              memberCount: team.memberCount,
              problemCount: 0,
              assignmentCount: 0,
              noteCount: 0
            }
          })
          setShowTeamModal(true)
        }
      } catch (error) {
        logger.error('获取团队信息失败', error)
      }
      return
    }

    try {
      const response = await fetchWithAuth(`/api/teams/${team.id}`)
      const data = await response.json()
      
      if (data.success) {
        const isMember = data.data.members.some((m: any) => m.userId === user.id)
        
        if (isMember) {
          router.push(`/teams/${team.id}`)
        } else {
          setSelectedTeam({
            ...team,
            members: data.data.members || [],
            stats: data.data.stats || {
              memberCount: team.memberCount,
              problemCount: 0,
              assignmentCount: 0,
              noteCount: 0
            }
          })
          setShowTeamModal(true)
        }
      }
    } catch (error) {
      logger.error('获取团队信息失败', error)
    }
  }

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载团队中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">团队</h1>
              <p className="text-muted-foreground text-sm mt-0.5">加入团队，与伙伴一起学习和进步</p>
            </div>
          </div>
          {user && (
            <Link
              href="/teams/create"
              className="btn btn-primary"
            >
              <Plus className="w-5 h-5" />
              创建团队
            </Link>
          )}
        </div>

        <div className="rounded-2xl p-6 bg-white dark:bg-card shadow-lg border border-border mb-8">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex-1 relative min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <input
                  type="text"
                  placeholder="搜索团队名称或描述..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-sm"
                />
              </div>
            </div>
            {user && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowMyTeams(true)
                    setPage(1)
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    showMyTeams
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                  }`}
                >
                  我的团队
                </button>
                <button
                  onClick={() => {
                    setShowMyTeams(false)
                    setPage(1)
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    !showMyTeams
                      ? 'bg-primary text-white shadow-md shadow-primary/30'
                      : 'bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                  }`}
                >
                  所有团队
                </button>
              </div>
            )}
          </div>
        </div>

        {teams.length === 0 ? (
          <div className="rounded-2xl p-16 text-center bg-white dark:bg-card shadow-lg border border-border">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">
              {showMyTeams ? '你还没有加入任何团队' : '暂无团队'}
            </div>
            <div className="text-muted-foreground mb-6">
              {showMyTeams ? '加入一个团队开始协作学习吧' : '成为第一个创建团队的人'}
            </div>
            {user && !showMyTeams && (
              <Link href="/teams/create" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-white font-medium shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all">
                <Plus className="w-5 h-5" />
                创建第一个团队
              </Link>
            )}
          </div>
        ) : (
          <>
            {loading && (
              <div className="flex justify-center py-4 mb-4">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
              {teams.map((team) => (
                <TeamCard key={team.id} team={team} onTeamClick={handleTeamClick} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center">
                <div className="flex items-center gap-2 glass-strong rounded-xl p-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="btn btn-ghost px-3 py-2"
                  >
                    <ChevronLeft className="w-5 h-5" />
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
                    className="btn btn-ghost px-3 py-2"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showTeamModal && selectedTeam && (
        <TeamDetailModal
          team={selectedTeam}
          onClose={() => setShowTeamModal(false)}
          user={user}
          router={router}
        />
      )}
    </div>
  )
}

function TeamDetailModal({ team, onClose, user, router }: { team: Team, onClose: () => void, user: any, router: any }) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleJoinTeam = async () => {
    if (!user) {
      router.push('/login')
      return
    }

    if (!message.trim()) {
      alert('请填写申请理由')
      return
    }

    try {
      setLoading(true)
      const response = await fetchWithAuth(`/api/teams/${team.id}/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess(true)
        setTimeout(() => {
          setSuccess(false)
          onClose()
        }, 2000)
      } else {
        alert(data.error || '提交申请失败')
      }
    } catch (error) {
      logger.error('提交申请失败', error)
      alert('网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="glass-strong rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">团队详情</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-primary-light transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-start gap-4">
            {team.avatar ? (
              <img
                src={team.avatar}
                alt={team.name}
                className="w-20 h-20 rounded-full object-cover ring-2 ring-primary/20"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30">
                <Users className="w-10 h-10 text-white" />
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-foreground mb-2">{team.name}</h2>
              <p className="text-muted-foreground mb-3">{team.description || '暂无描述'}</p>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-primary-light" />
                  <span>{team.stats?.memberCount || 0} / {team.maxMembers} 成员</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-primary-light" />
                  <span>{new Date(team.createdAt).toLocaleDateString()}</span>
                </div>
                {team.isPublic ? (
                  <span className="tag tag-success flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    公开
                  </span>
                ) : (
                  <span className="tag tag-warning flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    私有
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-static p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-primary-light">{team.stats?.memberCount || 0}</div>
              <div className="text-sm text-muted-foreground">成员数</div>
            </div>
            <div className="card-static p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-secondary-light">{team.stats?.problemCount || 0}</div>
              <div className="text-sm text-muted-foreground">题目数</div>
            </div>
            <div className="card-static p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-accent-light">{team.stats?.assignmentCount || 0}</div>
              <div className="text-sm text-muted-foreground">作业数</div>
            </div>
            <div className="card-static p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-error">{team.stats?.noteCount || 0}</div>
              <div className="text-sm text-muted-foreground">笔记数</div>
            </div>
          </div>

          {success ? (
            <div className="card-static rounded-xl p-6 text-center border border-secondary/30 bg-secondary/5">
              <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-6 h-6 text-secondary-light" />
              </div>
              <div className="text-secondary-light font-semibold mb-2">申请已提交</div>
              <p className="text-muted-foreground">请等待管理员审批，2秒后自动关闭...</p>
            </div>
          ) : (
            <div className="card-static rounded-xl p-6">
              <h4 className="font-semibold text-foreground mb-4">申请加入团队</h4>
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  申请理由
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="请简要说明您申请加入团队的理由..."
                  maxLength={500}
                  className="input min-h-[120px] resize-none"
                  rows={4}
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-muted-foreground">请填写申请理由，以便管理员审核</p>
                  <span className="text-xs text-muted-foreground">{message.length}/500</span>
                </div>
              </div>
              <button
                onClick={handleJoinTeam}
                disabled={loading}
                className="btn btn-primary w-full"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    提交申请中...
                  </>
                ) : (
                  '申请加入团队'
                )}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end p-6 border-t border-border">
          <button
            onClick={onClose}
            disabled={loading}
            className="btn btn-outline"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

function TeamCard({ team, onTeamClick }: { team: Team, onTeamClick: (team: Team) => void }) {
  const memberPercentage = Math.round((team.memberCount / team.maxMembers) * 100)

  return (
    <div
      onClick={() => onTeamClick(team)}
      className="bg-white dark:bg-card rounded-xl shadow-md border border-border overflow-hidden cursor-pointer group hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
    >
      <div className="p-6">
        <div className="flex items-center gap-4 mb-4">
          {team.avatar ? (
            <img
              src={team.avatar}
              alt={team.name}
              className="w-16 h-16 rounded-full object-cover ring-2 ring-primary/20 shadow-sm"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30">
              <Users className="w-8 h-8 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg text-foreground mb-1 group-hover:text-primary-light transition-colors truncate">
              {team.name}
            </h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4 text-primary-light" />
              <span>{team.memberCount} / {team.maxMembers} 成员</span>
            </div>
          </div>
        </div>

        <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
          {team.description || '暂无描述'}
        </p>

        <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-primary-light" />
            <span>{new Date(team.createdAt).toLocaleDateString()}</span>
          </div>
          {team.isPublic ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary/20 text-secondary">
              <Globe className="w-3 h-3" />
              公开
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/20 text-accent">
              <Lock className="w-3 h-3" />
              私有
            </span>
          )}
        </div>

        <div className="pt-4 border-t border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>成员进度</span>
            <span className="font-medium text-primary-light">{memberPercentage}%</span>
          </div>
          <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-500"
              style={{ width: `${memberPercentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
