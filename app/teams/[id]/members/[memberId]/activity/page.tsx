'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, Award, BookOpen, FileText, BarChart3, CheckCircle, Clock, Target } from 'lucide-react'
import type { TeamMember } from '@/types/models'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'

interface ActivityStats {
  overall: {
    totalAssignments: number
    completedAssignments: number
    completionRate: number
    totalSubmissions: number
    acceptedSubmissions: number
    acceptanceRate: number
    totalNotes: number
  }
  assignments: Array<{
    assignmentId: string
    title: string
    totalProblems: number
    solvedProblems: number
    completionRate: number
    totalSubmissions: number
  }>
  notes: {
    totalPublished: number
    totalViews: number
    totalLikes: number
  }
  activityTrend: Array<{
    date: string
    submissions: number
  }>
}

export default function MemberActivityPage() {
  const params = useParams()
  const router = useRouter()
  const [stats, setStats] = useState<ActivityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [memberInfo, setMemberInfo] = useState<TeamMember | null>(null)

  useEffect(() => {
    fetchActivityStats()
    fetchMemberInfo()
  }, [])

  const fetchMemberInfo = async () => {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const response = await fetchWithAuth(`/api/teams/${params.id}`)

      if (response.ok) {
        const data = await response.json()
        const member = data.data.members?.find((m: TeamMember) => m.id === params.memberId)
        setMemberInfo(member)
      }
    } catch (error) {
      logger.error('获取成员信息失败', error)
    }
  }

  const fetchActivityStats = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const response = await fetchWithAuth(
        `/api/teams/${params.id}/members/${params.memberId}/activity`
      )

      const data = await response.json()
      
      if (response.ok && data.success) {
        setStats(data.data)
      } else {
        setError(data.error || '获取活动统计失败')
      }
    } catch (error) {
      console.error('获取活动统计失败:', error)
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
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
          <p className="text-muted-foreground text-lg">加载统计数据中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center card-static rounded-2xl p-12 max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <Target className="w-8 h-8 text-error" />
          </div>
          <p className="text-error text-lg mb-6">{error}</p>
          <button
            onClick={() => {
              setError(null)
              fetchActivityStats()
            }}
            className="btn btn-primary"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-error">数据加载失败</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link
            href={`/teams/${params.id}`}
            className="text-muted-foreground hover:text-primary-light transition-colors"
          >
            团队详情
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <Link
            href={`/teams/${params.id}/members`}
            className="text-muted-foreground hover:text-primary-light transition-colors"
          >
            成员管理
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">活动统计</span>
        </div>

        <div className="card-static rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
              <BarChart3 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {memberInfo?.username || memberInfo?.nickname || '成员'} 的活动统计
              </h1>
              <p className="text-muted-foreground text-sm">
                角色: {memberInfo?.role === 'owner' ? '所有者' : memberInfo?.role === 'admin' ? '管理员' : '普通成员'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card p-6 hover:border-primary/20 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-muted-foreground">作业完成率</div>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Award className="w-5 h-5 text-primary-light" />
              </div>
            </div>
            <div className="text-3xl font-bold gradient-text mb-2">
              {(stats.overall.completionRate ?? 0).toFixed(1)}%
            </div>
            <div className="text-sm text-muted-foreground mb-3">
              {stats.overall.completedAssignments ?? 0} / {stats.overall.totalAssignments ?? 0} 个作业
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-gradient-to-r from-primary to-primary-light h-2 rounded-full transition-all"
                style={{ width: `${stats.overall.completionRate ?? 0}%` }}
              ></div>
            </div>
          </div>

          <div className="card p-6 hover:border-secondary/20 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-muted-foreground">AC率</div>
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-secondary-light" />
              </div>
            </div>
            <div className="text-3xl font-bold text-secondary-light mb-2">
              {(stats.overall.acceptanceRate ?? 0).toFixed(1)}%
            </div>
            <div className="text-sm text-muted-foreground mb-3">
              {stats.overall.acceptedSubmissions ?? 0} / {stats.overall.totalSubmissions ?? 0} 次提交
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-gradient-to-r from-secondary to-secondary-light h-2 rounded-full transition-all"
                style={{ width: `${stats.overall.acceptanceRate ?? 0}%` }}
              ></div>
            </div>
          </div>

          <div className="card p-6 hover:border-accent/20 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-muted-foreground">总提交次数</div>
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-accent-light" />
              </div>
            </div>
            <div className="text-3xl font-bold text-accent-light mb-2">
              {stats.overall.totalSubmissions ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">
              包含所有题目的提交
            </div>
          </div>

          <div className="card p-6 hover:border-info/20 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-muted-foreground">笔记发布</div>
              <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-info" />
              </div>
            </div>
            <div className="text-3xl font-bold text-info mb-2">
              {stats.overall.totalNotes ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">
              共 {stats.notes?.totalViews ?? 0} 次浏览
            </div>
          </div>
        </div>

        <div className="card-static rounded-2xl p-6 mb-8">
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-light" />
            作业完成情况
          </h2>
          
          {(stats.assignments?.length ?? 0) === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>暂无作业数据</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      作业名称
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      题目进度
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      完成率
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      提交次数
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      状态
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.assignments?.map((assignment) => (
                    <tr 
                      key={assignment.assignmentId} 
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => router.push(`/teams/${params.id}/assignments/${assignment.assignmentId}`)}
                    >
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-foreground hover:text-primary-light transition-colors">
                          {assignment.title}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">
                          {assignment.solvedProblems} / {assignment.totalProblems}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-muted rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${assignment.completionRate ?? 0}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-foreground">
                            {(assignment.completionRate ?? 0).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-foreground">
                        {assignment.totalSubmissions ?? 0}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {(assignment.completionRate ?? 0) === 100 ? (
                          <span className="tag tag-success">
                            已完成
                          </span>
                        ) : (assignment.solvedProblems ?? 0) > 0 ? (
                          <span className="tag tag-warning">
                            进行中
                          </span>
                        ) : (
                          <span className="tag">
                            未开始
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-static rounded-2xl p-6">
            <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5 text-info" />
              笔记统计
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 glass rounded-xl">
                <div className="text-2xl font-bold text-primary-light">
                  {stats.notes?.totalPublished ?? 0}
                </div>
                <div className="text-sm text-muted-foreground mt-1">发布数量</div>
              </div>
              <div className="text-center p-4 glass rounded-xl">
                <div className="text-2xl font-bold text-secondary-light">
                  {stats.notes?.totalViews ?? 0}
                </div>
                <div className="text-sm text-muted-foreground mt-1">总浏览量</div>
              </div>
              <div className="text-center p-4 glass rounded-xl">
                <div className="text-2xl font-bold text-accent-light">
                  {stats.notes?.totalLikes ?? 0}
                </div>
                <div className="text-sm text-muted-foreground mt-1">总点赞数</div>
              </div>
            </div>
          </div>

          <div className="card-static rounded-2xl p-6">
            <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary-light" />
              最近30天活动趋势
            </h2>
            
            {(stats.activityTrend?.length ?? 0) === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>暂无活动数据</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {stats.activityTrend?.map((item) => (
                  <div key={item.date} className="flex items-center">
                    <div className="w-20 text-sm text-muted-foreground shrink-0">
                      {new Date(item.date).toLocaleDateString('zh-CN', {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </div>
                    <div className="flex-1 mx-3">
                      <div className="bg-muted rounded-full h-3">
                        <div
                          className="bg-gradient-to-r from-primary to-primary-light h-3 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (item.submissions / Math.max(...(stats.activityTrend?.map(t => t.submissions) ?? [1]))) * 100)}%`
                          }}
                        ></div>
                      </div>
                    </div>
                    <div className="w-14 text-sm text-foreground text-right">
                      {item.submissions} 次
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
