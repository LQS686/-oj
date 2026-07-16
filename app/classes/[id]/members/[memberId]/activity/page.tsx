'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { TrendingUp, Award, BookOpen, FileText, BarChart3, Clock, Target } from 'lucide-react'
import type { ClassMember } from '@/types/models'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { useClass } from '@/hooks/useClass'
import { formatDate } from '@/lib/utils'

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

function roleLabel(role?: string) {
  if (role === 'owner') return '所有者'
  if (role === 'assistant') return '管理员'
  return '普通成员'
}

export default function MemberActivityPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string
  const memberId = params.memberId as string
  const { classData } = useClass(classId)

  const [stats, setStats] = useState<ActivityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [memberInfo, setMemberInfo] = useState<ClassMember | null>(null)

  const fetchMemberInfo = async () => {
    try {
      const response = await fetchWithAuth(`/api/classes/${classId}`)
      if (response.ok) {
        const data = await response.json()
        const member = data.data.members?.find((m: ClassMember) => m.id === memberId)
        setMemberInfo(member)
      }
    } catch (err) {
      logger.error('获取成员信息失败', err)
    }
  }

  const fetchActivityStats = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetchWithAuth(`/api/classes/${classId}/members/${memberId}/activity`)

      if (response.status === 401) {
        router.push('/login')
        return
      }

      const data = await response.json()

      if (response.ok && data.success) {
        setStats(data.data)
      } else {
        setError(data.error || '获取活动统计失败')
      }
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMemberInfo()
    fetchActivityStats()
  }, [classId, memberId])

  const displayName = memberInfo?.nickname || memberInfo?.username || '成员'
  const maxTrend = Math.max(...(stats?.activityTrend?.map((t) => t.submissions) ?? [1]), 1)

  if (loading) {
    return <PageLoading label="加载统计数据中..." />
  }

  if (error) {
    return (
      <ClassWorkspaceShell
        classId={classId}
        className={classData?.name}
        title="活动统计"
        icon={BarChart3}
        actions={
          <Link href={`/classes/${classId}/members`} className="btn btn-ghost btn-sm">
            成员列表
          </Link>
        }
      >
        <div className="card-static rounded-lg p-8 text-center border border-border">
          <Target className="w-10 h-10 text-error mx-auto mb-3" />
          <p className="text-error mb-4">{error}</p>
          <button type="button" onClick={() => fetchActivityStats()} className="btn btn-primary">
            重试
          </button>
        </div>
      </ClassWorkspaceShell>
    )
  }

  if (!stats) {
    return (
      <ClassWorkspaceShell classId={classId} className={classData?.name} title="活动统计" icon={BarChart3}>
        <p className="text-error text-center py-8">数据加载失败</p>
      </ClassWorkspaceShell>
    )
  }

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title={`${displayName} · 活动统计`}
      description={`角色：${roleLabel(memberInfo?.role)}`}
      icon={BarChart3}
      actions={
        <Link href={`/classes/${classId}/members`} className="btn btn-ghost btn-sm">
          成员列表
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card-static rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">作业完成率</span>
            <Award className="w-4 h-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-foreground">{(stats.overall.completionRate ?? 0).toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.overall.completedAssignments ?? 0} / {stats.overall.totalAssignments ?? 0} 个作业
          </p>
          <div className="w-full bg-muted rounded-full h-1.5 mt-2">
            <div
              className="bg-primary h-1.5 rounded-full"
              style={{ width: `${stats.overall.completionRate ?? 0}%` }}
            />
          </div>
        </div>

        <div className="card-static rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">AC 率</span>
            <TrendingUp className="w-4 h-4 text-secondary" />
          </div>
          <p className="text-2xl font-bold text-foreground">{(stats.overall.acceptanceRate ?? 0).toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.overall.acceptedSubmissions ?? 0} / {stats.overall.totalSubmissions ?? 0} 次提交
          </p>
          <div className="w-full bg-muted rounded-full h-1.5 mt-2">
            <div
              className="bg-secondary h-1.5 rounded-full"
              style={{ width: `${stats.overall.acceptanceRate ?? 0}%` }}
            />
          </div>
        </div>

        <div className="card-static rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">总提交次数</span>
            <BarChart3 className="w-4 h-4 text-accent" />
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.overall.totalSubmissions ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">包含所有题目的提交</p>
        </div>

        <div className="card-static rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">笔记发布</span>
            <FileText className="w-4 h-4 text-info" />
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.overall.totalNotes ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-1">共 {stats.notes?.totalViews ?? 0} 次浏览</p>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          作业完成情况
        </h2>

        {(stats.assignments?.length ?? 0) === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">暂无作业数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">作业名称</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">题目进度</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">完成率</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">提交次数</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.assignments?.map((assignment) => (
                  <tr
                    key={assignment.assignmentId}
                    className="hover:bg-muted cursor-pointer transition-colors"
                    onClick={() => router.push(`/classes/${classId}/assignments/${assignment.assignmentId}`)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{assignment.title}</td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {assignment.solvedProblems} / {assignment.totalProblems}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full"
                            style={{ width: `${assignment.completionRate ?? 0}%` }}
                          />
                        </div>
                        <span className="text-sm">{(assignment.completionRate ?? 0).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{assignment.totalSubmissions ?? 0}</td>
                    <td className="px-4 py-3">
                      {(assignment.completionRate ?? 0) === 100 ? (
                        <span className="tag tag-success">已完成</span>
                      ) : (assignment.solvedProblems ?? 0) > 0 ? (
                        <span className="tag tag-warning">进行中</span>
                      ) : (
                        <span className="tag">未开始</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-info" />
            笔记统计
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-xl font-bold text-foreground">{stats.notes?.totalPublished ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">发布数量</p>
            </div>
            <div className="text-center p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-xl font-bold text-foreground">{stats.notes?.totalViews ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">总浏览量</p>
            </div>
            <div className="text-center p-3 rounded-lg border border-border bg-muted/30">
              <p className="text-xl font-bold text-foreground">{stats.notes?.totalLikes ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">总点赞数</p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            最近 30 天活动趋势
          </h2>

          {(stats.activityTrend?.length ?? 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">暂无活动数据</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {stats.activityTrend?.map((item) => (
                <div key={item.date} className="flex items-center gap-2">
                  <div className="w-16 text-xs text-muted-foreground shrink-0">
                    {formatDate(item.date)}
                  </div>
                  <div className="flex-1">
                    <div className="bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${Math.min(100, (item.submissions / maxTrend) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-12 text-xs text-right">{item.submissions} 次</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ClassWorkspaceShell>
  )
}