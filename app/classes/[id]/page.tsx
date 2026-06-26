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
import { usePermission } from '@/hooks/usePermission'
import Link from 'next/link'
import AssignmentOpenLink from '@/components/assignment/AssignmentOpenLink'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

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

interface Class {
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

export default function ClassDetailPage() {
 const params = useParams()
 const router = useRouter()
 const { user } = useUser()
 const classId = params.id as string

 const [classData, setClass] = useState<Class | null>(null)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')

 const [assignments, setAssignments] = useState<Assignment[]>([])
 const [assignmentsLoading, setAssignmentsLoading] = useState(false)
 const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'ongoing' | 'ended'>('all')

 const [notes, setNotes] = useState<Note[]>([])
 const [notesLoading, setNotesLoading] = useState(false)

 // 注意：usePermission 必须在所有 early return 之前调用（Rules of Hooks）
 const canManageMembers = usePermission('class.member.manage')
 useDocumentTitle(classData?.name)

 useEffect(() => {
 fetchClassDetail()
 }, [classId])

 useEffect(() => {
 fetchAssignments()
 fetchNotes()
 }, [classId])

 const fetchClassDetail = async () => {
 try {
 setLoading(true)
 const response = await fetch(`/api/classes/${classId}`)
 const data = await response.json()
 if (data.success) setClass(data.data)
 else setError(data.error || '加载失败')
 } catch { setError('网络错误') }
 finally { setLoading(false) }
 }

 const fetchAssignments = async () => {
 try {
 setAssignmentsLoading(true)
 const response = await fetch(`/api/classes/${classId}/assignments`)
 const data = await response.json()
 if (data.success) setAssignments(data.data?.assignments || [])
 } catch {} finally { setAssignmentsLoading(false) }
 }

 const fetchNotes = async () => {
 try {
 setNotesLoading(true)
 const response = await fetch(`/api/classes/${classId}/notes`)
 const data = await response.json()
 if (data.success) setNotes(data.data?.notes || [])
 } catch {} finally { setNotesLoading(false) }
 }

 const handleJoinClass = async () => {
 if (!user) { router.push('/login'); return }
 const message = prompt('请输入申请理由（可选）:')
 if (message === null) return
 try {
 const res = await fetchWithAuth(`/api/classes/${classId}/requests`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ message })
 })
 const d = await res.json()
 alert(d.success ? '申请已提交，请等待管理员审批！' : (d.error || '提交申请失败'))
 } catch { alert('网络错误') }
 }

 const handleLeaveClass = async () => {
 if (!confirm('确定要退出班级吗？')) return
 try {
 const res = await fetchWithAuth(`/api/classes/${classId}/members?userId=${user?.id}`, { method: 'DELETE' })
 const d = await res.json()
 if (d.success) router.push('/classes')
 else alert(d.error || '退出失败')
 } catch { alert('网络错误') }
 }

 if (loading) return <PageLoading label="加载班级中..." />

 if (error || !classData) {
 return (
 <ClassWorkspaceShell classId={classId} title="班级" icon={Users}>
 <div className="card-static rounded-lg p-8 text-center border border-border">
 <p className="text-foreground font-medium mb-4">{error || '班级不存在'}</p>
 <Link href="/classes" className="btn btn-primary">
 返回班级列表
 </Link>
 </div>
 </ClassWorkspaceShell>
 )
 }

 const isMember = !!classData.members.find((m: any) => m.userId === user?.id)
 const isAdmin =
 isMember &&
 ['owner', 'assistant'].includes(
 classData.members.find((m: any) => m.userId === user?.id)?.role
 )
 const memberRole = classData.members.find((m: any) => m.userId === user?.id)?.role

 const statsBar = (
 <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
 <span>
 <strong className="text-foreground">{classData.stats?.memberCount ?? classData.members?.length ?? 0}</strong>{' '}
 名成员
 </span>
 <span>
 <strong className="text-foreground">{classData.stats?.assignmentCount ?? assignments.length}</strong>{' '}
 个作业
 </span>
 <span>
 <strong className="text-foreground">{classData.stats?.noteCount ?? notes.length}</strong> 篇笔记
 </span>
 {classData.isPublic ? (
 <span className="inline-flex items-center gap-1">
 <Globe className="w-3.5 h-3.5" /> 公开班级
 </span>
 ) : (
 <span className="inline-flex items-center gap-1">
 <Lock className="w-3.5 h-3.5" /> 私有班级
 </span>
 )}
 </div>
 )

 return (
 <ClassWorkspaceShell
 classId={classId}
 className={classData.name}
 title={classData.name}
 description={classData.description || '班级教学概览：作业与笔记动态'}
 icon={Users}
 actions={
 <div className="flex gap-2 flex-wrap">
 {isMember && isAdmin && canManageMembers && (
 <Link href={`/classes/${classId}/manage`} className="btn btn-ghost btn-sm border border-border">
 <Settings className="w-4 h-4" /> 管理
 </Link>
 )}
 {!isMember && (
 <button type="button" onClick={handleJoinClass} className="btn btn-primary btn-sm">
 <UserPlus className="w-4 h-4" /> 申请加入
 </button>
 )}
 {isMember && memberRole !== 'owner' && (
 <button type="button" onClick={handleLeaveClass} className="btn btn-ghost btn-sm border border-border text-error">
 <LogOut className="w-4 h-4" /> 退出
 </button>
 )}
 </div>
 }
 >
 {statsBar}
 {classData.announcement && (
 <div className="card-static rounded-lg p-4 border border-border mb-4 text-sm">
 <span className="font-medium text-foreground">公告：</span>
 <span className="text-muted-foreground">{classData.announcement}</span>
 </div>
 )}

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
 <div className="px-4 py-3 border-b border-border flex items-center justify-between">
 <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><FileText className="w-4 h-4" /> 作业</h2>
 {user && (
 <Link href={`/classes/${classId}/assignments/create`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-light hover:text-primary transition-colors">
 <Plus className="w-3.5 h-3.5" /> 创建
 </Link>
 )}
 </div>
 <div className="p-4">
 <div className="flex gap-1.5 mb-3">
 {(['all', 'ongoing', 'ended'] as const).map(f => (
 <button key={f} onClick={() => setAssignmentFilter(f)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
 assignmentFilter === f ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted'
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
 <AssignmentOpenLink
 key={a.id}
 href={`/classes/${classId}/assignments/${a.id}`}
 assignmentTitle={a.title}
 classLabel={classData.name}
 className="block p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/[0.02] transition-colors"
 >
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
 </AssignmentOpenLink>
 )
 })}
 </div>
 )}
 </div>
 </div>

 <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
 <div className="px-4 py-3 border-b border-border flex items-center justify-between">
 <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> 笔记</h2>
 {user && (
 <Link href={`/classes/${classId}/notes/create`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-light hover:text-primary transition-colors">
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
 <Link key={n.id} href={`/classes/${classId}/notes/${n.id}`} className="block p-3 rounded-lg border border-border hover:border-primary/30 transition-colors">
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
 </ClassWorkspaceShell>
 )
}
