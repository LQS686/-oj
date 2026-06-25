'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import {
  ClipboardList,
  Check,
  X,
  Users,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { useClass } from '@/hooks/useClass'

interface JoinRequest {
  id: string
  classId: string
  applicant: {
    id: string
    username: string
    nickname?: string
    avatar?: string
  }
  reviewer: {
    id: string
    username: string
    nickname?: string
    avatar?: string
  } | null
  status: 'pending' | 'approved' | 'rejected'
  message?: string
  reviewedAt?: string
  createdAt: string
}

export default function ClassRequestsPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const classId = params.id as string
  const { classData } = useClass(classId)

  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    fetchRequests()
  }, [user])

  const fetchRequests = async () => {
    try {
      setLoading(true)

      const response = await fetchWithAuth(`/api/classes/${classId}/requests`)
      const data = await response.json()

      if (data.success) {
        setRequests(data.data)
      } else {
        setError(data.error || '获取申请列表失败')
      }
    } catch {
      setError('获取申请列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (requestId: string) => {
    if (!confirm('确定要批准该申请吗？')) return

    try {
      setProcessing(requestId)

      const response = await fetchWithAuth(`/api/classes/${classId}/requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })

      const data = await response.json()

      if (data.success) {
        alert('申请已批准！')
        fetchRequests()
      } else {
        alert(data.error || '批准失败')
      }
    } catch {
      alert('批准失败')
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (requestId: string) => {
    if (!confirm('确定要拒绝该申请吗？')) return

    try {
      setProcessing(requestId)

      const response = await fetchWithAuth(`/api/classes/${classId}/requests/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })

      const data = await response.json()

      if (data.success) {
        alert('申请已拒绝')
        fetchRequests()
      } else {
        alert(data.error || '拒绝失败')
      }
    } catch {
      alert('拒绝失败')
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return <PageLoading label="加载加入申请..." />
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const processedRequests = requests.filter((r) => r.status !== 'pending')

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title="加入申请"
      description={`待处理 ${pendingRequests.length} · 已处理 ${processedRequests.length}`}
      icon={ClipboardList}
    >
      {error && (
        <div className="mb-4 p-4 bg-error/10 border border-error/20 rounded-lg">
          <p className="text-error text-sm">{error}</p>
        </div>
      )}

      <section className="bg-card rounded-lg border border-border overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-border bg-muted/50 flex items-center gap-2">
          <Clock className="w-4 h-4 text-warning" />
          <h2 className="text-sm font-semibold text-foreground">
            待处理申请 ({pendingRequests.length})
          </h2>
        </div>
        {pendingRequests.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">暂无待处理的申请</div>
        ) : (
          <ul className="divide-y divide-border">
            {pendingRequests.map((request) => (
              <li
                key={request.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {request.applicant.avatar ? (
                    <img
                      src={request.applicant.avatar}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-sm">
                        {request.applicant.nickname || request.applicant.username}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        @{request.applicant.username}
                      </span>
                    </div>
                    {request.message && (
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">
                        申请理由: {request.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(request.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleApprove(request.id)}
                    disabled={processing === request.id}
                    className="btn btn-secondary btn-sm"
                  >
                    <Check className="w-4 h-4" />
                    批准
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReject(request.id)}
                    disabled={processing === request.id}
                    className="btn btn-ghost btn-sm text-error hover:bg-error/10"
                  >
                    <X className="w-4 h-4" />
                    拒绝
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            已处理申请 ({processedRequests.length})
          </h2>
        </div>
        {processedRequests.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">暂无已处理的申请</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    申请人
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    申请理由
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    审批人
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    申请时间
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    处理时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {processedRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-muted transition-colors">
                    <td className="px-6 py-3 whitespace-nowrap">
                      <div className="flex items-center">
                        {request.applicant.avatar ? (
                          <img
                            src={request.applicant.avatar}
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
                            {request.applicant.nickname || request.applicant.username}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            @{request.applicant.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-muted-foreground max-w-xs truncate">
                      {request.message || '-'}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      {request.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-secondary/10 text-secondary">
                          <CheckCircle className="w-3 h-3" />
                          已批准
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-error/10 text-error">
                          <XCircle className="w-3 h-3" />
                          已拒绝
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {request.reviewer
                        ? request.reviewer.nickname || request.reviewer.username
                        : '-'}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(request.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {request.reviewedAt
                        ? new Date(request.reviewedAt).toLocaleDateString('zh-CN')
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ClassWorkspaceShell>
  )
}