'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import {
  Users,
  Shield,
  Activity,
  Search,
  UserPlus,
  ArrowLeft,
  Crown
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

export default function TeamMembersPage() {
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
  }, [user, roleFilter, activeFilter, sortBy, sortOrder])

  const fetchMembers = async () => {
    try {
      setLoading(true)

      const queryParams = new URLSearchParams({
        sortBy,
        sortOrder
      })

      if (roleFilter) queryParams.append('role', roleFilter)
      if (activeFilter) queryParams.append('active', activeFilter)

      const response = await fetchWithAuth(`/api/teams/${params.id}?${queryParams}`)

      const data = await response.json()

      if (data.success) {
        setMembers(data.data.members)
        const currentMember = data.data.members.find((m: Member) => m.userId === user?.id)
        setIsAdmin(['owner', 'admin'].includes(currentMember?.role))
      } else {
        setError(data.error || '获取成员列表失败')
      }
    } catch (err) {
      setError('获取成员列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleViewActivity = (memberId: string) => {
    router.push(`/teams/${params.id}/members/${memberId}/activity`)
  }

  const handleManagePermissions = (memberId: string) => {
    router.push(`/teams/${params.id}/members/${memberId}/permissions`)
  }

  const getRoleBadge = (role: string) => {
    const badges: Record<string, { text: string; color: string }> = {
      owner: { text: '所有者', color: 'tag-warning' },
      admin: { text: '管理员', color: 'tag-primary' },
      member: { text: '成员', color: 'tag' }
    }

    const badge = badges[role] || badges.member
    return (
      <span className={`tag ${badge.color}`}>
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
      return { text: '活跃', color: 'text-secondary-light' }
    }
    return { text: '不活跃', color: 'text-muted-foreground' }
  }

  const filteredMembers = members.filter(m => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        m.username?.toLowerCase().includes(query) ||
        m.nickname?.toLowerCase().includes(query)
      )
    }
    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
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
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link
            href={`/teams/${params.id}`}
            className="text-muted-foreground hover:text-primary-light transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            团队详情
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">成员管理</span>
        </div>

        <div className="card-static rounded-2xl p-6 mb-6">
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
                href={`/teams/${params.id}/invites`}
                className="btn btn-primary"
              >
                <UserPlus className="w-4 h-4" />
                邀请成员
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索用户名或昵称..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-11"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="input"
            >
              <option value="">全部角色</option>
              <option value="owner">所有者</option>
              <option value="admin">管理员</option>
              <option value="member">成员</option>
            </select>

            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="input"
            >
              <option value="">全部活跃度</option>
              <option value="true">活跃</option>
              <option value="false">不活跃</option>
            </select>

            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split('-')
                setSortBy(newSortBy)
                setSortOrder(newSortOrder)
              }}
              className="input"
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

        {filteredMembers.length === 0 ? (
          <div className="card-static rounded-2xl p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
              <Users className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">
              {searchQuery ? '没有找到匹配的成员' : '暂无成员'}
            </div>
            <div className="text-muted-foreground">
              {searchQuery ? '尝试其他搜索条件' : '邀请成员加入团队吧'}
            </div>
          </div>
        ) : (
          <div className="card-static rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-muted/30">
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
                <tbody className="divide-y divide-border">
                  {filteredMembers.map((member) => {
                    const activityStatus = getActivityStatus(member.lastActiveAt)
                    return (
                      <tr key={member.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {member.avatar ? (
                              <img
                                src={member.avatar}
                                alt={member.username}
                                className="w-10 h-10 rounded-full mr-3 ring-2 ring-primary/20"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mr-3">
                                <Users className="w-5 h-5 text-white" />
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {member.nickname || member.username}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                @{member.username}
                              </div>
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {member.lastActiveAt
                            ? new Date(member.lastActiveAt).toLocaleDateString('zh-CN')
                            : '从未活跃'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewActivity(member.userId)}
                              className="text-primary-light hover:text-primary flex items-center gap-1 transition-colors"
                              title="查看活动"
                            >
                              <Activity className="w-4 h-4" />
                            </button>
                            {isAdmin && member.role !== 'owner' && (
                              <button
                                onClick={() => handleManagePermissions(member.userId)}
                                className="text-muted-foreground hover:text-primary-light flex items-center gap-1 transition-colors"
                                title="管理权限"
                              >
                                <Shield className="w-4 h-4" />
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
          <div className="mt-4 p-4 card-static rounded-xl border border-error/30 bg-error/5">
            <p className="text-error">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
