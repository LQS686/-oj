'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { 
  Users, 
  Settings, 
  BookOpen, 
  FileText, 
  BarChart,
  Calendar,
  UserPlus,
  LogOut,
  Shield,
  Crown,
  Plus,
  Clock,
  User,
  Search,
  Activity,
  Edit3,
  Trash2,
  X,
  Save,
  Globe,
  Lock
} from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import Link from 'next/link'

interface TeamMember {
  id: string
  userId: string
  username: string
  nickname: string
  avatar: string
  role: string
  joinedAt: string
  lastActiveAt?: string
  remark?: string
}

interface Assignment {
  id: string
  title: string
  description: string
  deadline: string
  problemCount: number
  problems?: any[]
  stats: {
    totalMembers: number
    completedMembers: number
    completionRate: number
  }
  userStatus: string
  createdAt: string
  createdBy?: string
}

interface Note {
  id: string
  title: string
  content: string
  category?: string
  tags?: string[]
  author: {
    id?: string
    username?: string
    nickname?: string
    avatar?: string
  }
  createdAt: string
  updatedAt: string
}

interface Team {
  id: string
  name: string
  description: string
  avatar: string
  isPublic: boolean
  maxMembers: number
  ownerId: string
  createdAt: string
  announcement?: string
  members: TeamMember[]
  stats: {
    memberCount: number
    problemCount: number
    assignmentCount: number
    noteCount: number
  }
}

