'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithCookie } from '@/lib/api/base'
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

function statusTone(status: string): string {
  if (status === 'pending') return 'text-accent-light'
  if (status === 'accepted' || status === 'approved') return 'text-secondary'
  if (status === 'rejected' || status === 'expired') return 'text-muted-foreground'
  return 'text-muted-foreground'
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
      fetchWithCookie(`/api/classes/${classId}/invites/direct`),
      fetchWithCookie(`/api/classes/${classId}/requests`),
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
      const res = await fetchWithCookie(`/api/classes/${classId}/invites/direct`, {
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
    const res = await fetchWithCookie(`/api/classes/${classId}/requests/${requestId}`, {
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
      const res = await fetchWithCookie(`/api/classes/${classId}`, {
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
    const res = await fetchWithCookie(`/api/classes/${classId}`, { method: 'DELETE' })
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* 左：班级设置 */}
      <section className="card-static rounded-xl border border-border overflow-hidden lg:sticky lg:top-[72px]">
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
                <label className="block text-xs font-medium text-foreground mb-1.5">班级名称</label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  className="input w-full text-sm"
                  maxLength={20}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5 flex items-center gap-1">
                  <Megaphone className="w-3.5 h-3.5" /> 班级公告
                </label>
                <textarea
                  value={settings.announcement}
                  onChange={(e) => setSettings({ ...settings, announcement: e.target.value })}
                  rows={4}
                  placeholder="成员在概览页可见"
                  className="input w-full text-sm resize-y min-h-[6rem]"
                  maxLength={2000}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[7.5rem_minmax(0,1fr)] gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">最大成员数</label>
                  <input
                    type="number"
                    min={2}
                    max={200}
                    value={settings.maxMembers}
                    onChange={(e) =>
                      setSettings({ ...settings, maxMembers: parseInt(e.target.value, 10) || 50 })
                    }
                    className="input w-full text-sm tabular-nums"
                  />
                </div>
                <div>
                  <span className="block text-xs font-medium text-foreground mb-1.5">公开度</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, isPublic: true })}
                      className={`px-2.5 py-2 rounded-lg border text-sm flex items-center justify-center gap-1.5 transition-colors ${
                        settings.isPublic
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" /> 公开
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, isPublic: false })}
                      className={`px-2.5 py-2 rounded-lg border text-sm flex items-center justify-center gap-1.5 transition-colors ${
                        !settings.isPublic
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" /> 私有
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed -mt-1">
                公开：学生可在班级列表申请加入；私有：仅能通过用户名邀请加入。
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
                <div className="flex items-center gap-2 min-w-0">
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
                    <span
                      className={`text-xs truncate ${
                        settingsMsg === '已保存' ? 'text-secondary' : 'text-error'
                      }`}
                    >
                      {settingsMsg}
                    </span>
                  ) : null}
                </div>
                {isOwner ? (
                  <button
                    type="button"
                    onClick={dissolveClass}
                    className="text-sm text-error hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                    解散班级
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>

      {/* 右：邀请 + 申请 */}
      <div className="space-y-4 min-w-0">
        <section className="card-static rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary-light" />
              邀请成员
            </h3>
            <p className="text-xs text-muted-foreground mt-1">输入平台用户名发送邀请，对方接受后加入</p>
          </div>
          <div className="p-4 space-y-3 border-b border-border/60">
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => {
                  setInviteUsername(e.target.value)
                  setInviteHint('')
                }}
                placeholder="对方用户名"
                className="input flex-1 min-w-0 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void sendDirectInvite())}
              />
              <button
                type="button"
                onClick={sendDirectInvite}
                disabled={inviteSending}
                className="btn btn-primary btn-sm shrink-0 inline-flex items-center gap-1"
              >
                <Send className="w-4 h-4" />
                {inviteSending ? '发送中…' : '发送'}
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
              <p
                className={`text-xs ${
                  inviteHint.includes('已发送') ? 'text-secondary' : 'text-error'
                }`}
              >
                {inviteHint}
              </p>
            ) : null}
          </div>
          <div className="p-3 space-y-2 max-h-56 overflow-y-auto">
            {directInvites.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-5">暂无邀请记录</p>
            ) : (
              directInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {inv.invitee.nickname || inv.invitee.username}
                      <span className="text-muted-foreground font-normal text-xs ml-1">
                        @{inv.invitee.username}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDateTime(inv.createdAt)}
                      {inv.message ? ` · ${inv.message}` : ''}
                    </p>
                  </div>
                  <span className={`text-xs shrink-0 ${statusTone(inv.status)}`}>
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
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium tabular-nums">
                  {pending.length}
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">学生在班级列表提交的加入申请</p>
          </div>
          <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
            {requests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-5">暂无申请</p>
            ) : (
              requests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {req.applicant.nickname || req.applicant.username}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDateTime(req.createdAt)}
                      {req.message ? ` · ${req.message}` : ''}
                    </p>
                  </div>
                  {req.status === 'pending' ? (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="p-1.5 rounded-md bg-secondary/15 text-secondary hover:bg-secondary/25"
                        title="批准"
                        onClick={() => reviewRequest(req.id, 'approve')}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded-md bg-error/10 text-error hover:bg-error/20"
                        title="拒绝"
                        onClick={() => reviewRequest(req.id, 'reject')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span className={`text-xs shrink-0 ${statusTone(req.status)}`}>
                      {req.status === 'approved'
                        ? '已通过'
                        : req.status === 'rejected'
                          ? '已拒绝'
                          : req.status}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
