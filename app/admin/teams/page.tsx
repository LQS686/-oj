'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { Briefcase, Search, Users, User, Calendar, Eye, EyeOff, Trash2, Edit } from 'lucide-react'

interface Team {
  id: string
  name: string
  description: string
  isPublic: boolean
  createdAt: string
  owner: { username: string }
  _count?: {
    members: number
  }
}

export default function AdminTeamsPage() {
  const router = useRouter()
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  useEffect(() => {
    fetchTeams()
  }, [])

  const fetchTeams = async () => {
    try {
      setLoading(true)
      const response = await fetchWithAuth('/api/admin/teams')

      if (response.status === 403) {
        setError('需要管理员权限')
        setTimeout(() => router.push('/'), 2000)
        return
      }

      const data = await response.json()
      if (data.success) {
        setTeams(data.data)
      } else {
        setError(data.error || '获取团队列表失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleVisibility = async (teamId: string, currentVisibility: boolean) => {
    try {
      const response = await fetchWithAuth(`/api/admin/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !currentVisibility })
      })

      const data = await response.json()
      if (data.success) {
        fetchTeams()
      } else {
        alert(data.error || '操作失败')
      }
    } catch (err) {
      alert('网络错误')
    }
  }

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return

    try {
      const response = await fetchWithAuth(`/api/admin/teams/${selectedTeam.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      if (data.success) {
        setShowDeleteModal(false)
        setSelectedTeam(null)
        fetchTeams()
      } else {
        alert(data.error || '删除失败')
      }
    } catch (err) {
      alert('网络错误')
    }
  }

  const filteredTeams = teams.filter(team => {
    return team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           team.description.toLowerCase().includes(searchQuery.toLowerCase())
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
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">团队管理</h1>
            <p className="text-sm text-muted-foreground">管理平台团队和成员</p>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex gap-4 flex-wrap items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="搜索团队名称或描述..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">总团队数</div>
            <div className="text-2xl font-bold text-foreground mt-1">{teams.length}</div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">公开团队</div>
            <div className="text-2xl font-bold text-secondary mt-1">
              {teams.filter(t => t.isPublic).length}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-muted-foreground text-sm">私有团队</div>
            <div className="text-2xl font-bold text-accent mt-1">
              {teams.filter(t => !t.isPublic).length}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeams.map((team) => (
            <div key={team.id} className="card p-6 group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold text-foreground">{team.name}</h3>
                    <span className={`tag ${team.isPublic ? 'tag-success' : 'tag'}`}>
                      {team.isPublic ? '公开' : '私有'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{team.description || '暂无描述'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>{team.owner.username}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{team._count?.members || 0} 成员</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground col-span-2">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(team.createdAt).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  onClick={() => handleToggleVisibility(team.id, team.isPublic)}
                  className={`p-2 rounded-lg transition-colors ${
                    team.isPublic 
                      ? 'text-secondary hover:bg-secondary/10' 
                      : 'text-muted-foreground hover:bg-muted/10'
                  }`}
                  title={team.isPublic ? '设为私有' : '设为公开'}
                >
                  {team.isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    setSelectedTeam(team)
                    setShowDeleteModal(true)
                  }}
                  className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredTeams.length === 0 && (
          <div className="card p-12 text-center text-muted-foreground">
            {searchQuery ? '没有找到匹配的团队' : '暂无团队'}
          </div>
        )}
      </div>

      {showDeleteModal && selectedTeam && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-foreground mb-4">确认删除</h3>
            <p className="text-muted-foreground mb-6">
              确定要删除团队 <span className="text-foreground font-medium">{selectedTeam.name}</span> 吗？
              此操作无法撤销。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteModal(false)
                  setSelectedTeam(null)
                }}
                className="btn btn-ghost"
              >
                取消
              </button>
              <button
                onClick={handleDeleteTeam}
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
