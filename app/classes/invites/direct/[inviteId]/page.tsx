'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import { Mail, Users, Check, X, Clock, Calendar, AlertCircle, UserCheck } from 'lucide-react'
import { EducationalPageShell, PageLoading } from '@/components/common'
import { formatDateTime } from '@/lib/utils'

interface InviteDetail {
  invite: {
    id: string
    classId: string
    status: 'pending' | 'accepted' | 'rejected' | 'expired'
    message?: string
    expiresAt?: string
    createdAt: string
  }
  classData: {
    id: string
    name: string
    description?: string
    avatar?: string
  } | null
  inviter: {
    id: string
    username: string
    nickname?: string
    avatar?: string
  } | null
}

export default function DirectInviteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const inviteId = params.inviteId as string

  const [inviteDetail, setInviteDetail] = useState<InviteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    fetchInviteDetail()
  }, [user, inviteId])

  const fetchInviteDetail = async () => {
    try {
      setLoading(true)

      const response = await fetchWithCookie(`/api/classes/invites/direct/${inviteId}`)
      const data = await response.json()

      if (data.success) {
        setInviteDetail(data.data)
      } else {
        setError(data.error || '获取邀请详情失败')
      }
    } catch {
      setError('获取邀请详情失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    if (!confirm('确定要接受此邀请吗？')) return

    try {
      setProcessing(true)

      const response = await fetchWithCookie(`/api/classes/invites/direct/${inviteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      })

      const data = await response.json()

      if (data.success) {
        alert('您已成功加入班级！')
        router.push(`/classes/${data.data.classId}`)
      } else {
        alert(data.error || '接受邀请失败')
      }
    } catch {
      alert('接受邀请失败')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!confirm('确定要拒绝此邀请吗？')) return

    try {
      setProcessing(true)

      const response = await fetchWithCookie(`/api/classes/invites/direct/${inviteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })

      const data = await response.json()

      if (data.success) {
        alert('您已拒绝此邀请')
        router.push('/classes')
      } else {
        alert(data.error || '拒绝邀请失败')
      }
    } catch {
      alert('拒绝邀请失败')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return <PageLoading label="加载邀请详情中..." />
  }

  if (error || !inviteDetail) {
    return (
      <EducationalPageShell
        title="班级邀请"
        icon={Mail}
        backHref="/classes"
        backLabel="返回班级列表"
        width="narrow"
      >
        <div className="bg-card rounded-lg border border-border p-10 text-center">
          <AlertCircle className="w-10 h-10 text-error mx-auto mb-3" />
          <p className="text-error mb-4">{error || '邀请不存在'}</p>
          <Link href="/classes" className="btn btn-primary">
            返回班级列表
          </Link>
        </div>
      </EducationalPageShell>
    )
  }

  const { invite, classData, inviter } = inviteDetail

  return (
    <EducationalPageShell
      title="班级邀请"
      description="查看邀请详情并接受或拒绝"
      icon={Mail}
      backHref="/classes"
      backLabel="返回班级列表"
      width="narrow"
    >
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {classData && (
          <div className="flex items-center gap-4 p-5 border-b border-border">
            {classData.avatar ? (
              <img src={classData.avatar} alt={classData.name} className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center">
                <Users className="w-7 h-7 text-white" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-foreground truncate">{classData.name}</h2>
              {classData.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{classData.description}</p>
              )}
            </div>
          </div>
        )}

        <div className="p-5 space-y-5">
          {inviter && (
            <div className="flex items-center gap-3">
              {inviter.avatar ? (
                <img src={inviter.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">邀请人</p>
                <p className="font-medium text-foreground text-sm">
                  {inviter.nickname || inviter.username}
                </p>
              </div>
            </div>
          )}

          {invite.message && (
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground mb-1">邀请留言</p>
              <p className="text-sm text-foreground">{invite.message}</p>
            </div>
          )}

          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0" />
              <span>邀请时间：{formatDateTime(invite.createdAt)}</span>
            </div>
            {invite.expiresAt && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0" />
                <span>过期时间：{formatDateTime(invite.expiresAt)}</span>
              </div>
            )}
          </div>

          {invite.status !== 'pending' && (
            <div className="rounded-lg border border-border p-6 text-center">
              {invite.status === 'accepted' && (
                <>
                  <Check className="w-10 h-10 text-secondary mx-auto mb-2" />
                  <p className="font-semibold text-foreground">您已接受此邀请</p>
                </>
              )}
              {invite.status === 'rejected' && (
                <>
                  <X className="w-10 h-10 text-error mx-auto mb-2" />
                  <p className="font-semibold text-foreground">您已拒绝此邀请</p>
                </>
              )}
              {invite.status === 'expired' && (
                <>
                  <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="font-semibold text-foreground">此邀请已过期</p>
                </>
              )}
            </div>
          )}

          {invite.status === 'pending' && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAccept}
                disabled={processing}
                className="btn btn-secondary flex-1 justify-center"
              >
                <Check className="w-4 h-4" />
                接受邀请
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={processing}
                className="btn btn-ghost flex-1 justify-center text-error hover:bg-error/10"
              >
                <X className="w-4 h-4" />
                拒绝邀请
              </button>
            </div>
          )}

          {invite.status !== 'pending' && (
            <Link href="/classes" className="btn btn-ghost w-full justify-center">
              返回班级列表
            </Link>
          )}
        </div>
      </div>
    </EducationalPageShell>
  )
}