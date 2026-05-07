'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, Plus, Calendar, Users, Clock, ArrowLeft } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'

interface Assignment {
  id: string
  title: string
  description: string
  deadline: string | null
  problemCount: number
  stats: {
    totalMembers: number
    completedMembers: number
    completionRate: number
  }
  userStatus: string
  createdAt: string
  createdBy?: string
}

export default function TeamAssignmentsPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const teamId = params.id as string

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'ongoing' | 'ended'>('all')

  useEffect(() => {
    fetchAssignments()
  }, [teamId])

  const fetchAssignments = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/teams/${teamId}/assignments`)
      const data = await response.json()

      if (data.success) {
        const assignmentsList = data.data?.assignments || []
        setAssignments(assignmentsList)
      } else {
        setAssignments([])
      }
    } catch (error) {
      console.error('[TeamAssignments] 获取作业列表失败:', error)
      setAssignments([])
    } finally {
      setLoading(false)
    }
  }

  const getAssignmentStatus = (assignment: Assignment) => {
    if (!assignment.deadline) return { text: '无期限', color: 'tag' }
    const now = new Date()
    const end = new Date(assignment.deadline)

    if (now > end) return { text: '已结束', color: 'tag-error' }
    return { text: '进行中', color: 'tag-success' }
  }

  const filteredAssignments = assignments.filter(assignment => {
    if (filter === 'all') return true
    if (!assignment.deadline) return filter === 'ongoing'
    const now = new Date()
    const end = new Date(assignment.deadline)
    if (filter === 'ongoing') return now <= end
    if (filter === 'ended') return now > end
    return true
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载作业中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href={`/teams/${teamId}`}
            className="text-muted-foreground hover:text-primary-light transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-5 h-5" />
            返回团队
          </Link>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center shadow-lg shadow-accent/30">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">团队作业</h1>
              <p className="text-muted-foreground text-sm mt-0.5">共 {assignments.length} 个作业</p>
            </div>
          </div>
          {user && (
            <Link
              href={`/teams/${teamId}/assignments/create`}
              className="btn btn-primary"
            >
              <Plus className="w-5 h-5" />
              创建作业
            </Link>
          )}
        </div>

        <div className="card-static rounded-2xl p-6 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'all'
                  ? 'bg-primary text-white shadow-lg shadow-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
              }`}
            >
              全部作业
            </button>
            <button
              onClick={() => setFilter('ongoing')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'ongoing'
                  ? 'bg-secondary text-white shadow-lg shadow-secondary/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-secondary/10 hover:text-secondary-light'
              }`}
            >
              进行中
            </button>
            <button
              onClick={() => setFilter('ended')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === 'ended'
                  ? 'bg-error text-white shadow-lg shadow-error/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-error/10 hover:text-error'
              }`}
            >
              已结束
            </button>
          </div>
        </div>

        {filteredAssignments.length === 0 ? (
          <div className="card-static rounded-2xl p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">
              {filter !== 'all' ? '没有找到匹配的作业' : '还没有创建作业'}
            </div>
            <div className="text-muted-foreground mb-6">
              {filter !== 'all' ? '尝试切换其他筛选条件' : '创建第一个作业来布置任务吧'}
            </div>
            {user && filter === 'all' && (
              <Link
                href={`/teams/${teamId}/assignments/create`}
                className="btn btn-primary"
              >
                <Plus className="w-5 h-5" />
                创建第一个作业
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAssignments.map((assignment) => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                teamId={teamId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AssignmentCard({ assignment, teamId }: { assignment: Assignment; teamId: string }) {
  const getAssignmentStatus = (assignment: Assignment) => {
    if (!assignment.deadline) return { text: '无期限', color: 'tag' }
    const now = new Date()
    const end = new Date(assignment.deadline)

    if (now > end) return { text: '已结束', color: 'tag-error' }
    return { text: '进行中', color: 'tag-success' }
  }

  const status = getAssignmentStatus(assignment)
  const problemCount = assignment.problemCount || 0

  return (
    <Link
      href={`/teams/${teamId}/assignments/${assignment.id}`}
      className="card p-6"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-bold text-lg text-foreground flex-1">
          {assignment.title}
        </h3>
        <span className={`tag ${status.color} ml-2 flex-shrink-0`}>
          {status.text}
        </span>
      </div>

      <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
        {assignment.description || '暂无描述'}
      </p>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="w-4 h-4 text-primary-light" />
          <span>{problemCount} 道题目</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-4 h-4 text-primary-light" />
          <span>
            截止时间：{assignment.deadline ? new Date(assignment.deadline).toLocaleString('zh-CN') : '无限制'}
          </span>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>完成率</span>
          <span className="text-primary-light font-medium">{assignment.stats.completionRate}%</span>
        </div>
        <div className="w-full bg-muted/50 rounded-full h-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-primary to-secondary h-2 rounded-full transition-all duration-500"
            style={{ width: `${assignment.stats.completionRate}%` }}
          />
        </div>
      </div>
    </Link>
  )
}
