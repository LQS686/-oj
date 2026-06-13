'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import {
  Users,
  Activity,
  Search,
  UserPlus,
  ArrowLeft,
  Crown,
  Trash2
} from 'lucide-react'
import Link from 'next/link'

interface Member {
  id: string
  userId: string
  username: string
  nickname?: string
  avatar?: string
  role: string
  permissions: any
  joinedAt: string
  lastActiveAt?: string
}

export default function ClassMembersPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  const [roleFilter, setRoleFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('joinedAt')
  const [sortOrder, setSortOrder] = useState('desc')

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    fetchMembers()
  }, [user])

  const fetchMembers = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await fetchWithAuth(`/api/classes/${params.id}`)
      const data = await response.json()

      if (data.success) {
        setMembers(data.data.members || [])
        const currentMember = data.data.members.find((m: Member) => m.userId === user?.id)
        setIsAdmin(['owner', 'assistant'].includes(currentMember?.role))
      } else {
        setError(data.error || '获取成员列表失败')
      }
    } catch (err) {
      setError('获取成员列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveMember = useCallback(async (userId: string, username: string) => {
    if (!confirm(`确定要移除成员 "${username}" 吗？此操作不可撤销。`)) return

    try {
      const res = await fetchWithAuth(`/api/classes/${params.id}/members?userId=${userId}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setMembers(prev => prev.filter(m => m.userId !== userId))
      } else {
        alert(data.error || '移除成员失败')
      }
    } catch {
      alert('移除成员失败')
    }
  }, [params.id])

  const handleRoleChange = useCallback(async (userId: string, newRole: string) => {
    try {
      const res = await fetchWithAuth(`/api/classes/${params.id}/members?userId=${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })
      const data = await res.json()
      if (data.success) {
        setMembers(prev =>
          prev.map(m => m.userId === userId ? { ...m, role: newRole } : m)
        )
      } else {
        alert(data.error || '变更角色失败')
        fetchMembers()
      }
    } catch {
      alert('变更角色失败')
      fetchMembers()
    }
  }, [params.id])

  const handleViewActivity = (memberId: string) => {
    router.push(`/classes/${params.id}/members/${memberId}/activity`)
  }

  const getRoleBadge = (role: string) => {
    const badges: Record<string, { text: string; cls: string }> = {
      owner: { text: '所有者', cls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
      admin: { text: '管理员', cls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary-light' },
      member: { text: '成员', cls: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary/10 text-secondary' }
    }

    const badge = badges[role] || badges.member
    return (
      <span className={badge.cls}>
        <Crown className={`w-3 h-3 mr-1 ${role === 'owner' ? '' : 'hidden'}`} />
        {badge.text}
      </span>
    )
  }

  const getActivityStatus = (lastActiveAt?: string) => {
    if (!lastActiveAt) return { text: '未活跃', color: 'text-muted-foreground' }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const lastActive = new Date(lastActiveAt)

    if (lastActive >= thirtyDaysAgo) {
      return { text: '活跃', color: 'text-emerald-600 dark:text-emerald-400' }
    }
    return { text: '不活跃', color: 'text-muted-foreground' }
  }

  const filteredAndSorted = (() => {
    let result = members.filter(m => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!(m.username?.toLowerCase().includes(query) || m.nickname?.toLowerCase().includes(query))) {
          return false
        }
      }
      if (roleFilter && m.role !== roleFilter) return false
      if (activeFilter) {
        const status = getActivityStatus(m.lastActiveAt)
        const isActive = status.text === '活跃'
        if (activeFilter === 'true' && !isActive) return false
        if (activeFilter === 'false' && isActive) return false
      }
      return true
    })

    result.sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'joinedAt':
          cmp = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
          break
        case 'lastActiveAt':
          cmp = (new Date(a.lastActiveAt || 0).getTime()) - (new Date(b.lastActiveAt || 0).getTime())
          break
        case 'role': {
          const order: Record<string, number> = { owner: 0, admin: 1, member: 2 }
          cmp = (order[a.role] ?? 3) - (order[b.role] ?? 3)
          break
        }
        case 'username':
          cmp = (a.username || '').localeCompare(b.username || '')
          break
        default:
          break
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })

    return result
  })()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-card">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载成员中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-card">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link
            href={`/classes/${params.id}`}
            className="text-muted-foreground hover:text-primary-light transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            班级详情
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">成员管理</span>
        </div>

        <div className="bg-white dark:bg-card rounded-2xl border border-border p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">成员管理</h1>
                <p className="text-sm text-muted-foreground">共 {members.length} 名成员</p>
              </div>
            </div>

            {isAdmin && (
              <Link
                href={`/classes/${params.id}/invites`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-light font-medium hover:bg-primary/90 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                邀请成员
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索用户名或昵称..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-white dark:bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2.5 rounded-lg border border-border bg-white dark:bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            >
              <option value="">全部角色</option>
              <option value="teacher">所有者</option>
              <option value="assistant">管理员</option>
              <option value="student">成员</option>
            </select>

            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="px-3 py-2.5 rounded-lg border border-border bg-white dark:bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            >
              <option value="">全部活跃度</option>
              <option value="true">活跃</option>
              <option value="false">不活跃</option>
            </select>

            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split('-')
                setSortBy(sb)
                setSortOrder(so)
              }}
              className="px-3 py-2.5 rounded-lg border border-border bg-white dark:bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            >
              <option value="joinedAt-desc">加入时间 ↓</option>
              <option value="joinedAt-asc">加入时间 ↑</option>
              <option value="lastActiveAt-desc">活跃时间 ↓</option>
              <option value="lastActiveAt-asc">活跃时间 ↑</option>
              <option value="role-desc">角色 ↓</option>
              <option value="username-asc">用户名 ↑</option>
            </select>
          </div>
        </div>

        {filteredAndSorted.length === 0 ? (
          <div className="bg-white dark:bg-card rounded-2xl border border-border p-16 text-center shadow-sm">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">
              {searchQuery || roleFilter || activeFilter ? '没有找到匹配的成员' : '暂无成员'}
            </div>
            <div className="text-muted-foreground">
              {searchQuery || roleFilter || activeFilter ? '尝试其他搜索条件' : '邀请成员加入班级吧'}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-muted/20">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      用户
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      角色
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      活跃状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      加入时间
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      最后活跃
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredAndSorted.map((member) => {
                    const activityStatus = getActivityStatus(member.lastActiveAt)
                    const isOwner = member.role === 'owner'
                    const isSelf = member.userId === user?.id

                    return (
                      <tr key={member.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {member.avatar ? (
                              <img
                                src={member.avatar}
                                alt={member.username}
                                className="w-10 h-10 rounded-full mr-3 ring-2 ring-primary/20 object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mr-3">
                                <Users className="w-5 h-5 text-white" />
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {member.nickname || member.username}
                                {isSelf && (
                                  <span className="ml-2 text-xs text-muted-foreground">(我)</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                @{member.username}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isAdmin && !isOwner ? (
                            <select
                              defaultValue={member.role}
                              onChange={(e) => handleRoleChange(member.userId, e.target.value)}
                              className="text-sm px-2 py-1 rounded-md border border-border bg-white dark:bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                            >
                              <option value="assistant">管理员</option>
                              <option value="student">成员</option>
                            </select>
                          ) : (
                            getRoleBadge(member.role)
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm font-medium ${activityStatus.color}`}>
                            {activityStatus.text}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {new Date(member.joinedAt).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {member.lastActiveAt
                            ? new Date(member.lastActiveAt).toLocaleDateString('zh-CN')
                            : '从未活跃'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewActivity(member.userId)}
                              className="text-primary-light hover:text-primary flex items-center gap-1 transition-colors p-1.5 rounded-md hover:bg-primary/5"
                              title="查看活动"
                            >
                              <Activity className="w-4 h-4" />
                            </button>
                            {isAdmin && !isOwner && (
                              <button
                                onClick={() => handleRemoveMember(member.userId, member.nickname || member.username)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center gap-1 transition-colors p-1.5 rounded-md"
                                title="移除成员"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
