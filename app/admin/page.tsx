'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DataTable, type Column } from '@/components/admin'
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
  ArrowRight,
  Bot,
  Plus,
  Trophy,
  Sparkles,
  UserPlus
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
 aiToday: {
 pending: number
 processing: number
 completed: number
 failed: number
 totalTokens: number
 }
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
 setTimeout(() => router.push('/403'), 2000)
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
 <div className="flex items-center justify-center h-96">
 <div className="text-center">
 <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
 <p className="text-muted-foreground">加载中...</p>
 </div>
 </div>
 )
 }

 if (error) {
 return (
 <div className="flex items-center justify-center h-96">
 <div className="text-center">
 <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
 <XCircle className="w-8 h-8 text-error" />
 </div>
 <h2 className="text-xl font-bold text-foreground mb-2">加载失败</h2>
 <p className="text-muted-foreground">{error}</p>
 </div>
 </div>
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

 type RecentSubmission = DashboardStats['recentSubmissions'][number]

 const recentSubmissionColumns: Column<RecentSubmission>[] = [
 {
 key: 'user',
 label: '用户',
 render: (value) => (
 <span className="text-sm text-foreground font-medium">
 {value?.username}
 </span>
 ),
 },
 {
 key: 'problem',
 label: '题目',
 render: (value) => (
 <span className="text-sm text-foreground">{value?.title}</span>
 ),
 },
 {
 key: 'status',
 label: '状态',
 render: (value) => (
 <div className="flex items-center gap-2">
 {getStatusIcon(value)}
 <span className={`tag ${getStatusColor(value)}`}>{value}</span>
 </div>
 ),
 },
 {
 key: 'submittedAt',
 label: '提交时间',
 render: (value) => (
 <span className="text-sm text-muted-foreground">
 {new Date(value).toLocaleString('zh-CN')}
 </span>
 ),
 },
 ]

 return (
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

 <Link
 href="/admin/ai-monitor"
 className="card p-6 group lg:col-span-4 hover:border-primary/40 transition-colors cursor-pointer"
 >
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-3">
 <div>
 <p className="text-sm text-muted-foreground mb-1">AI 任务（今日）</p>
 <p className="text-3xl font-bold text-foreground">
 {(stats?.aiToday?.pending || 0) +
 (stats?.aiToday?.processing || 0) +
 (stats?.aiToday?.completed || 0) +
 (stats?.aiToday?.failed || 0)}
 </p>
 <p className="text-sm text-muted-foreground mt-2">
 Token 消耗：{(stats?.aiToday?.totalTokens || 0).toLocaleString()}
 </p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <div className="w-12 h-12 rounded-xl flex items-center justify-center"
 style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
 <Bot className="w-6 h-6 text-primary" />
 </div>
 <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
 </div>
 </div>
 <div className="grid grid-cols-4 gap-3">
 <div className="text-center">
 <p className="text-xs text-muted-foreground mb-1">待处理</p>
 <p className="text-xl font-bold text-primary-light">{stats?.aiToday?.pending || 0}</p>
 </div>
 <div className="text-center">
 <p className="text-xs text-muted-foreground mb-1">处理中</p>
 <p className="text-xl font-bold text-accent-light">{stats?.aiToday?.processing || 0}</p>
 </div>
 <div className="text-center">
 <p className="text-xs text-muted-foreground mb-1">已完成</p>
 <p className="text-xl font-bold text-secondary-light">{stats?.aiToday?.completed || 0}</p>
 </div>
 <div className="text-center">
 <p className="text-xs text-muted-foreground mb-1">失败</p>
 <p className="text-xl font-bold text-error">{stats?.aiToday?.failed || 0}</p>
 </div>
 </div>
 </Link>
 </div>

 <div className="space-y-4">
 <h3 className="text-lg font-bold text-foreground">快捷操作</h3>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 <Link
 href="/admin/problems/create"
 className="card p-5 group hover:border-primary/40 transition-colors cursor-pointer flex items-center gap-3"
 >
 <div
 className="w-10 h-10 rounded-xl flex items-center justify-center"
 style={{ background: 'rgba(59, 130, 246, 0.1)' }}
 >
 <Plus className="w-5 h-5 text-primary" />
 </div>
 <div>
 <p className="text-sm font-semibold text-foreground">创建题目</p>
 <p className="text-xs text-muted-foreground">新增编程题目</p>
 </div>
 </Link>

 <Link
 href="/admin/contests/create"
 className="card p-5 group hover:border-primary/40 transition-colors cursor-pointer flex items-center gap-3"
 >
 <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
 <Trophy className="w-5 h-5 text-secondary" />
 </div>
 <div>
 <p className="text-sm font-semibold text-foreground">创建竞赛</p>
 <p className="text-xs text-muted-foreground">发起一场竞赛</p>
 </div>
 </Link>

 <Link
 href="/admin/ai-generation"
 className="card p-5 group hover:border-primary/40 transition-colors cursor-pointer flex items-center gap-3"
 >
 <div
 className="w-10 h-10 rounded-xl flex items-center justify-center"
 style={{ background: 'rgba(139, 92, 246, 0.1)' }}
 >
 <Sparkles className="w-5 h-5 text-primary" />
 </div>
 <div>
 <p className="text-sm font-semibold text-foreground">AI 出题</p>
 <p className="text-xs text-muted-foreground">智能生成题目</p>
 </div>
 </Link>

 <Link
 href="/admin/users"
 className="card p-5 group hover:border-primary/40 transition-colors cursor-pointer flex items-center gap-3"
 >
 <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
 <UserPlus className="w-5 h-5 text-accent" />
 </div>
 <div>
 <p className="text-sm font-semibold text-foreground">批量注册</p>
 <p className="text-xs text-muted-foreground">用户管理</p>
 </div>
 </Link>
 </div>
 </div>

 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <h3 className="text-lg font-bold text-foreground">最近提交</h3>
 <button
 onClick={() => router.push('/admin/submissions')}
 className="text-sm text-primary hover:text-primary-dark flex items-center gap-1 transition-colors"
 >
 查看全部 <ArrowRight className="w-4 h-4" />
 </button>
 </div>
 <DataTable
 data={stats?.recentSubmissions || []}
 columns={recentSubmissionColumns}
 idKey="id"
 emptyMessage="暂无提交记录"
 onRowClick={(row) => router.push(`/admin/submissions/${row.id}`)}
 />
 </div>
 </div>
 )
}