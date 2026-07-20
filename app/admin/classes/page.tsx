'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, FilterBar, type Column } from '@/components/admin'
import { fetchWithCookie } from '@/lib/api/base'
import { Plus, Search, Eye, EyeOff, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Class {
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

export default function AdminClassesPage() {
 const router = useRouter()
 const [classes, setClasses] = useState<Class[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [searchQuery, setSearchQuery] = useState('')
 const [selectedClass, setSelectedClass] = useState<Class | null>(null)
 const [showDeleteModal, setShowDeleteModal] = useState(false)
 const [showEditModal, setShowEditModal] = useState(false)
 const [editName, setEditName] = useState('')
 const [editDescription, setEditDescription] = useState('')
 const [saving, setSaving] = useState(false)

 useEffect(() => {
 fetchClasses()
 }, [])

 const fetchClasses = async () => {
 try {
 setLoading(true)
 const response = await fetchWithCookie('/api/admin/classes')

 if (response.status === 403) {
 setError('需要管理员权限')
 setTimeout(() => router.push('/403'), 2000)
 return
 }

 const data = await response.json()
 if (data.success) {
 setClasses(Array.isArray(data.data) ? data.data : [])
 } else {
 setError(data.error || '获取班级列表失败')
 setClasses([])
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }

 const handleToggleVisibility = async (classId: string, currentVisibility: boolean) => {
 try {
 const response = await fetchWithCookie(`/api/admin/classes/${classId}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ isPublic: !currentVisibility })
 })

 const data = await response.json()
 if (data.success) {
 fetchClasses()
 } else {
 alert(data.error || '操作失败')
 }
 } catch (err) {
 alert('网络错误')
 }
 }

 const handleDeleteClass = async () => {
 if (!selectedClass) return

 try {
 const response = await fetchWithCookie(`/api/admin/classes/${selectedClass.id}`, {
 method: 'DELETE'
 })

 const data = await response.json()
 if (data.success) {
 setShowDeleteModal(false)
 setSelectedClass(null)
 fetchClasses()
 } else {
 alert(data.error || '删除失败')
 }
 } catch (err) {
 alert('网络错误')
 }
 }

 const handleEditClass = async () => {
 if (!selectedClass) return

 if (!editName.trim()) {
 alert('班级名称不能为空')
 return
 }

 setSaving(true)
 try {
 const response = await fetchWithCookie(`/api/admin/classes/${selectedClass.id}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ name: editName, description: editDescription })
 })

 const data = await response.json()
 if (data.success) {
 setShowEditModal(false)
 setSelectedClass(null)
 fetchClasses()
 } else {
 alert(data.error || '保存失败')
 }
 } catch (err) {
 alert('网络错误')
 } finally {
 setSaving(false)
 }
 }

 const filteredClasses = classes.filter(classData => {
 return classData.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
 classData.description.toLowerCase().includes(searchQuery.toLowerCase())
 })

 const columns: Column<Class>[] = [
 {
 key: 'name',
 label: '班级名称',
 sortable: true,
 render: (_value, classData) => (
 <div>
 <div className="text-foreground font-medium">{classData.name}</div>
 <div className="text-xs text-muted-foreground line-clamp-1">{classData.description || '暂无描述'}</div>
 </div>
 ),
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
 key: 'owner',
 label: '教师',
 render: (_value, classData) => (
 <span className="text-foreground">{classData.owner?.username || '-'}</span>
 ),
 },
 {
 key: '_count',
 label: '成员数',
 render: (_value, classData) => (
 <span className="text-foreground">{classData._count?.members || 0}</span>
 ),
 },
 {
 key: 'createdAt',
 label: '创建时间',
 sortable: true,
 render: (value) => (
 <span className="text-sm text-muted-foreground">
 {formatDate(value)}
 </span>
 ),
 },
 {
 key: 'id' as keyof Class,
 label: '操作',
 render: (_value, classData) => (
 <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
 <button
 onClick={(e) => {
 e.stopPropagation()
 handleToggleVisibility(classData.id, classData.isPublic)
 }}
 className={`p-2 rounded-lg transition-colors ${
 classData.isPublic
 ? 'text-secondary hover:bg-secondary/10'
 : 'text-muted-foreground hover:bg-muted/10'
 }`}
 title={classData.isPublic ? '设为私有' : '设为公开'}
 >
 {classData.isPublic ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation()
 setSelectedClass(classData)
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

return (<>
 <div className="space-y-6">
 <FilterBar activeCount={searchQuery ? 1 : 0}>
 <div className="flex-1 min-w-[200px]">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
 <input
 type="text"
 placeholder="搜索班级名称或描述..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="input pl-10"
 />
 </div>
 </div>
 <button
 onClick={() => router.push('/admin/classes/create')}
 className="btn btn-primary flex items-center gap-2 ml-auto"
 >
 <Plus className="w-5 h-5" />
 新建班级
 </button>
 </FilterBar>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div className="card p-4">
 <div className="text-muted-foreground text-sm">总班级数</div>
 <div className="text-2xl font-bold text-foreground mt-1">{classes.length}</div>
 </div>
 <div className="card p-4">
 <div className="text-muted-foreground text-sm">公开班级</div>
 <div className="text-2xl font-bold text-secondary mt-1">
 {classes.filter(t => t.isPublic).length}
 </div>
 </div>
 <div className="card p-4">
 <div className="text-muted-foreground text-sm">私有班级</div>
 <div className="text-2xl font-bold text-accent mt-1">
 {classes.filter(t => !t.isPublic).length}
 </div>
 </div>
 </div>

 <DataTable<Class>
 data={filteredClasses}
 columns={columns}
 idKey="id"
 emptyMessage={searchQuery ? '没有找到匹配的班级' : '暂无班级'}
 onRowClick={(row) => {
 setSelectedClass(row)
 setEditName(row.name)
 setEditDescription(row.description || '')
 setShowEditModal(true)
 }}
 />
 </div>

 {showEditModal && selectedClass && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
 <div className="card p-6 max-w-md w-full mx-4">
 <h3 className="text-lg font-bold text-foreground mb-4">编辑班级</h3>
 <div className="mb-4">
 <label className="block text-sm font-medium text-muted-foreground mb-2">班级名称</label>
 <input
 type="text"
 value={editName}
 onChange={(e) => setEditName(e.target.value)}
 placeholder="请输入班级名称"
 className="input"
 />
 </div>
 <div className="mb-6">
 <label className="block text-sm font-medium text-muted-foreground mb-2">描述</label>
 <textarea
 value={editDescription}
 onChange={(e) => setEditDescription(e.target.value)}
 placeholder="请输入班级描述"
 rows={3}
 className="input resize-none"
 />
 </div>
 <div className="flex gap-3 justify-end">
 <button
 onClick={() => {
 setShowEditModal(false)
 setSelectedClass(null)
 }}
 disabled={saving}
 className="btn btn-ghost"
 >
 取消
 </button>
 <button
 onClick={handleEditClass}
 disabled={saving}
 className="btn btn-primary"
 >
 {saving ? '保存中...' : '保存'}
 </button>
 </div>
 </div>
 </div>
 )}

 {showDeleteModal && selectedClass && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110]">
 <div className="card p-6 max-w-md w-full mx-4">
 <h3 className="text-lg font-bold text-foreground mb-4">确认删除</h3>
 <p className="text-muted-foreground mb-6">
 确定要删除班级 <span className="text-foreground font-medium">{selectedClass.name}</span> 吗？
 此操作无法撤销。
 </p>
 <div className="flex gap-3 justify-end">
 <button
 onClick={() => {
 setShowDeleteModal(false)
 setSelectedClass(null)
 }}
 className="btn btn-ghost"
 >
 取消
 </button>
 <button
 onClick={handleDeleteClass}
 className="btn btn-destructive"
 >
 确认删除
 </button>
 </div>
 </div>
 </div>
 )}
 </>)
}