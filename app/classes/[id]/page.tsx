'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  Users,
  BookOpen,
  FileText,
  UserPlus,
  LogOut,
  Megaphone,
  Clock,
  User,
  Globe,
  Lock,
  Plus,
  Pencil,
  Trash2,
  Crown,
  Calendar,
} from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth, fetchWithCookie } from '@/lib/api/base'
import Link from 'next/link'
import AssignmentOpenLink from '@/components/assignment/AssignmentOpenLink'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import ClassManageInlinePanel from '@/components/class/ClassManageInlinePanel'
import CreateAssignmentModal from '@/components/class/CreateAssignmentModal'
import EditAssignmentModal from '@/components/class/EditAssignmentModal'
import { classRoleDisplayLabel, normalizeClassRoleToApi } from '@/lib/class/roles'

interface Assignment {
  id: string
  title: string
  startTime?: string
  deadline: string
  problemCount: number
  createdByName?: string
  createdBy?: string
}

interface Note {
  id: string
  title: string
  content: string
  author: { nickname?: string; username?: string }
  createdAt: string
}

interface ClassMemberRow {
  id: string
  userId: string
  username: string
  nickname?: string
  avatar?: string
  role: string
  joinedAt: string
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
  members: ClassMemberRow[]
  stats: { memberCount: number; assignmentCount: number; noteCount: number }
}

function roleLabel(role: string) {
  return classRoleDisplayLabel(role)
}

function ClassDetailContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab')
  const isManageTab = tab === 'manage'

  const { user } = useUser()
  const classId = params.id as string

  const [classData, setClass] = useState<Class | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [notesLoading, setNotesLoading] = useState(false)
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'ongoing' | 'ended'>('all')
  const [createAssignmentOpen, setCreateAssignmentOpen] = useState(false)
  const [editAssignmentOpen, setEditAssignmentOpen] = useState(false)
  const [editAssignmentId, setEditAssignmentId] = useState<string | null>(null)

  useDocumentTitle(classData?.name)

  const fetchClassDetail = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetchWithCookie(`/api/classes/${classId}`)
      const data = await response.json()
      if (data.success) setClass(data.data)
      else setError(data.error || '加载失败')
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [classId])

  const fetchAssignments = useCallback(async () => {
    try {
      setAssignmentsLoading(true)
      const response = await fetchWithCookie(`/api/classes/${classId}/assignments`)
      const data = await response.json()
      if (data.success) setAssignments(data.data?.assignments || [])
    } catch {
      /* ignore */
    } finally {
      setAssignmentsLoading(false)
    }
  }, [classId])

  const fetchNotes = useCallback(async () => {
    try {
      setNotesLoading(true)
      const response = await fetchWithCookie(`/api/classes/${classId}/notes`)
      const data = await response.json()
      if (data.success) setNotes(data.data?.notes || [])
    } catch {
      /* ignore */
    } finally {
      setNotesLoading(false)
    }
  }, [classId])

  useEffect(() => {
    void fetchClassDetail()
  }, [fetchClassDetail])

  useEffect(() => {
    if (!isManageTab) {
      void fetchAssignments()
      void fetchNotes()
    }
  }, [classId, isManageTab, fetchAssignments, fetchNotes])

  useEffect(() => {
    if (searchParams.get('createAssignment') === '1') {
      setCreateAssignmentOpen(true)
      router.replace(`/classes/${classId}`, { scroll: false })
    }
    const editId = searchParams.get('editAssignment')
    if (editId) {
      setEditAssignmentId(editId)
      setEditAssignmentOpen(true)
      router.replace(`/classes/${classId}`, { scroll: false })
    }
  }, [searchParams, classId, router])

  const handleJoinClass = async () => {
    if (!user) {
      router.push('/login')
      return
    }
    const message = prompt('请输入申请理由（可选）:')
    if (message === null) return
    try {
      const res = await fetchWithAuth(`/api/classes/${classId}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const d = await res.json()
      alert(d.success ? '申请已提交，请等待管理员审批！' : d.error || '提交申请失败')
    } catch {
      alert('网络错误')
    }
  }

  const handleLeaveClass = async () => {
    if (!confirm('确定要退出班级吗？')) return
    if (!user?.id) return
    try {
      const res = await fetchWithAuth(`/api/classes/${classId}/members/${user.id}`, {
        method: 'DELETE',
      })
      const d = await res.json()
      if (d.success) router.push('/classes')
      else alert(d.error || '退出失败')
    } catch {
      alert('网络错误')
    }
  }

  const patchMemberRole = async (targetUserId: string, role: 'student' | 'assistant') => {
    try {
      const res = await fetchWithAuth(`/api/classes/${classId}/members/${targetUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const data = await res.json()
      if (data.success) void fetchClassDetail()
      else alert(data.error || '更新角色失败')
    } catch {
      alert('网络错误')
    }
  }

  const removeMember = async (targetUserId: string, name: string) => {
    if (!confirm(`确定移除「${name}」？`)) return
    try {
      const res = await fetchWithAuth(`/api/classes/${classId}/members/${targetUserId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) void fetchClassDetail()
      else alert(data.error || '移除失败')
    } catch {
      alert('网络错误')
    }
  }

  const canManageTarget = useCallback(
    (targetRole: string, operatorRole: string) => {
      const op = normalizeClassRoleToApi(operatorRole)
      const tgt = normalizeClassRoleToApi(targetRole)
      if (op === 'owner') return tgt !== 'owner'
      if (op === 'assistant') return tgt === 'student'
      return false
    },
    []
  )

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

  const myMember = classData.members.find((m) => m.userId === user?.id)
  const isMember = !!myMember
  const operatorRole = myMember ? normalizeClassRoleToApi(myMember.role) : ''
  const isClassAdmin = operatorRole === 'owner' || operatorRole === 'assistant'

  const ownerMember = classData.members.find((m) => m.userId === classData.ownerId)
  const teacherCount = classData.members.filter(
    (m) => normalizeClassRoleToApi(m.role) === 'assistant'
  ).length
  const studentCount = classData.members.filter(
    (m) => normalizeClassRoleToApi(m.role) === 'student'
  ).length

  const roleSortOrder = (role: string) => {
    const r = normalizeClassRoleToApi(role)
    if (r === 'owner') return 0
    if (r === 'assistant') return 1
    if (r === 'student') return 2
    return 3
  }
  const sortedMembers = [...classData.members].sort(
    (a, b) => roleSortOrder(a.role) - roleSortOrder(b.role)
  )

  const filteredAssignments = assignments.filter((a) => {
    if (assignmentFilter === 'all') return true
    const end = new Date(a.deadline)
    return assignmentFilter === 'ongoing' ? new Date() <= end : new Date() > end
  })

  const fmt = (d?: string) =>
    d
      ? `${new Date(d).getMonth() + 1}/${new Date(d).getDate()} ${String(new Date(d).getHours()).padStart(2, '0')}:${String(new Date(d).getMinutes()).padStart(2, '0')}`
      : '-'

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData.name}
      title={classData.name}
      icon={Users}
      showBack={false}
      actions={
        <div className="flex gap-2 flex-wrap">
          {!isMember && (
            <button type="button" onClick={handleJoinClass} className="btn btn-primary btn-sm">
              <UserPlus className="w-4 h-4" /> 申请加入
            </button>
          )}
          {isMember && operatorRole !== 'owner' && (
            <button
              type="button"
              onClick={handleLeaveClass}
              className="btn btn-ghost btn-sm border border-border text-error"
            >
              <LogOut className="w-4 h-4" /> 退出
            </button>
          )}
        </div>
      }
    >
      {isManageTab ? (
        isClassAdmin ? (
          <ClassManageInlinePanel
            classId={classId}
            currentUserId={user?.id}
            onChanged={fetchClassDetail}
          />
        ) : (
          <div className="card-static rounded-lg p-8 text-center text-muted-foreground text-sm">
            仅班级管理员或老师可访问管理功能
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <div className="card-static rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-primary-light" />
                <h2 className="text-sm font-semibold text-foreground">班级公告</h2>
              </div>
              <div className="p-4 text-sm text-muted-foreground min-h-[4rem]">
                {classData.announcement?.trim() ? (
                  <p className="text-foreground whitespace-pre-wrap">{classData.announcement}</p>
                ) : (
                  '暂无公告'
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <FileText className="w-4 h-4" /> 作业
                  </h2>
                  {user && isClassAdmin && (
                    <button
                      type="button"
                      onClick={() => setCreateAssignmentOpen(true)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-light hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" /> 创建
                    </button>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex gap-1.5 mb-3">
                    {(['all', 'ongoing', 'ended'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setAssignmentFilter(f)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                          assignmentFilter === f ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {f === 'all' ? '全部' : f === 'ongoing' ? '进行中' : '已结束'}
                      </button>
                    ))}
                  </div>
                  {assignmentsLoading ? (
                    <p className="text-center py-8 text-sm text-muted-foreground">加载中…</p>
                  ) : filteredAssignments.length === 0 ? (
                    <p className="text-center py-8 text-sm text-muted-foreground">暂无作业</p>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {filteredAssignments.map((a) => {
                        const ended = new Date() > new Date(a.deadline)
                        const status = ended
                          ? { text: '已结束', cls: 'text-error bg-error/10' }
                          : { text: '进行中', cls: 'text-secondary bg-secondary/10' }
                        return (
                          <div
                            key={a.id}
                            className="group relative p-3 rounded-lg border border-border hover:border-primary/30 text-sm"
                          >
                            <AssignmentOpenLink
                              href={`/classes/${classId}/assignments/${a.id}`}
                              assignmentTitle={a.title}
                              classLabel={classData.name}
                              className="block pr-8"
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="font-medium truncate">{a.title}</span>
                                <span className={`text-[11px] px-1.5 py-0.5 rounded-full shrink-0 ${status.cls}`}>
                                  {status.text}
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                                <span className="inline-flex items-center gap-0.5">
                                  <Clock className="w-3 h-3" />
                                  {fmt(a.startTime)} ~ {fmt(a.deadline)}
                                </span>
                                <span>{a.problemCount || 0} 题</span>
                              </div>
                            </AssignmentOpenLink>
                            {isClassAdmin && (
                              <button
                                type="button"
                                title="编辑作业"
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditAssignmentId(a.id)
                                  setEditAssignmentOpen(true)
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4" /> 笔记
                  </h2>
                  {user && isClassAdmin && (
                    <Link
                      href={`/classes/${classId}/notes/create`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-light"
                    >
                      <Plus className="w-3.5 h-3.5" /> 创建
                    </Link>
                  )}
                </div>
                <div className="p-4">
                  {notesLoading ? (
                    <p className="text-center py-8 text-sm text-muted-foreground">加载中…</p>
                  ) : notes.length === 0 ? (
                    <p className="text-center py-8 text-sm text-muted-foreground">暂无笔记</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {notes.map((n) => (
                        <Link
                          key={n.id}
                          href={`/classes/${classId}/notes/${n.id}`}
                          className="block p-3 rounded-lg border border-border hover:border-primary/30 text-sm"
                        >
                          <h3 className="font-medium line-clamp-1">{n.title}</h3>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {n.author?.nickname || n.author?.username || '匿名'} ·{' '}
                            {new Date(n.createdAt).toLocaleDateString('zh-CN')}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="card-static rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" /> 班级成员
                </h2>
                <span className="text-xs text-muted-foreground">{classData.members.length} 人</span>
              </div>
              <div className="p-3 max-h-72 overflow-y-auto space-y-1">
                {sortedMembers.map((m) => {
                  const showAdminActions =
                    isClassAdmin && m.userId !== user?.id && canManageTarget(m.role, operatorRole)
                  return (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center gap-2 p-2 rounded-lg hover:bg-muted/50 text-sm"
                    >
                      {m.avatar ? (
                        <img src={m.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {m.nickname || m.username}
                          {m.role === 'owner' && (
                            <Crown className="w-3.5 h-3.5 inline ml-1 text-amber-500" />
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {roleLabel(m.role)}
                          {m.joinedAt ? (
                            <span className="text-muted-foreground/80">
                              {' '}
                              · 加入{' '}
                              {new Date(m.joinedAt).toLocaleDateString('zh-CN', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                              })}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      {showAdminActions && m.role !== 'owner' && (
                        <div className="flex items-center gap-1 shrink-0">
                          <select
                            className="input py-1 text-xs w-[5.5rem]"
                            value={m.role === 'assistant' ? 'assistant' : 'student'}
                            disabled={m.role === 'owner'}
                            onChange={(e) =>
                              patchMemberRole(m.userId, e.target.value as 'student' | 'assistant')
                            }
                          >
                            <option value="student">学生</option>
                            <option value="assistant">老师</option>
                          </select>
                          {canManageTarget(m.role, operatorRole) && (
                            <button
                              type="button"
                              className="p-1.5 text-error hover:bg-error/10 rounded"
                              title="移除成员"
                              onClick={() => removeMember(m.userId, m.nickname || m.username)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <aside className="card-static rounded-xl border border-border p-4 space-y-4 lg:sticky lg:top-4">
            <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2">
              班级详情
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs mb-0.5">管理员</dt>
                <dd className="text-foreground font-medium">
                  {ownerMember?.nickname || ownerMember?.username || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs mb-0.5">公开度</dt>
                <dd className="text-foreground inline-flex items-center gap-1">
                  {classData.isPublic ? (
                    <>
                      <Globe className="w-3.5 h-3.5 text-secondary" /> 公开班级
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" /> 私有班级
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs mb-0.5">学生数量</dt>
                <dd className="text-foreground font-medium">{studentCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs mb-0.5">老师数量</dt>
                <dd className="text-foreground font-medium">{teacherCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs mb-0.5">创建时间</dt>
                <dd className="text-foreground inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  {new Date(classData.createdAt).toLocaleDateString('zh-CN')}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      )}
      <CreateAssignmentModal
        classId={classId}
        open={createAssignmentOpen}
        onClose={() => setCreateAssignmentOpen(false)}
        onCreated={() => {
          void fetchAssignments()
          void fetchClassDetail()
        }}
      />
      <EditAssignmentModal
        classId={classId}
        assignmentId={editAssignmentId}
        open={editAssignmentOpen}
        onClose={() => {
          setEditAssignmentOpen(false)
          setEditAssignmentId(null)
        }}
        onSaved={() => {
          void fetchAssignments()
          void fetchClassDetail()
        }}
        onDeleted={() => {
          void fetchAssignments()
          void fetchClassDetail()
        }}
      />
    </ClassWorkspaceShell>
  )
}

export default function ClassDetailPage() {
  return (
    <Suspense fallback={<PageLoading label="加载班级中..." />}>
      <ClassDetailContent />
    </Suspense>
  )
}