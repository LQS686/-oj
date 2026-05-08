'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Users,
  BookOpen,
  FileText,
  UserPlus,
  LogOut,
  Settings,
  Plus,
  Clock,
  User,
  Search,
  Globe,
  Lock
} from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import Link from 'next/link'

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
  createdByName?: string
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
  members: any[]
  stats: {
    memberCount: number
    assignmentCount: number
    noteCount: number
  }
}

export default function TeamDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const teamId = params.id as string

  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'ongoing' | 'ended'>('all')

  const [notes, setNotes] = useState<Note[]>([])
  const [notesLoading, setNotesLoading] = useState(false)

  useEffect(() => {
    fetchTeamDetail()
  }, [teamId])

  useEffect(() => {
    fetchAssignments()
    fetchNotes()
  }, [teamId])

  const fetchTeamDetail = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/teams/${teamId}`)
      const data = await response.json()
      if (data.success) setTeam(data.data)
      else setError(data.error || '加载失败')
    } catch { setError('网络错误') }
    finally { setLoading(false) }
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
      const response = await fetch(`/api/teams/${teamId}/notes`)
      const data = await response.json()
      if (data.success) setNotes(data.data?.notes || [])
    } catch {} finally { setNotesLoading(false) }
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

  const isMember = !!team.members.find((m: any) => m.userId === user?.id)
  const isAdmin = isMember && ['owner', 'admin'].includes(team.members.find((m: any) => m.userId === user?.id)?.role)

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white dark:bg-card rounded-xl border border-border shadow-sm overflow-hidden mb-4">
          <div className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {team.avatar ? (
                <img src={team.avatar} alt={team.name} className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/20 shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary shrink-0 flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-foreground truncate">{team.name}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{team.stats.memberCount} 成员 · {team.stats.assignmentCount} 作业 · {team.stats.noteCount} 笔记</p>
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
                  <UserPlus className="w-3.5 h-3.5" /> 加入
                </button>
              )}
              {isMember && team.members.find((m: any) => m.userId === user?.id)?.role !== 'owner' && (
                <button onClick={handleLeaveTeam} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-error/10 hover:text-error transition-colors">
                  <LogOut className="w-3.5 h-3.5" /> 退出
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><FileText className="w-4 h-4" /> 作业</h2>
              {user && (
                <Link href={`/teams/${teamId}/assignments/create`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-light hover:text-primary transition-colors">
                  <Plus className="w-3.5 h-3.5" /> 创建
                </Link>
              )}
            </div>
            <div className="p-4">
              <div className="flex gap-1.5 mb-3">
                {(['all', 'ongoing', 'ended'] as const).map(f => (
                  <button key={f} onClick={() => setAssignmentFilter(f)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    assignmentFilter === f ? 'bg-primary text-white' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}>
                    {f === 'all' ? '全部' : f === 'ongoing' ? '进行中' : '已结束'}
                  </button>
                ))}
              </div>

              {assignmentsLoading ? (
                <div className="text-center py-10 text-muted-foreground text-sm">加载中...</div>
              ) : assignments.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">暂无作业</div>
              ) : (
                <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                  {assignments.filter(a => {
                    if (assignmentFilter === 'all') return true
                    const end = new Date(a.deadline)
                    return assignmentFilter === 'ongoing' ? new Date() <= end : new Date() > end
                  }).map(a => {
                    const end = new Date(a.deadline)
                    const status = new Date() > end
                      ? { text: '已结束', cls: 'text-error bg-error/10' }
                      : { text: '进行中', cls: 'text-secondary bg-secondary/10' }
                    const fmt = (d?: string) => d ? `${new Date(d).getMonth()+1}/${new Date(d).getDate()} ${String(new Date(d).getHours()).padStart(2,'0')}:${String(new Date(d).getMinutes()).padStart(2,'0')}` : '-'
                    return (
                      <Link key={a.id} href={`/teams/${teamId}/assignments/${a.id}`} className="block p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/[0.02] transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="font-medium text-foreground text-sm truncate">{a.title}</span>
                              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${status.cls}`}>{status.text}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" />{fmt(a.startTime)} ~ {fmt(a.deadline)}</span>
                              <span className="inline-flex items-center gap-0.5"><User className="w-3 h-3" />{a.createdByName || a.createdBy || '-'}</span>
                              <span>{a.problemCount || 0} 题</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> 笔记</h2>
              {user && (
                <Link href={`/teams/${teamId}/notes/create`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-light hover:text-primary transition-colors">
                  <Plus className="w-3.5 h-3.5" /> 创建
                </Link>
              )}
            </div>
            <div className="p-4">
              {notesLoading ? (
                <div className="text-center py-10 text-muted-foreground text-sm">加载中...</div>
              ) : notes.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">暂无笔记</div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
                  {notes.map(n => (
                    <Link key={n.id} href={`/teams/${teamId}/notes/${n.id}`} className="block p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
                      <h3 className="font-medium text-foreground text-sm line-clamp-1">{n.title}</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.content.replace(/[#*`_\[\]]/g, '').substring(0, 80)}</p>
                      <div className="flex items-center justify-between mt-1.5 text-[11px] text-muted-foreground">
                        <span>{n.author?.nickname || n.author?.username || '匿名'}</span>
                        <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
