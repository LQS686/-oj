'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { TrendingUp, Award, FileText, BarChart3, Clock, Target } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { useClass } from '@/hooks/useClass'
import { formatDateTime } from '@/lib/utils'
import { classRoleDisplayLabel } from '@/lib/class/roles'
import { loginPath } from '@/lib/navigation'

interface ActivityMember {
  id: string
  username: string
  nickname?: string | null
  avatar?: string | null
  role: string
  joinedAt: string
}

interface ActivityStats {
  totalSubmissions: number
  acCount: number
  totalNotes: number
}

interface RecentActivity {
  type: string
  title: string
  status?: string
  score?: number | null
  createdAt: string
}

interface ActivityPayload {
  member: ActivityMember
  stats: ActivityStats
  recentActivities: RecentActivity[]
}

export default function MemberActivityPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string
  const memberId = params.memberId as string
  const { classData } = useClass(classId)

  const [data, setData] = useState<ActivityPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchActivityStats = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetchWithCookie(`/api/classes/${classId}/members/${memberId}/activity`)

      if (response.status === 401) {
        // 保持 loading，避免跳转前闪错误态
        router.push(loginPath())
        return
      }

      const json = await response.json()

      if (response.ok && json.success) {
        setData(json.data)
      } else {
        setError(json.error || '获取活动统计失败')
      }
      setLoading(false)
    } catch {
      setError('网络错误，请稍后重试')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchActivityStats()
  }, [classId, memberId])

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

  if (!data) {
    return (
      <ClassWorkspaceShell classId={classId} className={classData?.name} title="活动统计" icon={BarChart3}>
        <p className="text-error text-center py-8">数据加载失败</p>
      </ClassWorkspaceShell>
    )
  }

  const { member, stats, recentActivities } = data
  const displayName = member.nickname || member.username || '成员'
  const acceptanceRate =
    stats.totalSubmissions > 0 ? (stats.acCount / stats.totalSubmissions) * 100 : 0

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title={`${displayName} · 活动统计`}
      description={`角色：${classRoleDisplayLabel(member.role)}`}
      icon={BarChart3}
      actions={
        <Link href={`/classes/${classId}/members`} className="btn btn-ghost btn-sm">
          成员列表
        </Link>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card-static rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">总提交次数</span>
            <BarChart3 className="w-4 h-4 text-accent" />
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.totalSubmissions}</p>
          <p className="text-xs text-muted-foreground mt-1">班级作业提交</p>
        </div>

        <div className="card-static rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">AC 率</span>
            <TrendingUp className="w-4 h-4 text-secondary" />
          </div>
          <p className="text-2xl font-bold text-foreground">{acceptanceRate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.acCount} / {stats.totalSubmissions} 次通过
          </p>
          <div className="w-full bg-muted rounded-full h-1.5 mt-2">
            <div className="bg-secondary h-1.5 rounded-full" style={{ width: `${acceptanceRate}%` }} />
          </div>
        </div>

        <div className="card-static rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">笔记发布</span>
            <FileText className="w-4 h-4 text-info" />
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.totalNotes}</p>
          <p className="text-xs text-muted-foreground mt-1">班级内发布的笔记</p>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          最近活动
        </h2>

        {recentActivities.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">暂无活动记录</div>
        ) : (
          <ul className="divide-y divide-border">
            {recentActivities.map((item, index) => (
              <li key={`${item.type}-${item.createdAt}-${index}`} className="py-3 flex items-start gap-3">
                <span className="mt-0.5">
                  {item.type === 'note' ? (
                    <FileText className="w-4 h-4 text-info" />
                  ) : (
                    <Award className="w-4 h-4 text-primary" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDateTime(item.createdAt)}
                    {item.status ? ` · ${item.status}` : ''}
                    {item.score != null ? ` · ${item.score} 分` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ClassWorkspaceShell>
  )
}
