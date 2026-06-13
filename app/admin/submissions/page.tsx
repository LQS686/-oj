'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { Shield, Search, User, FileText, Clock, CheckCircle, XCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'

interface Submission {
  id: string
  user: { username: string }
  problem: { title: string; id: string }
  status: string
  language: string
  time: number | null
  memory: number | null
  submittedAt: string
}

export default function AdminSubmissionsPage() {
  const router = useRouter()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  useEffect(() => {
    fetchSubmissions()
  }, [page, statusFilter])

  const fetchSubmissions = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(statusFilter !== 'all' && { status: statusFilter })
      })
      
      const response = await fetchWithAuth(`/api/admin/submissions?${params}`)

      if (response.status === 403) {
        setError('需要管理员权限')
        setTimeout(() => router.push('/'), 2000)
        return
      }

      const data = await response.json()
      if (data.success) {
        const submissionsData = data.data?.submissions || data.data || []
        setSubmissions(Array.isArray(submissionsData) ? submissionsData : [])
        setTotal(data.data?.total || data.total || submissionsData.length || 0)
        setTotalPages(data.data?.totalPages || Math.ceil((data.data?.total || data.total || submissionsData.length || 0) / pageSize))
      } else {
        setError(data.error || '获取提交记录失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'AC': return <CheckCircle className="w-4 h-4 text-secondary" />
      case 'WA':
      case 'RE':
      case 'CE':
      case 'TLE':
      case 'MLE': return <XCircle className="w-4 h-4 text-error" />
      default: return <AlertCircle className="w-4 h-4 text-info" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AC': return 'tag-success'
      case 'WA':
      case 'RE':
      case 'TLE':
      case 'MLE': return 'tag-error'
      case 'CE': return 'tag-warning'
      case 'PENDING': return 'tag-info'
      default: return 'tag'
    }
  }

  const filteredSubmissions = Array.isArray(submissions) ? submissions.filter(submission => {
    const matchesSearch = submission.user?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         submission.problem?.title?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  }) : []

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">加载中...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-error text-lg mb-2">{error}</p>
            {error.includes('权限') && <p className="text-muted-foreground">正在跳转...</p>}
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">提交记录</h1>
            <p className="text-sm text-muted-foreground">查看所有用户的提交记录</p>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex gap-4 flex-wrap items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索用户或题目..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10"
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="input w-auto"
            >
              <option value="all">全部状态</option>
              <option value="AC">通过</option>
              <option value="WA">答案错误</option>
              <option value="TLE">时间超限</option>
              <option value="MLE">内存超限</option>
              <option value="CE">编译错误</option>
              <option value="RE">运行错误</option>
              <option value="PENDING">等待评测</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">总提交数</div>
            <div className="text-2xl font-bold text-foreground mt-1">{total}</div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">通过</div>
            <div className="text-2xl font-bold text-secondary mt-1">
              {submissions.filter(s => s.status === 'AC').length}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">错误</div>
            <div className="text-2xl font-bold text-error mt-1">
              {submissions.filter(s => ['WA', 'RE', 'CE', 'TLE', 'MLE'].includes(s.status)).length}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">等待评测</div>
            <div className="text-2xl font-bold text-info mt-1">
              {submissions.filter(s => s.status === 'PENDING').length}
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    提交ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    用户
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    题目
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    语言
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    耗时/内存
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    提交时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredSubmissions.map((submission) => (
                  <tr key={submission.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm text-muted-foreground">
                        #{submission.id.slice(-6)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="text-foreground">{submission.user.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{submission.problem.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(submission.status)}
                        <span className={`tag ${getStatusColor(submission.status)}`}>
                          {submission.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-muted-foreground">{submission.language}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-muted-foreground">
                        <div>{submission.time ? `${submission.time}ms` : '-'}</div>
                        <div>{submission.memory ? `${(submission.memory / 1024).toFixed(2)}MB` : '-'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">
                          {new Date(submission.submittedAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => router.push(`/submission/${submission.id}`)}
                        className="text-primary hover:text-foreground text-sm transition-colors"
                      >
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSubmissions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery || statusFilter !== 'all' ? '没有找到匹配的记录' : '暂无提交记录'}
            </div>
          )}

          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-border flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                显示 {(page - 1) * pageSize + 1} 到 {Math.min(page * pageSize, total)} 共 {total} 条
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="btn btn-ghost px-3 py-1 text-sm disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="btn btn-ghost px-3 py-1 text-sm disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
