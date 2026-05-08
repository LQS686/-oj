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
  Lock,
  CheckCircle2,
  XCircle
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
  startTime?: string
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
  const validTabs = ['overview', 'assignments', 'notes', 'members']
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

  useEffect(() => {
    fetchTeamDetail()
  }, [teamId])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && ['overview', 'assignments', 'notes', 'members'].includes(tab)) {
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
    if (currentTab === 'assignments' && assignments.length === 0) fetchAssignments()
    else if (currentTab === 'notes' && notes.length === 0) fetchNotes()
    else if (currentTab === 'members' && displayMembers.length === 0 && isMember) fetchMembers()
  }, [currentTab])

  useEffect(() => {
    if (currentTab === 'notes') fetchNotes()
  }, [showMyNotes])

  const fetchTeamDetail = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/teams/${teamId}`)
      const data = await response.json()
      if (data.success) {
        setTeam(data.data)
        setDisplayMembers(data.data.members || [])
        fetchStatistics()
      } else setError(data.error || '加载失败')
    } catch { setError('网络错误') }
    finally { setLoading(false) }
  }

  const fetchStatistics = async () => {
    try {
      const response = await fetch(`/api/teams/${teamId}/statistics`)
      const data = await response.json()
      if (data.success) setStatistics(data.data)
    } catch {}
  }

  const fetchAssignments = async () => {
    try {
      setAssignmentsLoading(true)
      const response = await fetch(`/api/teams/${teamId}/assignments`)
      const data = await response.json()
      if (data.success) setAssignments(data.data?.assignments || [])
    } catch {} finally { setAssignmentsLoading(false) }
  }

  const fetchNotes = async () => {
    try {
      setNotesLoading(true)
      const params = new URLSearchParams()
      if (showMyNotes && user) params.append('authorId', user.id)
      const response = await fetch(`/api/teams/${teamId}/notes?${params}`)
      const data = await response.json()
      if (data.success) setNotes(data.data?.notes || [])
    } catch {} finally { setNotesLoading(false) }
  }

  const fetchMembers = async () => {
    try {
      setMembersLoading(true)
      const response = await fetchWithAuth(`/api/teams/${teamId}`)
      const data = await response.json()
      if (data.success) setDisplayMembers(data.data.members || [])
    } catch {} finally { setMembersLoading(false) }
  }

  const handleJoinTeam = async () => {
    if (!user) { router.push('/login'); return }
    const message = prompt('请输入申请理由（可选）:')
    if (message === null) return
    try {
      const res = await fetchWithAuth(`/api/teams/${teamId}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      })
      const d = await res.json()
      alert(d.success ? '申请已提交，请等待管理员审批！' : (d.error || '提交申请失败'))
    } catch { alert('网络错误') }
  }

  const handleLeaveTeam = async () => {
    if (!confirm('确定要退出团队吗？')) return
    try {
      const res = await fetchWithAuth(`/api/teams/${teamId}/members?userId=${user?.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (d.success) router.push('/teams')
      else alert(d.error || '退出失败')
    } catch { alert('网络错误') }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  )

  if (error || !team) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-foreground text-xl font-semibold mb-2">{error || '团队不存在'}</p>
        <Link href="/teams" className="btn btn-primary mt-4">返回团队列表</Link>
      </div>
    </div>
  )

  const currentMember = team.members.find(m => m.userId === user?.id)
  const isMember = !!currentMember
  const isAdmin = currentMember && ['owner', 'admin'].includes(currentMember.role)

  const tabs = [
    { id: 'overview', label: '概览', icon: Users },
    { id: 'assignments', label: '作业', icon: FileText, count: team.stats.assignmentCount },
    { id: 'notes', label: '笔记', icon: BookOpen, count: team.stats.noteCount, requireMember: true as const },
    { id: 'members', label: '成员', icon: Users, count: team.stats.memberCount },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white dark:bg-card rounded-xl border border-border shadow-sm overflow-hidden mb-4">
          <div className="p-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {team.avatar ? (
                <img src={team.avatar} alt={team.name} className="w-14 h-14 rounded-full object-cover ring-2 ring-primary/20" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <Users className="w-7 h-7 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-foreground">{team.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{team.description || '暂无描述'}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span>{team.stats.memberCount} / {team.maxMembers} 成员</span>
                  <span>·</span>
                  <span>{new Date(team.createdAt).toLocaleDateString()}</span>
                  {team.isPublic ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-secondary/10 text-secondary"><Globe className="w-3 h-3" />公开</span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-accent/10 text-accent"><Lock className="w-3 h-3" />私有</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              {isMember && isAdmin && (
                <Link href={`/teams/${teamId}/manage`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors">
                  <Settings className="w-3.5 h-3.5" /> 管理
                </Link>
              )}
              {!isMember && (
                <button onClick={handleJoinTeam} className="btn-primary btn text-sm px-4">
                  <UserPlus className="w-3.5 h-3.5" /> 加入团队
                </button>
              )}
              {isMember && currentMember?.role !== 'owner' && (
                <button onClick={handleLeaveTeam} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-error/10 hover:text-error transition-colors">
                  <LogOut className="w-3.5 h-3.5" /> 退出
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="flex border-b border-border px-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => !tab.requireMember || isMember ? handleTabChange(tab.id) : undefined}
                disabled={tab.requireMember && !isMember}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-all relative ${
                  tab.requireMember && !isMember ? 'text-muted-foreground/50 cursor-not-allowed' :
                  currentTab === tab.id ? 'text-primary-light' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-xs ${currentTab === tab.id ? '' : ''}`}>{tab.count}</span>
                )}
                {currentTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
            ))}
          </div>

          <div className="p-5">
            {currentTab === 'overview' && (
              <TeamOverview team={team} statistics={statistics} teamId={teamId} />
            )}
            {currentTab === 'assignments' && (
              <AssignmentsTab teamId={teamId} assignments={assignments} loading={assignmentsLoading} filter={assignmentFilter} setFilter={setAssignmentFilter} user={user} />
            )}
            {currentTab === 'notes' && (
              <NotesTab teamId={teamId} notes={notes} loading={notesLoading} searchQuery={noteSearchQuery} setSearchQuery={setNoteSearchQuery} showMyNotes={showMyNotes} setShowMyNotes={setShowMyNotes} user={user} />
            )}
            {currentTab === 'members' && (
              <MembersTab teamId={teamId} members={displayMembers} loading={membersLoading} searchQuery={memberSearchQuery} setSearchQuery={setMemberSearchQuery} roleFilter={roleFilter} setRoleFilter={setRoleFilter} isAdmin={isAdmin || false} currentUserId={user?.id} onRefresh={fetchMembers} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamOverview({ team, statistics, teamId }: { team: Team; statistics: any; teamId: string }) {
  return (
    <div className="space-y-5">
      {team.announcement && (
        <div className="rounded-lg p-4 border border-primary/20 bg-primary/5">
          <div className="flex items-start gap-2.5">
            <BookOpen className="w-4 h-4 text-primary-light mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-primary-light mb-1">团队公告</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{team.announcement}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg p-3.5 border border-border/60 bg-muted/20 text-center">
          <div className="text-xl font-bold text-primary-light">{team.stats.memberCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">成员</div>
        </div>
        <div className="rounded-lg p-3.5 border border-border/60 bg-muted/20 text-center">
          <div className="text-xl font-bold text-secondary-light">{team.stats.assignmentCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">作业</div>
        </div>
        <div className="rounded-lg p-3.5 border border-border/60 bg-muted/20 text-center">
          <div className="text-xl font-bold text-warning">{team.stats.noteCount}</div>
          <div className="text-xs text-muted-foreground mt-0.5">笔记</div>
        </div>
      </div>

      {statistics && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg p-3 border border-border/40">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Activity className="w-3 h-3" /> 提交
              </div>
              <div className="text-lg font-semibold text-foreground tabular-nums">{statistics.submissions?.total || 0}</div>
            </div>
            <div className="rounded-lg p-3 border border-border/40">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <CheckCircle2 className="w-3 h-3 text-secondary" /> 通过
              </div>
              <div className="text-lg font-semibold text-secondary tabular-nums">{statistics.problems?.totalSolved || 0}</div>
            </div>
            <div className="rounded-lg p-3 border border-border/40">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Calendar className="w-3 h-3" /> 活跃(7天)
              </div>
              <div className="text-lg font-semibold text-foreground tabular-nums">{statistics.activity?.last7Days || 0}</div>
            </div>
            <div className="rounded-lg p-3 border border-border/40">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <FileText className="w-3 h-3" /> 进行中作业
              </div>
              <div className="text-lg font-semibold text-primary-light tabular-nums">{statistics.assignments?.inProgress || 0}</div>
            </div>
          </div>

          {statistics.recentActivity && statistics.recentActivity.length > 0 && (
            <div className="rounded-lg border border-border/40 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border/40 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">最近提交</span>
              </div>
              <div className="divide-y divide-border/40 max-h-[280px] overflow-y-auto">
                {statistics.recentActivity.slice(0, 6).map((sub: any) => (
                  <div key={sub.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {sub.avatar ? (
                        <img src={sub.avatar} alt="" className="w-7 h-7 rounded-full shrink-0 object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full shrink-0 bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                          <User className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-sm text-foreground truncate block">{sub.username}</span>
                        <span className="text-[11px] text-muted-foreground truncate block">{sub.problemTitle}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                        sub.status === 'AC' ? 'bg-secondary/10 text-secondary' :
                        sub.status === 'Pending' ? 'bg-primary/10 text-primary-light' :
                        'bg-error/10 text-error'
                      }`}>
                        {sub.status === 'AC' ? '通过' : sub.status === 'Pending' ? '评测中' : sub.status}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{new Date(sub.submittedAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!statistics && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          请使用上方标签页查看作业、笔记和成员信息
        </div>
      )}
    </div>
  )
}

function AssignmentsTab({ teamId, assignments, loading, filter, setFilter, user }: any) {
  const getAssignmentStatus = (a: Assignment) => {
    const end = new Date(a.deadline)
    return new Date() > end ? { text: '已结束', color: 'text-error bg-error/10' } : { text: '进行中', color: 'text-secondary bg-secondary/10' }
  }

  const fmtDate = (d?: string) => {
    if (!d) return '-'
    const dt = new Date(d)
    return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
  }

  const filtered = assignments.filter((a: Assignment) => {
    if (filter === 'all') return true
    const end = new Date(a.deadline)
    return filter === 'ongoing' ? new Date() <= end : new Date() > end
  })

  if (loading) return <div className="text-center py-12 text-muted-foreground">加载中...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(['all', 'ongoing', 'ended'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === f ? 'bg-primary text-white' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}>
              {f === 'all' ? '全部' : f === 'ongoing' ? '进行中' : '已结束'}
            </button>
          ))}
        </div>
        {user && (
          <Link href={`/teams/${teamId}/assignments/create`} className="btn-primary btn text-sm px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> 创建
          </Link>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">{filter !== 'all' ? '没有匹配的作业' : '暂无作业'}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a: Assignment) => {
            const st = getAssignmentStatus(a)
            return (
              <Link key={a.id} href={`/teams/${teamId}/assignments/${a.id}`} className="block p-4 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/[0.02] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-foreground text-sm truncate">{a.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${st.color}`}>{st.text}</span>
                    </div>
                    {a.description && <p className="text-xs text-muted-foreground truncate mb-2">{a.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(a.startTime)} ~ {fmtDate(a.deadline)}</span>
                      <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{a.createdBy || '-'}</span>
                      <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" />{a.problemCount || 0} 题</span>
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

function NotesTab({ teamId, notes, loading, searchQuery, setSearchQuery, showMyNotes, setShowMyNotes, user }: any) {
  const filtered = notes.filter((n: Note) =>
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) return <div className="text-center py-12 text-muted-foreground">加载中...</div>

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索笔记..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
        </div>
        {user && (
          <Link href={`/teams/${teamId}/notes/create`} className="btn-primary btn text-sm px-3 py-2 whitespace-nowrap">
            <Plus className="w-3.5 h-3.5" /> 创建
          </Link>
        )}
      </div>
      {user && (
        <div className="flex gap-1.5">
          <button onClick={() => setShowMyNotes(false)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${!showMyNotes ? 'bg-primary text-white' : 'bg-muted/50 text-muted-foreground'}`}>全部</button>
          <button onClick={() => setShowMyNotes(true)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${showMyNotes ? 'bg-primary text-white' : 'bg-muted/50 text-muted-foreground'}`}>我的</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">{searchQuery || showMyNotes ? '没有匹配的笔记' : '暂无笔记'}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((n: Note) => (
            <Link key={n.id} href={`/teams/${teamId}/notes/${n.id}`} className="block p-4 rounded-lg border border-border hover:border-primary/30 transition-colors">
              <h3 className="font-medium text-foreground text-sm line-clamp-1">{n.title}</h3>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.content.replace(/[#*`_\[\]]/g, '').substring(0, 80)}</p>
              <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                <span>{n.author?.nickname || n.author?.username || '匿名'}</span>
                <span>{new Date(n.createdAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function MembersTab({ teamId, members, loading, searchQuery, setSearchQuery, roleFilter, setRoleFilter, isAdmin, currentUserId, onRefresh }: any) {
  const filtered = members.filter((m: TeamMember) =>
    (!searchQuery || m.username?.toLowerCase().includes(searchQuery.toLowerCase()) || m.nickname?.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (!roleFilter || m.role === roleFilter)
  )

  const getRoleBadge = (r: string) => {
    const b: Record<string, any> = { owner: { t: '所有者', c: 'bg-accent/10 text-accent' }, admin: { t: '管理员', c: 'bg-primary/10 text-primary-light' }, member: { t: '成员', c: 'bg-muted/50 text-muted-foreground' } }
    const badge = b[r] || b.member
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.c}`}>{badge.t}</span>
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground">加载中...</div>

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索成员..." className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary">
          <option value="">全部角色</option><option value="owner">所有者</option><option value="admin">管理员</option><option value="member">成员</option>
        </select>
        {isAdmin && (
          <Link href={`/teams/${teamId}/invites`} className="btn-primary btn text-sm px-3 py-2 whitespace-nowrap">
            <UserPlus className="w-3.5 h-3.5" /> 邀请
          </Link>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">暂无成员</div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">成员</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">角色</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">加入时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((m: TeamMember) => (
                <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {m.avatar ? <img src={m.avatar} alt="" className="w-7 h-7 rounded-full object-cover" /> :
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center"><User className="w-3.5 h-3.5 text-white" /></div>}
                      <div>
                        <span className="font-medium text-foreground text-sm">{m.remark || m.nickname || m.username}</span>
                        <span className="text-[11px] text-muted-foreground ml-1">@{m.username}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{getRoleBadge(m.role)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{new Date(m.joinedAt).toLocaleDateString('zh-CN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
