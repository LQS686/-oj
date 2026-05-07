'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { Trophy, Plus, Search, Edit, Trash2, Calendar, Users, Clock, Eye, EyeOff, Play, Pause } from 'lucide-react'

interface Contest {
  id: string
  title: string
  description: string
  startTime: string
  endTime: string
  status: string
  isPublic: boolean
  _count?: {
    participants: number
    problems: number
  }
}

export default function AdminContestsPage() {
  const router = useRouter()
  const [contests, setContests] = useState<Contest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  useEffect(() => {
    fetchContests()
  }, [])

  const fetchContests = async () => {
    try {
      setLoading(true)
      const response = await fetchWithAuth('/api/admin/contests')

      if (response.status === 403) {
        setError('需要管理员权限')
        setTimeout(() => router.push('/'), 2000)
        return
      }

      const data = await response.json()
      if (data.success) {
        setContests(data.data)
      } else {
        setError(data.error || '获取竞赛列表失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleVisibility = async (contestId: string, currentVisibility: boolean) => {
    try {
      const response = await fetchWithAuth(`/api/admin/contests/${contestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !currentVisibility })
      })

      const data = await response.json()
      if (data.success) {
        fetchContests()
      } else {
        alert(data.error || '操作失败')
      }
    } catch (err) {
      alert('网络错误')
    }
  }

  const handleDeleteContest = async () => {
    if (!selectedContest) return

    try {
      const response = await fetchWithAuth(`/api/admin/contests/${selectedContest.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      if (data.success) {
        setShowDeleteModal(false)
        setSelectedContest(null)
        fetchContests()
      } else {
        alert(data.error || '删除失败')
      }
    } catch (err) {
      alert('网络错误')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'UPCOMING': return 'tag-info'
      case 'ONGOING': return 'tag-success'
      case 'ENDED': return 'tag'
      default: return 'tag'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'UPCOMING': return '未开始'
      case 'ONGOING': return '进行中'
      case 'ENDED': return '已结束'
      default: return status
    }
  }

  const getContestStatus = (startTime: string, endTime: string) => {
    const now = new Date()
    const start = new Date(startTime)
    const end = new Date(endTime)
    
    if (now < start) return 'UPCOMING'
    if (now >= start && now <= end) return 'ONGOING'
    return 'ENDED'
  }

  const filteredContests = contests.filter(contest => {
    const matchesSearch = contest.title.toLowerCase().includes(searchQuery.toLowerCase())
    const status = getContestStatus(contest.startTime, contest.endTime)
    const matchesStatus = statusFilter === 'all' || status === statusFilter
    return matchesSearch && matchesStatus
  })

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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">竞赛管理</h1>
              <p className="text-sm text-muted-foreground">管理平台竞赛活动</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/admin/contests/create')}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            创建竞赛
          </button>
        </div>

        <div className="card p-4">
          <div className="flex gap-4 flex-wrap items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索竞赛名称..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10"
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input w-auto"
            >
              <option value="all">全部状态</option>
              <option value="UPCOMING">未开始</option>
              <option value="ONGOING">进行中</option>
              <option value="ENDED">已结束</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">总竞赛数</div>
            <div className="text-2xl font-bold text-foreground mt-1">{contests.length}</div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">进行中</div>
            <div className="text-2xl font-bold text-secondary-light mt-1">
              {contests.filter(c => getContestStatus(c.startTime, c.endTime) === 'ONGOING').length}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">未开始</div>
            <div className="text-2xl font-bold text-primary-light mt-1">
              {contests.filter(c => getContestStatus(c.startTime, c.endTime) === 'UPCOMING').length}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">已结束</div>
            <div className="text-2xl font-bold text-muted-foreground mt-1">
              {contests.filter(c => getContestStatus(c.startTime, c.endTime) === 'ENDED').length}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredContests.map((contest) => {
            const status = getContestStatus(contest.startTime, contest.endTime)
            return (
              <div key={contest.id} className="card p-6 group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-bold text-foreground">{contest.title}</h3>
                      <span className={`tag ${getStatusColor(status)}`}>
                        {getStatusLabel(status)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{contest.description}</p>
                  </div>
                  <button
                    onClick={() => handleToggleVisibility(contest.id, contest.isPublic)}
                    className={`p-2 rounded-lg transition-colors ${
                      contest.isPublic 
                        ? 'text-secondary-light hover:bg-secondary/10' 
                        : 'text-muted-foreground hover:bg-muted/50'
                    }`}
                    title={contest.isPublic ? '公开' : '隐藏'}
                  >
                    {contest.isPublic ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(contest.startTime).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>
                      {Math.ceil((new Date(contest.endTime).getTime() - new Date(contest.startTime).getTime()) / (1000 * 60 * 60))} 小时
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span>{contest._count?.participants || 0} 参与者</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Trophy className="w-4 h-4" />
                    <span>{contest._count?.problems || 0} 道题目</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                  <button
                    onClick={() => router.push(`/admin/contests/${contest.id}/edit`)}
                    className="btn btn-ghost text-sm flex items-center gap-1"
                  >
                    <Edit className="w-4 h-4" />
                    编辑
                  </button>
                  <button
                    onClick={() => {
                      setSelectedContest(contest)
                      setShowDeleteModal(true)
                    }}
                    className="btn btn-ghost text-sm text-error hover:bg-error/10 flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {filteredContests.length === 0 && (
          <div className="card p-12 text-center text-muted-foreground">
            {searchQuery || statusFilter !== 'all' ? '没有找到匹配的竞赛' : '暂无竞赛'}
          </div>
        )}
      </div>

      {showDeleteModal && selectedContest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-foreground mb-4">确认删除</h3>
            <p className="text-muted-foreground mb-6">
              确定要删除竞赛 <span className="text-foreground font-medium">{selectedContest.title}</span> 吗？
              此操作无法撤销。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setSelectedContest(null)
                }}
                className="btn btn-ghost"
              >
                取消
              </button>
              <button
                onClick={handleDeleteContest}
                className="btn btn-destructive"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
