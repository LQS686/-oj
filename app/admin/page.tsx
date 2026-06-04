'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import {
  Users, 
  FileText, 
  Send, 
  TrendingUp,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight
} from 'lucide-react'

interface DashboardStats {
  totalUsers: number
  totalProblems: number
  totalSubmissions: number
  todaySubmissions: number
  userGrowth: number
  submissionGrowth: number
  recentSubmissions: Array<{
    id: string
    user: { username: string }
    problem: { title: string }
    status: string
    submittedAt: string
  }>
}

export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState('')

  const fetchDashboardData = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/admin/dashboard')

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 403) {
          setError('需要管理员权限')
          setTimeout(() => router.push('/'), 2000)
          return
        }
        setError(data.error || '加载失败')
        return
      }

      setStats(data.data)
    } catch (err) {
      console.error('获取仪表盘数据失败:', err)
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
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
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-error" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">加载失败</h2>
            <p className="text-muted-foreground">{error}</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'AC':
        return <CheckCircle className="w-4 h-4 text-secondary-light" />
      case 'WA':
      case 'RE':
      case 'CE':
        return <XCircle className="w-4 h-4 text-error" />
      default:
        return <Clock className="w-4 h-4 text-primary-light" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AC': return 'tag-success'
      case 'WA':
      case 'RE':
      case 'CE': return 'tag-error'
      default: return 'tag-info'
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">仪表盘</h1>
            <p className="text-sm text-muted-foreground">系统运行状态概览</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-6 group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">总用户数</p>
                <p className="text-3xl font-bold text-foreground">{stats?.totalUsers || 0}</p>
                <p className="text-sm text-success mt-2 flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  +{stats?.userGrowth || 0}% 本周
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                <Users className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>

          <div className="card p-6 group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">总题目数</p>
                <p className="text-3xl font-bold text-foreground">{stats?.totalProblems || 0}</p>
                <p className="text-sm text-muted-foreground mt-2">活跃题目</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-secondary" />
              </div>
            </div>
          </div>

          <div className="card p-6 group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">总提交数</p>
                <p className="text-3xl font-bold text-foreground">{stats?.totalSubmissions || 0}</p>
                <p className="text-sm text-success mt-2 flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  +{stats?.submissionGrowth || 0}% 本周
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <Send className="w-6 h-6 text-accent" />
              </div>
            </div>
          </div>

          <div className="card p-6 group">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">今日提交</p>
                <p className="text-3xl font-bold text-foreground">{stats?.todaySubmissions || 0}</p>
                <p className="text-sm text-muted-foreground mt-2">实时统计</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                <Activity className="w-6 h-6 text-accent-light" />
              </div>
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
            <h3 className="text-lg font-bold text-foreground">最近提交</h3>
            <button 
              onClick={() => router.push('/admin/submissions')}
              className="text-sm text-primary hover:text-primary-dark flex items-center gap-1 transition-colors"
            >
              查看全部 <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">用户</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">题目</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">提交时间</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {stats?.recentSubmissions?.map((submission) => (
                  <tr key={submission.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-6 py-4 text-sm text-foreground font-medium">
                      {submission.user.username}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">
                      {submission.problem.title}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(submission.status)}
                        <span className={`tag ${getStatusColor(submission.status)}`}>
                          {submission.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(submission.submittedAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => router.push(`/submission/${submission.id}`)}
                        className="text-primary hover:text-primary-dark text-sm transition-colors"
                      >
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(!stats?.recentSubmissions || stats.recentSubmissions.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">
              暂无提交记录
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
