'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import {
  Mail,
  Plus,
  Trash2,
  Copy,
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  ArrowLeft,
  UserPlus,
  Send
} from 'lucide-react'

interface Invite {
  id: string
  code: string
  maxUses: number
  usedCount: number
  expiresAt?: string
  createdAt: string
  creator: {
    id: string
    username: string
    nickname?: string
  }
  status: 'active' | 'expired' | 'exhausted'
  inviteLink: string
}

interface DirectInvite {
  id: string
  teamId: string
  inviter: {
    id: string
    username: string
    nickname?: string
    avatar?: string
  }
  invitee: {
    id: string
    username: string
    nickname?: string
    avatar?: string
  }
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  message?: string
  expiresAt?: string
  respondedAt?: string
  createdAt: string
}

export default function TeamInvitesPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()

  const [currentTab, setCurrentTab] = useState<'code' | 'direct'>('code')
  const [invites, setInvites] = useState<Invite[]>([])
  const [directInvites, setDirectInvites] = useState<DirectInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDirectInviteModal, setShowDirectInviteModal] = useState(false)

  const [maxUses, setMaxUses] = useState('1')
  const [expiresAt, setExpiresAt] = useState('')
  const [creating, setCreating] = useState(false)

  const [inviteeUsername, setInviteeUsername] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    fetchInvites()
    fetchDirectInvites()
  }, [user])

  const fetchInvites = async () => {
    try {
      setLoading(true)

      const response = await fetchWithAuth(`/api/teams/${params.id}/invites`)

      const data = await response.json()

      if (data.success) {
        setInvites(data.data)
      } else {
        setError(data.error || '获取邀请码列表失败')
      }
    } catch (err) {
      setError('获取邀请码列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchDirectInvites = async () => {
    try {
      const response = await fetchWithAuth(`/api/teams/${params.id}/invites/direct`)

      const data = await response.json()

      if (data.success) {
        setDirectInvites(data.data)
      }
    } catch (err) {
      console.error('获取直接邀请列表失败:', err)
    }
  }

  const handleCreateInvite = async () => {
    try {
      setCreating(true)

      const body: any = {
        maxUses: parseInt(maxUses)
      }

      if (expiresAt) {
        body.expiresAt = new Date(expiresAt).toISOString()
      }

      const response = await fetchWithAuth(`/api/teams/${params.id}/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (data.success) {
        setShowCreateModal(false)
        setMaxUses('1')
        setExpiresAt('')
        fetchInvites()
        navigator.clipboard.writeText(data.data.inviteLink)
        alert('邀请码创建成功！链接已复制到剪贴板')
      } else {
        alert(data.error || '创建邀请码失败')
      }
    } catch (err) {
      alert('创建邀请码失败')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteInvite = async (inviteId: string) => {
    if (!confirm('确定要删除这个邀请码吗？')) return

    try {
      const response = await fetchWithAuth(`/api/teams/${params.id}/invites/${inviteId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        fetchInvites()
      } else {
        alert(data.error || '删除邀请码失败')
      }
    } catch (err) {
      alert('删除邀请码失败')
    }
  }

  const handleSendDirectInvite = async () => {
    if (!inviteeUsername.trim()) {
      alert('请输入用户名')
      return
    }

    try {
      setInviting(true)

      const response = await fetchWithAuth(`/api/teams/${params.id}/invites/direct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: inviteeUsername,
          message: inviteMessage
        })
      })

      const data = await response.json()

      if (data.success) {
        setShowDirectInviteModal(false)
        setInviteeUsername('')
        setInviteMessage('')
        fetchDirectInvites()
        alert('邀请发送成功！')
      } else {
        alert(data.error || '发送邀请失败')
      }
    } catch (err) {
      alert('发送邀请失败')
    } finally {
      setInviting(false)
    }
  }

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link)
    alert('邀请链接已复制到剪贴板')
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { text: string; className: string; icon: any }> = {
      active: { text: '活跃', className: 'bg-secondary/10 text-secondary', icon: CheckCircle },
      expired: { text: '已过期', className: 'bg-warning/10 text-warning', icon: Clock },
      exhausted: { text: '已用完', className: 'bg-error/10 text-error', icon: XCircle }
    }

    const badge = badges[status] || badges.active
    const Icon = badge.icon

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
        <Icon className="w-3 h-3" />
        {badge.text}
      </span>
    )
  }

  const getDirectStatusBadge = (status: string) => {
    const map: Record<string, { text: string; className: string }> = {
      pending: { text: '待响应', className: 'bg-warning/10 text-warning' },
      accepted: { text: '已接受', className: 'bg-secondary/10 text-secondary' },
      rejected: { text: '已拒绝', className: 'bg-error/10 text-error' },
      expired: { text: '已过期', className: 'bg-muted text-muted-foreground' }
    }
    const item = map[status] || map.pending
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.className}`}>{item.text}</span>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => router.push(`/teams/${params.id}`)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          返回团队详情
        </button>

        <div className="bg-white dark:bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">邀请管理</h1>
                  <p className="text-sm text-muted-foreground">管理团队邀请码和直接邀请</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  创建邀请码
                </button>
                <button
                  onClick={() => setShowDirectInviteModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 transition-colors text-sm font-medium"
                >
                  <Send className="w-4 h-4" />
                  直接邀请
                </button>
              </div>
            </div>
          </div>

          <div className="flex border-b border-border/40">
            <button
              onClick={() => setCurrentTab('code')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                currentTab === 'code'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              邀请码列表
            </button>
            <button
              onClick={() => setCurrentTab('direct')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                currentTab === 'direct'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              直接邀请列表
            </button>
          </div>
        </div>

        {currentTab === 'code' && (
          <div className="bg-white dark:bg-card rounded-xl border border-border shadow-sm overflow-hidden mt-6">
            {invites.length === 0 ? (
              <div className="p-12 text-center">
                <Mail className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-foreground">暂无邀请码</p>
                <p className="text-sm text-muted-foreground mt-2">点击上方按钮创建邀请码</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border/40">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        邀请码
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        状态
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        使用情况
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        过期时间
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        创建者
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        创建时间
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {invites.map((invite) => (
                      <tr key={invite.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <code className="px-2 py-1 bg-primary/10 rounded text-sm font-mono text-primary">
                            {invite.code}
                          </code>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(invite.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                          {invite.usedCount} / {invite.maxUses === -1 ? '∞' : invite.maxUses}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {invite.expiresAt
                            ? new Date(invite.expiresAt).toLocaleDateString('zh-CN')
                            : '永久有效'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                          {invite.creator.nickname || invite.creator.username}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {new Date(invite.createdAt).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopyLink(invite.inviteLink)}
                              className="text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                              title="复制链接"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteInvite(invite.id)}
                              className="text-error hover:text-error/80 flex items-center gap-1 transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {currentTab === 'direct' && (
          <div className="bg-white dark:bg-card rounded-xl border border-border shadow-sm overflow-hidden mt-6">
            {directInvites.length === 0 ? (
              <div className="p-12 text-center">
                <UserPlus className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-foreground">暂无直接邀请</p>
                <p className="text-sm text-muted-foreground mt-2">点击上方按钮发送邀请</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border/40">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        被邀请人
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        邀请人
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        状态
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        留言
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        邀请时间
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        响应时间
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {directInvites.map((invite) => (
                      <tr key={invite.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {invite.invitee.avatar ? (
                              <img src={invite.invitee.avatar} alt="" className="w-8 h-8 rounded-full mr-2" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mr-2">
                                <Users className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {invite.invitee.nickname || invite.invitee.username}
                              </div>
                              <div className="text-xs text-muted-foreground">@{invite.invitee.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                          {invite.inviter.nickname || invite.inviter.username}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getDirectStatusBadge(invite.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground max-w-xs truncate">
                          {invite.message || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {new Date(invite.createdAt).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {invite.respondedAt ? new Date(invite.respondedAt).toLocaleDateString('zh-CN') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-error/10 border border-error/20 rounded-lg">
            <p className="text-error">{error}</p>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-foreground mb-4">创建邀请码</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  最大使用次数
                </label>
                <input
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  min="1"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                  placeholder="输入 -1 表示无限次"
                />
                <p className="text-xs text-muted-foreground mt-1">输入 -1 表示无限制使用</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  过期时间（可选）
                </label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">留空表示永久有效</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={handleCreateInvite}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {creating ? '创建中...' : '创建'}
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors text-sm font-medium"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {showDirectInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-foreground mb-4">直接邀请用户</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  用户名 *
                </label>
                <input
                  type="text"
                  value={inviteeUsername}
                  onChange={(e) => setInviteeUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
                  placeholder="输入目标用户的用户名"
                />
                <p className="text-xs text-muted-foreground mt-1">请确保用户名正确</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  邀请留言（可选）
                </label>
                <textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none"
                  placeholder="写下您的邀请留言..."
                />
                <p className="text-xs text-muted-foreground mt-1">邀请将在7天后过期</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={handleSendDirectInvite}
                disabled={inviting || !inviteeUsername.trim()}
                className="flex-1 px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                {inviting ? '发送中...' : '发送邀请'}
              </button>
              <button
                onClick={() => {
                  setShowDirectInviteModal(false)
                  setInviteeUsername('')
                  setInviteMessage('')
                }}
                className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors text-sm font-medium"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
