'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, type Column } from '@/components/admin'
import { fetchWithAuth } from '@/lib/api/base'
import { Trophy, Plus, Search, Edit, Trash2, Eye, EyeOff } from 'lucide-react'

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

 const fetchContests = useCallback(async () => {
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
 setContests(Array.isArray(data.data) ? data.data : [])
 } else {
 setError(data.error || '获取竞赛列表失败')
 setContests([])
 }
 } catch {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }, [router])

 useEffect(() => {
 fetchContests()
 }, [fetchContests])

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
 } catch {
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
 } catch {
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

 const columns: Column<Contest>[] = [
 {
 key: 'title',
 label: '竞赛名称',
 sortable: true,
 render: (_value, contest) => (
 <div>
 <div className="text-foreground font-medium">{contest.title}</div>
 <div className="text-xs text-muted-foreground line-clamp-1">{contest.description}</div>
 </div>
 ),
 },
 {
 key: 'status',
 label: '状态',
 render: (_value, contest) => {
 const status = getContestStatus(contest.startTime, contest.endTime)
 return <span className={`tag ${getStatusColor(status)}`}>{getStatusLabel(status)}</span>
 },
 },
 {
 key: 'isPublic',
 label: '类型',
 render: (value) => (
 <span className={`tag ${value ? 'tag-success' : 'tag'}`}>
 {value ? '公开' : '私有'}
 </span>
 ),
 },
 {
 key: 'startTime',
 label: '时间',
 render: (_value, contest) => (
 <div className="text-sm text-muted-foreground">
 <div>{new Date(contest.startTime).toLocaleDateString('zh-CN')}</div>
 <div className="text-xs">
 {Math.ceil((new Date(contest.endTime).getTime() - new Date(contest.startTime).getTime()) / (1000 * 60 * 60))} 小时
 </div>
 </div>
 ),
 },
 {
 key: '_count',
 label: '参与者',
 render: (_value, contest) => (
 <span className="text-foreground">{contest._count?.participants || 0}</span>
 ),
 },
 {
 key: 'id' as keyof Contest,
 label: '操作',
 render: (_value, contest) => (
 <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
 <button
 onClick={(e) => {
 e.stopPropagation()
 handleToggleVisibility(contest.id, contest.isPublic)
 }}
 className={`p-2 rounded-lg transition-colors ${
 contest.isPublic
 ? 'text-secondary-light hover:bg-secondary/10'
 : 'text-muted-foreground hover:bg-muted'
 }`}
 title={contest.isPublic ? '公开' : '隐藏'}
 >
 {contest.isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation()
 router.push(`/admin/contests/${contest.id}/edit`)
 }}
 className="p-2 text-primary hover:bg-primary/5 rounded-lg transition-colors"
 title="编辑"
 >
 <Edit className="w-4 h-4" />
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation()
 setSelectedContest(contest)
 setShowDeleteModal(true)
 }}
 className="p-2 text-error hover:bg-error/10 rounded-lg transition-colors"
 title="删除"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 ),
 },
 ]

 if (loading) {
 return (
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
 <p className="text-muted-foreground">加载中...</p>
 </div>
 </div>
 )
 }

 if (error) {
 return (
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <p className="text-error text-lg mb-2">{error}</p>
 {error.includes('权限') && <p className="text-muted-foreground">正在跳转...</p>}
 </div>
 </div>
 )
 }

 return (
  <>
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

 <DataTable<Contest>
 data={filteredContests}
 columns={columns}
 idKey="id"
 emptyMessage={searchQuery || statusFilter !== 'all' ? '没有找到匹配的竞赛' : '暂无竞赛'}
 onRowClick={(row) => router.push(`/admin/contests/${row.id}/edit`)}
 />
 </div>

 {showDeleteModal && selectedContest && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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
  </>
  )
}
