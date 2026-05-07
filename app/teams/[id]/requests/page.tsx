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
  XCircle
} from 'lucide-react'

interface JoinRequest {
  id: string
  teamId: string
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

export default function TeamRequestsPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()

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

      const response = await fetchWithAuth(`/api/teams/${params.id}/requests`)

      const data = await response.json()

      if (data.success) {
        setRequests(data.data)
      } else {
        setError(data.error || '获取申请列表失败')
      }
    } catch (err) {
      setError('获取申请列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (requestId: string) => {
    if (!confirm('确定要批准该申请吗？')) return

    try {
      setProcessing(requestId)

      const response = await fetchWithAuth(`/api/teams/${params.id}/requests/${requestId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'approve' })
      })

      const data = await response.json()

      if (data.success) {
        alert('申请已批准！')
        fetchRequests()
      } else {
        alert(data.error || '批准失败')
      }
    } catch (err) {
      alert('批准失败')
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (requestId: string) => {
    if (!confirm('确定要拒绝该申请吗？')) return

    try {
      setProcessing(requestId)

      const response = await fetchWithAuth(`/api/teams/${params.id}/requests/${requestId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'reject' })
      })

      const data = await response.json()

      if (data.success) {
        alert('申请已拒绝')
        fetchRequests()
      } else {
        alert(data.error || '拒绝失败')
      }
    } catch (err) {
      alert('拒绝失败')
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-gray-400">加载中...</p>
        </div>
      </div>
    )
  }

  const pendingRequests = requests.filter(r => r.status === 'pending')
  const processedRequests = requests.filter(r => r.status !== 'pending')

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-sm mb-6">
          <button
            onClick={() => router.push(`/teams/${params.id}`)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            团队详情
          </button>
          <span className="text-gray-600">/</span>
          <button
            onClick={() => router.push(`/teams/${params.id}/manage`)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            团队管理
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium">加入申请</span>
        </div>

        <div className="card p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">加入申请管理</h1>
              <p className="text-sm text-gray-400">
                待处理申请: {pendingRequests.length} 个 | 已处理: {processedRequests.length} 个
              </p>
            </div>
          </div>
        </div>

        <div className="card mb-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 bg-yellow-500/10">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent-light" />
              待处理申请 ({pendingRequests.length})
            </h2>
          </div>
          <div className="p-6">
            {pendingRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                暂无待处理的申请
              </div>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between p-4 border border-white/10 rounded-lg hover:border-indigo-500/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      {request.applicant.avatar ? (
                        <img
                          src={request.applicant.avatar}
                          alt=""
                          className="w-12 h-12 rounded-full"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                          <Users className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            {request.applicant.nickname || request.applicant.username}
                          </span>
                          <span className="text-xs text-gray-500">
                            @{request.applicant.username}
                          </span>
                        </div>
                        {request.message && (
                          <p className="text-sm text-gray-400 mt-1">
                            申请理由: {request.message}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          申请时间: {new Date(request.createdAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApprove(request.id)}
                        disabled={processing === request.id}
                        className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        <Check className="w-4 h-4" />
                        批准
                      </button>
                      <button
                        onClick={() => handleReject(request.id)}
                        disabled={processing === request.id}
                        className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        <X className="w-4 h-4" />
                        拒绝
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">
              已处理申请 ({processedRequests.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            {processedRequests.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                暂无已处理的申请
              </div>
            ) : (
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      申请人
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      申请理由
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      审批人
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      申请时间
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      处理时间
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {processedRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-white/5">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {request.applicant.avatar ? (
                            <img
                              src={request.applicant.avatar}
                              alt=""
                              className="w-8 h-8 rounded-full mr-2"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mr-2">
                              <Users className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-white">
                              {request.applicant.nickname || request.applicant.username}
                            </div>
                            <div className="text-xs text-gray-500">
                              @{request.applicant.username}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400 max-w-xs truncate">
                        {request.message || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {request.status === 'approved' ? (
                          <span className="tag tag-success">
                            <CheckCircle className="w-3 h-3" />
                            已批准
                          </span>
                        ) : (
                          <span className="tag tag-error">
                            <XCircle className="w-3 h-3" />
                            已拒绝
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {request.reviewer
                          ? request.reviewer.nickname || request.reviewer.username
                          : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {new Date(request.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {request.reviewedAt
                          ? new Date(request.reviewedAt).toLocaleDateString('zh-CN')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-error/100/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
