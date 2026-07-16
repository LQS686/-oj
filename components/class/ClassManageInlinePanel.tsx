'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithAuth, fetchWithCookie } from '@/lib/api/base'
import {
  Mail,
  Send,
  ClipboardList,
  Check,
  X,
  Settings,
  Megaphone,
  Globe,
  Lock,
  Save,
  Trash2,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

type DirectInvite = {
  id: string
  status: string
  message?: string | null
  createdAt: string
  expiresAt?: string | null
  invitee: { id: string; username: string; nickname?: string; avatar?: string }
}

type JoinRequest = {
  id: string
  status: string
  message?: string
  createdAt: string
  applicant: { id: string; username: string; nickname?: string; avatar?: string }
}

type ClassSettings = {
  name: string
  announcement: string
  isPublic: boolean
  maxMembers: number
  ownerId: string
}

const directInviteStatusLabel: Record<string, string> = {
  pending: '待接受',
  accepted: '已接受',
  rejected: '已拒绝',
  expired: '已过期',
}

export default function ClassManageInlinePanel({
  classId,
  currentUserId,
  onChanged,
}: {
  classId: string
  currentUserId?: string
  onChanged?: () => void
}) {
  const router = useRouter()
  const [directInvites, setDirectInvites] = useState<DirectInvite[]>([])
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')
  const [settings, setSettings] = useState<ClassSettings | null>(null)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteHint, setInviteHint] = useState('')

  const loadMembershipData = useCallback(async () => {
    const [dRes, rRes] = await Promise.all([
      fetchWithAuth(`/api/classes/${classId}/invites/direct`),
      fetchWithAuth(`/api/classes/${classId}/requests`),
    ])
    const dData = await dRes.json()
    const rData = await rRes.json()
    if (dData.success) setDirectInvites(dData.data || [])
    if (rData.success) setRequests(rData.data || [])
  }, [classId])

  const loadSettings = useCallback(async () => {
    try {
      setSettingsLoading(true)
      const res = await fetchWithCookie(`/api/classes/${classId}`)
      const data = await res.json()
      if (data.success) {
        const c = data.data
        setSettings({
          name: c.name || '',
          announcement: c.announcement || '',
          isPublic: c.isPublic !== false,
          maxMembers: c.maxMembers ?? 50,
          ownerId: c.ownerId,
        })
      }
    } catch {
      /* ignore */
    } finally {
      setSettingsLoading(false)
    }
  }, [classId])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      await Promise.all([loadMembershipData(), loadSettings()])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [loadMembershipData, loadSettings])

  useEffect(() => {
    void load()
  }, [load])

  const sendDirectInvite = async () => {
    const username = inviteUsername.trim()
    if (!username) {
      setInviteHint('请输入对方用户名')
      return
    }
    try {
      setInviteSending(true)
      setInviteHint('')
      const res = await fetchWithAuth(`/api/classes/${classId}/invites/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          message: inviteMessage.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setInviteUsername('')
        setInviteMessage('')
        setInviteHint('邀请已发送，对方可在通知中接受')
        await loadMembershipData()
        onChanged?.()
      } else {
        setInviteHint(data.error || data.message || '发送失败')
      }
    } catch {
      setInviteHint('发送失败')
    } finally {
      setInviteSending(false)
    }
  }

  const reviewRequest = async (requestId: string, action: 'approve' | 'reject') => {
    const res = await fetchWithAuth(`/api/classes/${classId}/requests/${requestId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    if (data.success) {
      await loadMembershipData()
      onChanged?.()
    } else alert(data.error || data.message || '操作失败')
  }

  const saveSettings = async () => {
    if (!settings) return
    if (!settings.name.trim() || settings.name.trim().length < 2) {
      setSettingsMsg('班级名称至少 2 个字符')
      return
    }
    try {
      setSettingsSaving(true)
      setSettingsMsg('')
      const res = await fetchWithAuth(`/api/classes/${classId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settings.name.trim(),
          announcement: settings.announcement.trim() || null,
          isPublic: settings.isPublic,
          maxMembers: settings.maxMembers,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSettingsMsg('已保存')
        onChanged?.()
      } else {
        setSettingsMsg(data.error || data.message || '保存失败')
      }
    } catch {
      setSettingsMsg('保存失败')
    } finally {
      setSettingsSaving(false)
    }
  }

  const dissolveClass = async () => {
    if (!confirm('确定解散班级？此操作不可恢复。')) return
    const res = await fetchWithAuth(`/api/classes/${classId}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) {
      router.push('/classes')
    } else {
      alert(data.error || data.message || '解散失败')
    }
  }

  const pending = requests.filter((r) => r.status === 'pending')
  const isOwner = settings && currentUserId && settings.ownerId === currentUserId

  if (loading && settingsLoading) {
    return <p className="text-sm text-muted-foreground py-6 text-center">加载管理信息…</p>
  }

  return (
    <div className="space-y-6">
      <section className="card-static rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary-light" />
          <h3 className="text-sm font-semibold text-foreground">班级设置</h3>
        </div>
        <div className="p-4 space-y-4">
          {settingsLoading || !settings ? (
            <p className="text-sm text-muted-foreground">加载设置…</p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">班级名称</label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  className="input w-full text-sm"
                  maxLength={20}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1 flex items-center gap-1">
                  <Megaphone className="w-3.5 h-3.5" /> 班级公告
                </label>
                <textarea
                  value={settings.announcement}
                  onChange={(e) => setSettings({ ...settings, announcement: e.target.value })}
                  rows={3}
                  placeholder="成员在概览页可见"
                  className="input w-full text-sm resize-none"
                  maxLength={2000}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">最大成员数</label>
                <input
                  type="number"
                  min={2}
                  max={200}
                  value={settings.maxMembers}
                  onChange={(e) =>
                    setSettings({ ...settings, maxMembers: parseInt(e.target.value, 10) || 50 })
                  }
                  className="input w-full text-sm max-w-[8rem]"
                />
              </div>
              <div>
                <span className="block text-xs font-medium text-foreground mb-2">公开度</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, isPublic: true })}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm flex items-center justify-center gap-1.5 ${
                      settings.isPublic ? 'border-primary bg-primary/5 text-primary' : 'border-border'
                    }`}
                  >
                    <Globe className="w-4 h-4" /> 公开
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, isPublic: false })}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm flex items-center justify-center gap-1.5 ${
                      !settings.isPublic ? 'border-primary bg-primary/5 text-primary' : 'border-border'
                    }`}
                  >
                    <Lock className="w-4 h-4" /> 私有
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  公开班级：学生可在班级列表申请加入；私有班级：仅能通过用户名邀请加入。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={settingsSaving}
                  className="btn btn-primary btn-sm inline-flex items-center gap-1"
                >
                  <Save className="w-4 h-4" />
                  {settingsSaving ? '保存中…' : '保存设置'}
                </button>
                {settingsMsg ? (
                  <span className={`text-xs ${settingsMsg === '已保存' ? 'text-secondary' : 'text-error'}`}>
                    {settingsMsg}
                  </span>
                ) : null}
              </div>
              {isOwner && (
                <div className="pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={dissolveClass}
                    className="text-sm text-error hover:underline inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    解散班级
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="card-static rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary-light" />
            邀请成员（用户名）
          </h3>
          <p className="text-xs text-muted-foreground mt-1">输入平台用户名发送邀请，对方接受后加入班级</p>
        </div>
        <div className="p-4 space-y-3 border-b border-border/60">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={inviteUsername}
              onChange={(e) => {
                setInviteUsername(e.target.value)
                setInviteHint('')
              }}
              placeholder="对方用户名"
              className="input flex-1 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void sendDirectInvite())}
            />
            <button
              type="button"
              onClick={sendDirectInvite}
              disabled={inviteSending}
              className="btn btn-primary btn-sm shrink-0 inline-flex items-center gap-1"
            >
              <Send className="w-4 h-4" />
              {inviteSending ? '发送中…' : '发送邀请'}
            </button>
          </div>
          <input
            type="text"
            value={inviteMessage}
            onChange={(e) => setInviteMessage(e.target.value)}
            placeholder="附言（选填）"
            className="input w-full text-sm"
            maxLength={200}
          />
          {inviteHint ? (
            <p className={`text-xs ${inviteHint.includes('已发送') ? 'text-secondary' : 'text-error'}`}>{inviteHint}</p>
          ) : null}
        </div>
        <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
          {directInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无邀请记录</p>
          ) : (
            directInvites.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-border text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {inv.invitee.nickname || inv.invitee.username}
                    <span className="text-muted-foreground font-normal text-xs ml-1">@{inv.invitee.username}</span>
                  </p>
                  {inv.message ? (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{inv.message}</p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatDateTime(inv.createdAt)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {directInviteStatusLabel[inv.status] || inv.status}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card-static rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary-light" />
            加入申请
            {pending.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">待处理 {pending.length}</span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">学生在班级列表提交的加入申请</p>
        </div>
        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无申请</p>
          ) : (
            requests.map((req) => (
              <div key={req.id} className="p-3 rounded-lg border border-border text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {req.applicant.nickname || req.applicant.username}
                    </p>
                    {req.message ? (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{req.message}</p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {formatDateTime(req.createdAt)}
                    </p>
                  </div>
                  {req.status === 'pending' ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="p-1.5 rounded bg-secondary/15 text-secondary hover:bg-secondary/25"
                        title="批准"
                        onClick={() => reviewRequest(req.id, 'approve')}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded bg-error/10 text-error hover:bg-error/20"
                        title="拒绝"
                        onClick={() => reviewRequest(req.id, 'reject')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {req.status === 'approved' ? '已通过' : req.status === 'rejected' ? '已拒绝' : req.status}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}