export default function TeamDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()
  const teamId = params.id as string

  const tabParam = searchParams.get('tab')
  const validTabs = ['overview', 'assignments', 'notes', 'members', 'stats']
  const initialTab = tabParam && validTabs.includes(tabParam) ? tabParam : 'overview'
  const [currentTab, setCurrentTab] = useState(initialTab)

  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'ongoing' | 'ended'>('all')
  
  const [notes, setNotes] = useState<Note[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteSearchQuery, setNoteSearchQuery] = useState('')
  const [showMyNotes, setShowMyNotes] = useState(false)
  
  const [displayMembers, setDisplayMembers] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const [statistics, setStatistics] = useState<any>(null)
  const [statisticsLoading, setStatisticsLoading] = useState(false)

  useEffect(() => {
    fetchTeamDetail()
  }, [teamId])

  useEffect(() => {
    const tab = searchParams.get('tab')
    const validTabs = ['overview', 'assignments', 'notes', 'members', 'stats']
    if (tab && validTabs.includes(tab)) {
      setCurrentTab(tab)
    }
  }, [searchParams])

  const handleTabChange = (tab: string) => {
    setCurrentTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    router.push(url.pathname + url.search, { scroll: false })
  }

  useEffect(() => {
    if (currentTab === 'assignments' && assignments.length === 0) {
      fetchAssignments()
    } else if (currentTab === 'notes' && notes.length === 0) {
      fetchNotes()
    } else if (currentTab === 'members' && displayMembers.length === 0 && isMember) {
      fetchMembers()
    } else if (currentTab === 'stats' && !statistics) {
      fetchStatistics()
    }
  }, [currentTab])

  useEffect(() => {
    if (currentTab === 'notes') {
      fetchNotes()
    }
  }, [showMyNotes])

  const fetchTeamDetail = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/teams/${teamId}`)
      const data = await response.json()

      if (data.success) {
        setTeam(data.data)
        setDisplayMembers(data.data.members || [])
      } else {
        setError(data.error || '加载失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const fetchAssignments = async () => {
    try {
      setAssignmentsLoading(true)
      const response = await fetch(`/api/teams/${teamId}/assignments`)
      const data = await response.json()

      if (data.success) {
        setAssignments(data.data?.assignments || [])
      }
    } catch (error) {
      console.error('[TeamAssignments] 获取作业列表失败:', error)
    } finally {
      setAssignmentsLoading(false)
    }
  }

  const fetchNotes = async () => {
    try {
      setNotesLoading(true)
      const params = new URLSearchParams()
      if (showMyNotes && user) {
        params.append('authorId', user.id)
      }

      const response = await fetch(`/api/teams/${teamId}/notes?${params}`)
      const data = await response.json()

      if (data.success) {
        setNotes(data.data?.notes || [])
      }
    } catch (error) {
      console.error('[TeamNotes] 获取笔记列表失败:', error)
    } finally {
      setNotesLoading(false)
    }
  }

  const fetchMembers = async () => {
    try {
      setMembersLoading(true)
      const response = await fetchWithAuth(`/api/teams/${teamId}`)
      const data = await response.json()

      if (data.success) {
        setDisplayMembers(data.data.members || [])
      }
    } catch (error) {
      console.error('[TeamMembers] 获取成员列表失败:', error)
    } finally {
      setMembersLoading(false)
    }
  }

  const fetchStatistics = async () => {
    try {
      setStatisticsLoading(true)
      const response = await fetch(`/api/teams/${teamId}/statistics`)
      const data = await response.json()

      if (data.success) {
        setStatistics(data.data)
      }
    } catch (error) {
      console.error('[TeamStats] 获取统计数据失败:', error)
    } finally {
      setStatisticsLoading(false)
    }
  }

  const handleJoinTeam = async () => {
    if (!user) {
      router.push('/login')
      return
    }

    const message = prompt('请输入申请理由（可选）:')
    if (message === null) return

    try {
      const response = await fetchWithAuth(`/api/teams/${teamId}/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      })

      const data = await response.json()

      if (data.success) {
        alert('申请已提交，请等待管理员审批！')
      } else {
        alert(data.error || '提交申请失败')
      }
    } catch (err) {
      alert('网络错误')
    }
  }

  const handleLeaveTeam = async () => {
    if (!confirm('确定要退出团队吗？')) {
      return
    }

    try {
      const response = await fetchWithAuth(
        `/api/teams/${teamId}/members?userId=${user?.id}`,
        {
          method: 'DELETE'
        }
      )

      const data = await response.json()

      if (data.success) {
        router.push('/teams')
      } else {
        alert(data.error || '退出失败')
      }
    } catch (err) {
      alert('网络错误')
    }
  }

  const getRoleIcon = (role: string) => {
    if (role === 'owner') return <Crown className="w-4 h-4 text-accent-light" />
    if (role === 'admin') return <Shield className="w-4 h-4 text-primary-light" />
    return null
  }

  const getRoleName = (role: string) => {
    if (role === 'owner') return '所有者'
    if (role === 'admin') return '管理员'
    return '成员'
  }

  if (loading) {
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

  if (error || !team) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-error/20 flex items-center justify-center mx-auto mb-6">
            <X className="w-8 h-8 text-error" />
          </div>
          <p className="text-foreground text-xl font-semibold mb-2">{error || '团队不存在'}</p>
          <p className="text-muted-foreground mb-6">请检查团队是否存在或您是否有权限访问</p>
          <Link href="/teams" className="btn btn-primary">
            返回团队列表
          </Link>
        </div>
      </div>
    )
  }

  const currentMember = team.members.find(m => m.userId === user?.id)
  const isMember = !!currentMember
  const isAdmin = currentMember && ['owner', 'admin'].includes(currentMember.role)

  const tabs = [
    { id: 'overview', label: '概览', icon: Users },
    { id: 'assignments', label: '作业', icon: FileText, count: team.stats.assignmentCount },
    { id: 'notes', label: '笔记', icon: BookOpen, count: team.stats.noteCount },
    { id: 'members', label: '成员', icon: Users, count: team.stats.memberCount, requireMember: true },
    { id: 'stats', label: '统计', icon: BarChart }
  ]

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="rounded-2xl p-6 bg-white dark:bg-card shadow-lg border border-border mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {team.avatar ? (
                <img
                  src={team.avatar}
                  alt={team.name}
                  className="w-20 h-20 rounded-full object-cover ring-2 ring-primary/20 shadow-sm"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30">
                  <Users className="w-10 h-10 text-white" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-foreground mb-2">{team.name}</h1>
                <p className="text-muted-foreground mb-3">{team.description || '暂无描述'}</p>
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-primary-light" />
                    <span>{team.stats.memberCount} / {team.maxMembers} 成员</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-primary-light" />
                    <span>{new Date(team.createdAt).toLocaleDateString()}</span>
                  </div>
                  {team.isPublic ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-secondary/20 text-secondary">
                      <Globe className="w-3 h-3" />
                      公开
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-accent/20 text-accent">
                      <Lock className="w-3 h-3" />
                      私有
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              {isMember ? (
                <>
                  {isAdmin && (
                    <Link
                      href={`/teams/${teamId}/manage`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-primary/10 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      管理
                    </Link>
                  )}
                  {currentMember?.role !== 'owner' && (
                    <button
                      onClick={handleLeaveTeam}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-foreground hover:bg-error/10 hover:text-error transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      退出团队
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={handleJoinTeam}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-medium shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  加入团队
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-card shadow-lg border border-border mb-6 overflow-hidden">
          <div className="border-b border-border">
            <div className="flex gap-1 p-2 overflow-x-auto">
              {tabs.map(tab => {
                const isDisabled = tab.requireMember && !isMember
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => !isDisabled && handleTabChange(tab.id)}
                    disabled={isDisabled}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      isDisabled
                        ? 'text-muted-foreground/50 cursor-not-allowed'
                        : currentTab === tab.id
                        ? 'bg-primary text-white shadow-md shadow-primary/30'
                        : 'text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        currentTab === tab.id
                          ? 'bg-white/20 text-white'
                          : 'bg-muted/50 text-muted-foreground'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="p-6">
            {currentTab === 'overview' && (
              <TeamOverview team={team} />
            )}
            {currentTab === 'assignments' && (
              <AssignmentsTab
                teamId={teamId}
                assignments={assignments}
                loading={assignmentsLoading}
                filter={assignmentFilter}
                setFilter={setAssignmentFilter}
                user={user}
              />
            )}
            {currentTab === 'notes' && (
              <NotesTab
                teamId={teamId}
                notes={notes}
                loading={notesLoading}
                searchQuery={noteSearchQuery}
                setSearchQuery={setNoteSearchQuery}
                showMyNotes={showMyNotes}
                setShowMyNotes={setShowMyNotes}
                user={user}
              />
            )}
            {currentTab === 'members' && (
              <MembersTab
                teamId={teamId}
                members={displayMembers}
                loading={membersLoading}
                searchQuery={memberSearchQuery}
                setSearchQuery={setMemberSearchQuery}
                roleFilter={roleFilter}
                setRoleFilter={setRoleFilter}
                isAdmin={isAdmin || false}
                currentUserId={user?.id}
                onRefresh={fetchMembers}
              />
            )}
            {currentTab === 'stats' && (
              <StatsTab
                teamId={teamId}
                statistics={statistics}
                loading={statisticsLoading}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamOverview({ team }: { team: Team }) {
  return (
    <div className="space-y-6">
      {team.announcement && (
        <div className="rounded-xl p-6 border border-primary/30 bg-primary/5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/20">
              <BookOpen className="w-5 h-5 text-primary-light" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-2">团队公告</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{team.announcement}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl p-5 border border-border/50 bg-gradient-to-br from-background to-background/80 hover:shadow-md transition-shadow text-center">
          <div className="text-2xl font-bold text-primary-light">{team.stats.memberCount}</div>
          <div className="text-sm text-muted-foreground mt-1">成员数</div>
        </div>
        <div className="rounded-xl p-5 border border-border/50 bg-gradient-to-br from-background to-background/80 hover:shadow-md transition-shadow text-center">
          <div className="text-2xl font-bold text-secondary-light">{team.stats.problemCount}</div>
          <div className="text-sm text-muted-foreground mt-1">题目数</div>
        </div>
        <div className="rounded-xl p-5 border border-border/50 bg-gradient-to-br from-background to-background/80 hover:shadow-md transition-shadow text-center">
          <div className="text-2xl font-bold text-accent-light">{team.stats.assignmentCount}</div>
          <div className="text-sm text-muted-foreground mt-1">作业数</div>
        </div>
        <div className="rounded-xl p-5 border border-border/50 bg-gradient-to-br from-background to-background/80 hover:shadow-md transition-shadow text-center">
          <div className="text-2xl font-bold text-error">{team.stats.noteCount}</div>
          <div className="text-sm text-muted-foreground mt-1">笔记数</div>
        </div>
      </div>

      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-foreground text-lg font-medium mb-2">欢迎来到 {team.name}</p>
        <p className="text-muted-foreground text-sm">请使用上方标签页查看作业、笔记和成员信息</p>
      </div>
    </div>
  )
}

function AssignmentsTab({
  teamId,
  assignments,
  loading,
  filter,
  setFilter,
  user
}: {
  teamId: string
  assignments: Assignment[]
  loading: boolean
  filter: 'all' | 'ongoing' | 'ended'
  setFilter: (filter: 'all' | 'ongoing' | 'ended') => void
  user: any
}) {
  const getAssignmentStatus = (assignment: Assignment) => {
    const now = new Date()
    const end = new Date(assignment.deadline)
    if (now > end) return { text: '已结束', color: 'bg-error/20 text-error' }
    return { text: '进行中', color: 'bg-secondary/20 text-secondary' }
  }

  const filteredAssignments = assignments.filter(assignment => {
    if (filter === 'all') return true
    const now = new Date()
    const end = new Date(assignment.deadline)
    if (filter === 'ongoing') return now <= end
    if (filter === 'ended') return now > end
    return true
  })

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="relative w-12 h-12 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
        </div>
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'all'
                ? 'bg-primary text-white shadow-md shadow-primary/30'
                : 'bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
            }`}
          >
            全部作业
          </button>
          <button
            onClick={() => setFilter('ongoing')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'ongoing'
                ? 'bg-secondary text-white shadow-md shadow-secondary/30'
                : 'bg-muted/50 text-muted-foreground hover:bg-secondary/10 hover:text-secondary-light'
            }`}
          >
            进行中
          </button>
          <button
            onClick={() => setFilter('ended')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'ended'
                ? 'bg-error text-white shadow-md shadow-error/30'
                : 'bg-muted/50 text-muted-foreground hover:bg-error/10 hover:text-error'
            }`}
          >
            已结束
          </button>
        </div>
        {user && (
          <Link
            href={`/teams/${teamId}/assignments/create`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-medium shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all"
          >
            <Plus className="w-4 h-4" />
            创建作业
          </Link>
        )}
      </div>

      {filteredAssignments.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-2">
            {filter !== 'all' ? '没有找到匹配的作业' : '还没有创建作业'}
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            {filter !== 'all' ? '尝试切换其他筛选条件' : '创建第一个作业来布置任务吧'}
          </p>
          {user && filter === 'all' && (
            <Link
              href={`/teams/${teamId}/assignments/create`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-white font-medium shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all"
            >
              <Plus className="w-5 h-5" />
              创建第一个作业
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssignments.map((assignment) => {
            const status = getAssignmentStatus(assignment)
            const problemCount = assignment.problemCount || 0

            return (
              <Link
                key={assignment.id}
                href={`/teams/${teamId}/assignments/${assignment.id}`}
                className="bg-white dark:bg-card rounded-xl shadow-md border border-border overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-bold text-base text-foreground flex-1 line-clamp-1">
                      {assignment.title}
                    </h3>
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${status.color} ml-2 flex-shrink-0`}>
                      {status.text}
                    </span>
                  </div>

                  <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
                    {assignment.description || '暂无描述'}
                  </p>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="w-4 h-4 text-primary-light flex-shrink-0" />
                      <span>{problemCount} 道题目</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4 text-primary-light flex-shrink-0" />
                      <span className="truncate">
                        截止：{new Date(assignment.deadline).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>完成率</span>
                      <span className="text-primary-light font-medium">{assignment.stats.completionRate}%</span>
                    </div>
                    <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-500"
                        style={{ width: `${assignment.stats.completionRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NotesTab({
  teamId,
  notes,
  loading,
  searchQuery,
  setSearchQuery,
  showMyNotes,
  setShowMyNotes,
  user
}: {
  teamId: string
  notes: Note[]
  loading: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  showMyNotes: boolean
  setShowMyNotes: (show: boolean) => void
  user: any
}) {
  const filteredNotes = notes.filter(note =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getContentPreview = (content: string) => {
    return content.replace(/[#*`_\[\]]/g, '').substring(0, 100)
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="relative w-12 h-12 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
        </div>
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
            <input
              type="text"
              placeholder="搜索笔记标题或内容..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-sm"
            />
          </div>
          {user && (
            <Link
              href={`/teams/${teamId}/notes/create`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-medium shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              创建笔记
            </Link>
          )}
        </div>

        {user && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowMyNotes(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                !showMyNotes
                  ? 'bg-primary text-white shadow-md shadow-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
              }`}
            >
              全部笔记
            </button>
            <button
              onClick={() => setShowMyNotes(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showMyNotes
                  ? 'bg-primary text-white shadow-md shadow-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
              }`}
            >
              我的笔记
            </button>
          </div>
        )}
      </div>

      {filteredNotes.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-2">
            {searchQuery || showMyNotes ? '没有找到匹配的笔记' : '还没有创建笔记'}
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            {searchQuery || showMyNotes ? '尝试其他搜索条件' : '创建第一篇笔记来记录学习心得吧'}
          </p>
          {user && !searchQuery && !showMyNotes && (
            <Link
              href={`/teams/${teamId}/notes/create`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-white font-medium shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all"
            >
              <Plus className="w-5 h-5" />
              创建第一篇笔记
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => (
            <Link
              key={note.id}
              href={`/teams/${teamId}/notes/${note.id}`}
              className="bg-white dark:bg-card rounded-xl shadow-md border border-border overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-base text-foreground flex-1 line-clamp-2">
                    {note.title}
                  </h3>
                  {note.category && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary ml-2 whitespace-nowrap flex-shrink-0">
                      {note.category}
                    </span>
                  )}
                </div>

                <p className="text-muted-foreground text-sm line-clamp-3 mb-4">
                  {getContentPreview(note.content)}
                </p>

                <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-border pt-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="w-4 h-4 text-primary-light flex-shrink-0" />
                    <span className="truncate">{note.author?.nickname || note.author?.username || '匿名'}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Calendar className="w-4 h-4 text-primary-light" />
                    <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function MembersTab({
  teamId,
  members,
  loading,
  searchQuery,
  setSearchQuery,
  roleFilter,
  setRoleFilter,
  isAdmin,
  currentUserId,
  onRefresh
}: {
  teamId: string
  members: TeamMember[]
  loading: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  roleFilter: string
  setRoleFilter: (role: string) => void
  isAdmin: boolean
  currentUserId?: string
  onRefresh: () => void
}) {
  const router = useRouter()
  const [managingMember, setManagingMember] = useState<TeamMember | null>(null)
  const [showManageModal, setShowManageModal] = useState(false)

  const filteredMembers = members.filter(m =>
    (!searchQuery || m.username?.toLowerCase().includes(searchQuery.toLowerCase()) || m.nickname?.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (!roleFilter || m.role === roleFilter)
  )

  const getRoleBadge = (role: string) => {
    const badges: Record<string, any> = {
      owner: { text: '所有者', color: 'bg-accent/20 text-accent' },
      admin: { text: '管理员', color: 'bg-primary/20 text-primary' },
      member: { text: '成员', color: 'bg-muted/30 text-muted-foreground' }
    }
    const badge = badges[role] || badges.member
    return <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${badge.color}`}>{badge.text}</span>
  }

  const getActivityStatus = (lastActiveAt?: string) => {
    if (!lastActiveAt) return { text: '未活跃', color: 'text-muted-foreground' }
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const lastActive = new Date(lastActiveAt)
    if (lastActive >= thirtyDaysAgo) {
      return { text: '活跃', color: 'text-secondary-light' }
    }
    return { text: '不活跃', color: 'text-muted-foreground' }
  }

  const handleManageMember = (member: TeamMember) => {
    setManagingMember(member)
    setShowManageModal(true)
  }

  const handleCloseModal = () => {
    setShowManageModal(false)
    setManagingMember(null)
  }

  const handleMemberUpdated = async () => {
    await onRefresh()
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="relative w-12 h-12 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
        </div>
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input
            type="text"
            placeholder="搜索用户名或昵称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-sm"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="w-auto min-w-[120px] px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-sm"
        >
          <option value="">全部角色</option>
          <option value="owner">所有者</option>
          <option value="admin">管理员</option>
          <option value="member">成员</option>
        </select>
        {isAdmin && (
          <Link
            href={`/teams/${teamId}/invites`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-medium shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            邀请成员
          </Link>
        )}
      </div>

      {filteredMembers.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium">
            {searchQuery ? '没有找到匹配的成员' : '暂无成员'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-card shadow-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gradient-to-r from-muted/40 to-muted/20">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">用户</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">角色</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">活跃状态</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">加入时间</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredMembers.map((member) => {
                  const activityStatus = getActivityStatus(member.lastActiveAt)
                  const canManage = isAdmin && member.userId !== currentUserId && member.role !== 'owner'
                  
                  return (
                    <tr key={member.id} className="hover:bg-primary/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {member.avatar ? (
                            <img src={member.avatar} alt={member.username} className="w-10 h-10 rounded-full mr-3 ring-2 ring-primary/20 shadow-sm" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mr-3 shadow-sm">
                              <User className="w-5 h-5 text-white" />
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {member.remark || member.nickname || member.username}
                              {member.remark && (
                                <span className="ml-2 text-xs text-muted-foreground">({member.nickname || member.username})</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">@{member.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getRoleBadge(member.role)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${activityStatus.color}`}>
                          {activityStatus.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(member.joinedAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {canManage ? (
                          <button
                            onClick={() => handleManageMember(member)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-primary-light hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Settings className="w-4 h-4" />
                            <span>管理</span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">
                            {member.userId === currentUserId ? '当前用户' : member.role === 'owner' ? '所有者' : '-'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showManageModal && managingMember && (
        <MemberManageModal
          teamId={teamId}
          member={managingMember}
          onClose={handleCloseModal}
          onSuccess={handleMemberUpdated}
        />
      )}
    </div>
  )
}

function MemberManageModal({
  teamId,
  member,
  onClose,
  onSuccess
}: {
  teamId: string
  member: TeamMember
  onClose: () => void
  onSuccess: () => void
}) {
  const [remark, setRemark] = useState(member.remark || '')
  const [role, setRole] = useState(member.role)
  const [loading, setLoading] = useState(false)
  const [removing, setRemoving] = useState(false)

  const handleSave = async () => {
    try {
      setLoading(true)
      
      const response = await fetchWithAuth(`/api/teams/${teamId}/members/${member.userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ remark, role })
      })

      const data = await response.json()

      if (data.success) {
        alert('修改成功')
        onSuccess()
        onClose()
      } else {
        alert(data.error || '修改失败')
      }
    } catch (error) {
      alert('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm(`确定要移除成员 "${member.nickname || member.username}" 吗？`)) {
      return
    }

    try {
      setRemoving(true)
      
      const response = await fetchWithAuth(`/api/teams/${teamId}/members/${member.userId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        alert('移除成功')
        onSuccess()
        onClose()
      } else {
        alert(data.error || '移除失败')
      }
    } catch (error) {
      alert('网络错误')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="glass-strong rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">成员管理</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-primary-light transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3 p-4 card-static rounded-xl">
            {member.avatar ? (
              <img src={member.avatar} alt={member.username} className="w-12 h-12 rounded-full ring-2 ring-primary/20" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <div className="font-medium text-foreground">{member.nickname || member.username}</div>
              <div className="text-sm text-muted-foreground">@{member.username}</div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <Edit3 className="w-4 h-4 inline mr-1" />
              成员备注
            </label>
            <input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="设置成员备注名（可选）"
              className="input"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">备注名将会在成员列表中优先显示</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <Shield className="w-4 h-4 inline mr-1" />
              成员角色
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="input"
            >
              <option value="member">成员</option>
              <option value="admin">管理员</option>
            </select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              管理员可以管理作业、笔记和普通成员
            </p>
          </div>

          <div className="border-t border-border pt-4">
            <button
              onClick={handleRemove}
              disabled={removing}
              className="w-full btn btn-ghost text-error hover:bg-error/10 border border-error/30"
            >
              <Trash2 className="w-4 h-4" />
              {removing ? '移除中...' : '移除成员'}
            </button>
            <p className="mt-2 text-xs text-muted-foreground text-center">
              移除后该成员将无法访问团队资源
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <button
            onClick={onClose}
            className="btn btn-outline"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="btn btn-primary"
          >
            <Save className="w-4 h-4" />
            {loading ? '保存中...' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatsTab({
  teamId,
  statistics,
  loading
}: {
  teamId: string
  statistics: any
  loading: boolean
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AC':
        return 'tag-success'
      case 'WA':
      case 'TLE':
      case 'MLE':
        return 'tag-error'
      case 'RE':
      case 'CE':
        return 'tag-warning'
      default:
        return 'tag'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'AC':
        return '通过'
      case 'WA':
        return '答案错误'
      case 'TLE':
        return '超时'
      case 'MLE':
        return '内存超限'
      case 'RE':
        return '运行时错误'
      case 'CE':
        return '编译错误'
      default:
        return status
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="relative w-12 h-12 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
        </div>
        <p className="text-muted-foreground">加载统计数据...</p>
      </div>
    )
  }

  if (!statistics) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <BarChart className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">暂无统计数据</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-static p-5 rounded-xl text-center">
          <div className="text-3xl font-bold text-primary-light">{statistics.members?.total || 0}</div>
          <div className="text-sm text-muted-foreground mt-1">团队成员</div>
        </div>
        <div className="card-static p-5 rounded-xl text-center">
          <div className="text-3xl font-bold text-secondary-light">{statistics.submissions?.total || 0}</div>
          <div className="text-sm text-muted-foreground mt-1">总提交数</div>
        </div>
        <div className="card-static p-5 rounded-xl text-center">
          <div className="text-3xl font-bold text-accent-light">{statistics.problems?.totalSolved || 0}</div>
          <div className="text-sm text-muted-foreground mt-1">解题总数</div>
        </div>
        <div className="card-static p-5 rounded-xl text-center">
          <div className="text-3xl font-bold text-error">{statistics.assignments?.inProgress || 0}</div>
          <div className="text-sm text-muted-foreground mt-1">进行中作业</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card-static rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-light" />
            成员统计
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">所有者</span>
              <span className="tag tag-warning">{statistics.members?.roles?.owner || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">管理员</span>
              <span className="tag tag-primary">{statistics.members?.roles?.admin || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">普通成员</span>
              <span className="tag">{statistics.members?.roles?.member || 0}</span>
            </div>
          </div>
        </div>

        <div className="card-static rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-secondary-light" />
            提交统计
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">今日提交</span>
              <span className="text-secondary-light font-semibold">{statistics.submissions?.today || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">本周提交</span>
              <span className="text-secondary-light font-semibold">{statistics.submissions?.thisWeek || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">累计提交</span>
              <span className="text-secondary-light font-semibold">{statistics.submissions?.total || 0}</span>
            </div>
          </div>
        </div>

        <div className="card-static rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-accent-light" />
            解题统计
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">团队总解题数</span>
              <span className="text-accent-light font-semibold">{statistics.problems?.totalSolved || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">人均解题数</span>
              <span className="text-accent-light font-semibold">{statistics.problems?.averageSolved || 0}</span>
            </div>
          </div>
        </div>

        <div className="card-static rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-error" />
            活跃度统计
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">7天内活跃</span>
              <span className="text-error font-semibold">{statistics.activity?.last7Days || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">30天内活跃</span>
              <span className="text-error font-semibold">{statistics.activity?.last30Days || 0}</span>
            </div>
          </div>
        </div>

        <div className="card-static rounded-xl p-5 md:col-span-2">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-light" />
            作业统计
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-success/10">
              <div className="text-2xl font-bold text-success">{statistics.assignments?.completed || 0}</div>
              <div className="text-sm text-muted-foreground">已完成</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-primary/10">
              <div className="text-2xl font-bold text-primary-light">{statistics.assignments?.inProgress || 0}</div>
              <div className="text-sm text-muted-foreground">进行中</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-error/10">
              <div className="text-2xl font-bold text-error">{statistics.assignments?.overdue || 0}</div>
              <div className="text-sm text-muted-foreground">已逾期</div>
            </div>
          </div>
        </div>
      </div>

      {statistics.recentActivity && statistics.recentActivity.length > 0 && (
        <div className="card-static rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-light" />
            最近提交
          </h3>
          <div className="space-y-3">
            {statistics.recentActivity.slice(0, 5).map((submission: any) => (
              <div
                key={submission.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {submission.avatar ? (
                    <img src={submission.avatar} alt={submission.username} className="w-8 h-8 rounded-full ring-2 ring-primary/20" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {submission.username}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {submission.problemTitle}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`tag ${getStatusColor(submission.status)}`}>
                    {getStatusText(submission.status)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(submission.submittedAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
