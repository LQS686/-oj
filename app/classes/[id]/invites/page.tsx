'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import {
  Mail,
  Plus,
  Trash2,
  Copy,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  UserPlus,
  Send,
} from 'lucide-react'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { useClass } from '@/hooks/useClass'

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
  classId: string
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

export default function ClassInvitesPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const classId = params.id as string
  const { classData } = useClass(classId)

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

      const response = await fetchWithAuth(`/api/classes/${classId}/invites`)
      const data = await response.json()

      if (data.success) {
        setInvites(data.data)
      } else {
        setError(data.error || '获取邀请码列表失败')
      }
    } catch {
      setError('获取邀请码列表失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchDirectInvites = async () => {
    try {
      const response = await fetchWithAuth(`/api/classes/${classId}/invites/direct`)
      const data = await response.json()

      if (data.success) {
        setDirectInvites(data.data)
      }
    } catch (err) {
      logger.error('获取直接邀请列表失败', err)
    }
  }

  const handleCreateInvite = async () => {
    try {
      setCreating(true)

      const body: { maxUses: number; expiresAt?: string } = {
        maxUses: parseInt(maxUses, 10),
      }

      if (expiresAt) {
        body.expiresAt = new Date(expiresAt).toISOString()
      }

      const response = await fetchWithAuth(`/api/classes/${classId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    } catch {
      alert('创建邀请码失败')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteInvite = async (inviteId: string) => {
    if (!confirm('确定要删除这个邀请码吗？')) return

    try {
      const response = await fetchWithAuth(`/api/classes/${classId}/invites/${inviteId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (data.success) {
        fetchInvites()
      } else {
        alert(data.error || '删除邀请码失败')
      }
    } catch {
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

      const response = await fetchWithAuth(`/api/classes/${classId}/invites/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: inviteeUsername,
          message: inviteMessage,
        }),
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
    } catch {
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
    const badges: Record<string, { text: string; className: string; icon: typeof CheckCircle }> = {
      active: { text: '活跃', className: 'bg-secondary/10 text-secondary', icon: CheckCircle },
      expired: { text: '已过期', className: 'bg-warning/10 text-warning', icon: Clock },
      exhausted: { text: '已用完', className: 'bg-error/10 text-error', icon: XCircle },
    }

    const badge = badges[status] || badges.active
    const Icon = badge.icon

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
      >
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
      expired: { text: '已过期', className: 'bg-muted text-muted-foreground' },
    }
    const item = map[status] || map.pending
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${item.className}`}
      >
        {item.text}
      </span>
    )
  }

  if (loading) {
    return <PageLoading label="加载邀请管理中..." />
  }

  const toolbar = (
    <div className="flex border-b border-border -mb-px" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={currentTab === 'code'}
        onClick={() => setCurrentTab('code')}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          currentTab === 'code'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        邀请码 ({invites.length})
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={currentTab === 'direct'}
        onClick={() => setCurrentTab('direct')}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          currentTab === 'direct'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        直接邀请 ({directInvites.length})
      </button>
    </div>
  )

  return (
    <>
      <ClassWorkspaceShell
        classId={classId}
        className={classData?.name}
        title="邀请管理"
        description="管理邀请码与定向邀请"
        icon={Mail}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowCreateModal(true)} className="btn btn-primary">
              <Plus className="w-4 h-4" />
              创建邀请码
            </button>
            <button
              type="button"
              onClick={() => setShowDirectInviteModal(true)}
              className="btn btn-secondary"
            >
              <Send className="w-4 h-4" />
              直接邀请
            </button>
          </div>
        }
        toolbar={toolbar}
      >
        {error && (
          <div className="mb-4 p-4 bg-error/10 border border-error/20 rounded-lg">
            <p className="text-error text-sm">{error}</p>
          </div>
        )}

        {currentTab === 'code' &&
          (invites.length === 0 ? (
            <div className="bg-card rounded-lg border border-border p-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="text-foreground text-xl font-semibold mb-2">暂无邀请码</div>
              <div className="text-muted-foreground text-sm">点击「创建邀请码」生成分享链接</div>
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        邀请码
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        状态
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        使用情况
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        过期时间
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        创建者
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        创建时间
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invites.map((invite) => (
                      <tr key={invite.id} className="hover:bg-muted transition-colors">
                        <td className="px-6 py-3 whitespace-nowrap">
                          <code className="px-2 py-1 bg-primary/10 rounded text-sm font-mono text-primary">
                            {invite.code}
                          </code>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">{getStatusBadge(invite.status)}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-foreground">
                          {invite.usedCount} / {invite.maxUses === -1 ? '∞' : invite.maxUses}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-muted-foreground">
                          {invite.expiresAt
                            ? new Date(invite.expiresAt).toLocaleDateString('zh-CN')
                            : '永久有效'}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-foreground">
                          {invite.creator.nickname || invite.creator.username}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-muted-foreground">
                          {new Date(invite.createdAt).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyLink(invite.inviteLink)}
                              className="text-primary hover:text-primary/80 p-1"
                              title="复制链接"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteInvite(invite.id)}
                              className="text-error hover:text-error/80 p-1"
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
            </div>
          ))}

        {currentTab === 'direct' &&
          (directInvites.length === 0 ? (
            <div className="bg-card rounded-lg border border-border p-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                <UserPlus className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="text-foreground text-xl font-semibold mb-2">暂无直接邀请</div>
              <div className="text-muted-foreground text-sm">通过用户名向指定用户发送邀请</div>
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        被邀请人
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        邀请人
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        状态
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        留言
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        邀请时间
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        响应时间
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {directInvites.map((invite) => (
                      <tr key={invite.id} className="hover:bg-muted transition-colors">
                        <td className="px-6 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            {invite.invitee.avatar ? (
                              <img
                                src={invite.invitee.avatar}
                                alt=""
                                className="w-8 h-8 rounded-full mr-2 object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mr-2">
                                <Users className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {invite.invitee.nickname || invite.invitee.username}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                @{invite.invitee.username}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-foreground">
                          {invite.inviter.nickname || invite.inviter.username}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          {getDirectStatusBadge(invite.status)}
                        </td>
                        <td className="px-6 py-3 text-sm text-muted-foreground max-w-xs truncate">
                          {invite.message || '-'}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-muted-foreground">
                          {new Date(invite.createdAt).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-muted-foreground">
                          {invite.respondedAt
                            ? new Date(invite.respondedAt).toLocaleDateString('zh-CN')
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
      </ClassWorkspaceShell>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full shadow-md">
            <h3 className="text-lg font-semibold text-foreground mb-4">创建邀请码</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">最大使用次数</label>
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
                <label className="block text-sm font-medium text-foreground mb-2">过期时间（可选）</label>
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
                type="button"
                onClick={handleCreateInvite}
                disabled={creating}
                className="btn btn-primary flex-1 justify-center"
              >
                {creating ? '创建中...' : '创建'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="btn btn-ghost flex-1 justify-center"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {showDirectInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full shadow-md">
            <h3 className="text-lg font-semibold text-foreground mb-4">直接邀请用户</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">用户名 *</label>
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
                <label className="block text-sm font-medium text-foreground mb-2">邀请留言（可选）</label>
                <textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none"
                  placeholder="写下您的邀请留言..."
                />
                <p className="text-xs text-muted-foreground mt-1">邀请将在 7 天后过期</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                type="button"
                onClick={handleSendDirectInvite}
                disabled={inviting || !inviteeUsername.trim()}
                className="btn btn-secondary flex-1 justify-center"
              >
                {inviting ? '发送中...' : '发送邀请'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDirectInviteModal(false)
                  setInviteeUsername('')
                  setInviteMessage('')
                }}
                className="btn btn-ghost flex-1 justify-center"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}