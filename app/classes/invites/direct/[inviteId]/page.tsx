'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import {
  Mail,
  Users,
  Check,
  X,
  Clock,
  Calendar,
  AlertCircle,
  UserCheck
} from 'lucide-react'

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
  }, [user])

  const fetchInviteDetail = async () => {
    try {
      setLoading(true)

      const response = await fetchWithAuth(`/api/classes/invites/direct/${params.inviteId}`)

      const data = await response.json()

      if (data.success) {
        setInviteDetail(data.data)
      } else {
        setError(data.error || '获取邀请详情失败')
      }
    } catch (err) {
      setError('获取邀请详情失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    if (!confirm('确定要接受此邀请吗？')) return

    try {
      setProcessing(true)

      const response = await fetchWithAuth(`/api/classes/invites/direct/${params.inviteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'accept' })
      })

      const data = await response.json()

      if (data.success) {
        alert('您已成功加入班级！')
        router.push(`/classes/${data.data.classId}`)
      } else {
        alert(data.error || '接受邀请失败')
      }
    } catch (err) {
      alert('接受邀请失败')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!confirm('确定要拒绝此邀请吗？')) return

    try {
      setProcessing(true)

      const response = await fetchWithAuth(`/api/classes/invites/direct/${params.inviteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'reject' })
      })

      const data = await response.json()

      if (data.success) {
        alert('您已拒绝此邀请')
        router.push('/classes')
      } else {
        alert(data.error || '拒绝邀请失败')
      }
    } catch (err) {
      alert('拒绝邀请失败')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载邀请详情中...</p>
        </div>
      </div>
    )
  }

  if (error || !inviteDetail) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center card-static rounded-2xl p-12 max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <p className="text-error text-lg mb-6">{error || '邀请不存在'}</p>
          <button
            onClick={() => router.push('/classes')}
            className="btn btn-primary"
          >
            返回班级列表
          </button>
        </div>
      </div>
    )
  }

  const { invite, classData, inviter } = inviteDetail

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="card-static rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-primary via-purple-600 to-secondary px-6 py-10 text-white text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iLjA1Ii8+PC9nPjwvc3ZnPg==')] opacity-30"></div>
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
                <Mail className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl font-bold">班级邀请</h1>
              <p className="text-white/80 mt-2">
                您收到了一个班级邀请
              </p>
            </div>
          </div>

          <div className="p-6">
            {classData && (
              <div className="flex items-center gap-4 mb-6 p-4 glass rounded-xl">
                {classData.avatar ? (
                  <img
                    src={classData.avatar}
                    alt={classData.name}
                    className="w-16 h-16 rounded-full"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <Users className="w-8 h-8 text-white" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-foreground">{classData.name}</h2>
                  {classData.description && (
                    <p className="text-sm text-muted-foreground mt-1">{classData.description}</p>
                  )}
                </div>
              </div>
            )}

            {inviter && (
              <div className="mb-6">
                <div className="flex items-center gap-3">
                  {inviter.avatar ? (
                    <img
                      src={inviter.avatar}
                      alt={inviter.username}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                      <UserCheck className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">邀请人</p>
                    <p className="font-medium text-foreground">
                      {inviter.nickname || inviter.username}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {invite.message && (
              <div className="mb-6 p-4 glass rounded-xl border border-primary/20">
                <p className="text-sm font-medium text-primary-light mb-1">邀请留言:</p>
                <p className="text-foreground">{invite.message}</p>
              </div>
            )}

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>
                  邀请时间: {new Date(invite.createdAt).toLocaleString('zh-CN')}
                </span>
              </div>
              {invite.expiresAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span>
                    过期时间: {new Date(invite.expiresAt).toLocaleString('zh-CN')}
                  </span>
                </div>
              )}
            </div>

            {invite.status !== 'pending' && (
              <div className="mb-6 p-4 rounded-xl text-center">
                {invite.status === 'accepted' && (
                  <div className="text-secondary-light glass rounded-xl border border-secondary/20 p-6">
                    <Check className="w-12 h-12 mx-auto mb-2" />
                    <p className="font-semibold text-lg">您已接受此邀请</p>
                  </div>
                )}
                {invite.status === 'rejected' && (
                  <div className="text-error glass rounded-xl border border-error/20 p-6">
                    <X className="w-12 h-12 mx-auto mb-2" />
                    <p className="font-semibold text-lg">您已拒绝此邀请</p>
                  </div>
                )}
                {invite.status === 'expired' && (
                  <div className="text-muted-foreground glass rounded-xl border border-border p-6">
                    <Clock className="w-12 h-12 mx-auto mb-2" />
                    <p className="font-semibold text-lg">此邀请已过期</p>
                  </div>
                )}
              </div>
            )}

            {invite.status === 'pending' && (
              <div className="flex gap-3">
                <button
                  onClick={handleAccept}
                  disabled={processing}
                  className="btn flex-1 bg-secondary hover:bg-secondary-dark text-white"
                >
                  <Check className="w-5 h-5" />
                  接受邀请
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing}
                  className="btn flex-1 bg-error hover:bg-red-600 text-white"
                >
                  <X className="w-5 h-5" />
                  拒绝邀请
                </button>
              </div>
            )}

            {invite.status !== 'pending' && (
              <Link
                href="/classes"
                className="btn btn-ghost w-full"
              >
                返回班级列表
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
