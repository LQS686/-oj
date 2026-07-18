'use client'

/**
 * app/admin/trainings/page.tsx
 * 管理后台 - 题单管理列表
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DataTable, FilterBar, type Column } from '@/components/admin'
import {
  Plus, Search, Edit, Trash2, Eye, Filter, AlertCircle, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchWithCookie } from '@/lib/api/base'
import { formatDate } from '@/lib/utils'

interface AdminTraining {
 id: string
 title: string
 description: string
 difficulty: string
 status: string
 isPublic: boolean
 isRecommended: boolean
 problemCount: number
 joinCount: number
 viewCount: number
 createdAt: string
 updatedAt: string
 author: { id: string; username: string; nickname: string | null } | null
 category: { id: string; name: string } | null
}

export default function AdminTrainingsPage() {
 const router = useRouter()
 const [items, setItems] = useState<AdminTraining[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [page, setPage] = useState(1)
 const [totalPages, setTotalPages] = useState(1)
 const [total, setTotal] = useState(0)
 const [keyword, setKeyword] = useState('')
 const [statusFilter, setStatusFilter] = useState('')
 const [pageSize, setPageSize] = useState(20)

 const fetchItems = useCallback(async () => {
 try {
 setLoading(true)
 setError(null)
 const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
 if (keyword) params.set('keyword', keyword)
 if (statusFilter) params.set('status', statusFilter)
 const res = await fetchWithCookie(`/api/admin/trainings?${params}`, {
 cache: 'no-store',
 })
 const data = await res.json()
 if (data.success) {
 setItems(Array.isArray(data.data?.items) ? data.data.items : [])
 setTotal(data.data?.total || 0)
 setTotalPages(data.data?.totalPages || 1)
 } else {
 setError(data.error || '加载失败')
 }
 } catch {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }, [page, pageSize, keyword, statusFilter])

 useEffect(() => { fetchItems() }, [fetchItems])

 const handleDelete = async (id: string, title: string) => {
 if (!confirm(`确定删除题单「${title}」？此操作不可恢复。`)) return
 try {
 const res = await fetchWithCookie(`/api/trainings/${id}`, {
 method: 'DELETE',
 cache: 'no-store',
 })
 const data = await res.json()
 if (data.success) {
 toast.success('删除成功')
 fetchItems()
 } else {
 toast.error(data.error || '删除失败')
 }
 } catch {
 toast.error('网络错误')
 }
 }

 const statusBadge = (s: string) => {
 const map: Record<string, string> = {
 draft: 'tag-warning',
 published: 'tag-success',
 archived: 'tag-primary',
 }
 const label: Record<string, string> = {
 draft: '草稿',
 published: '已发布',
 archived: '已归档',
 }
 return <span className={`tag ${map[s] || 'tag-primary'}`}>{label[s] || s}</span>
 }

 const columns: Column<AdminTraining>[] = [
 {
 key: 'title',
 label: '标题',
 render: (_, item) => (
 <div onClick={e => e.stopPropagation()}>
 <Link
 href={`/training/${item.id}`}
 target="_blank"
 className="font-medium text-foreground hover:text-primary-light line-clamp-1"
 >
 {item.title}
 </Link>
 {item.isRecommended && (
 <span className="ml-2 text-xs text-warning">推荐</span>
 )}
 </div>
 ),
 },
 {
 key: 'author',
 label: '作者',
 render: (_, item) => (
 <span className="text-muted-foreground text-xs">
 {item.author?.nickname || item.author?.username || '-'}
 </span>
 ),
 },
 {
 key: 'status',
 label: '状态',
 render: (value: string) => statusBadge(value),
 },
 {
 key: 'category',
 label: '分类',
 render: (_, item) => (
 <span className="text-muted-foreground text-xs">
 {item.category?.name || '-'}
 </span>
 ),
 },
 {
 key: 'problemCount',
 label: '题数',
 render: (value: number) => <span className="text-foreground">{value}</span>,
 },
 {
 key: 'joinCount',
 label: '加入',
 render: (value: number) => <span className="text-foreground">{value}</span>,
 },
 {
 key: 'createdAt',
 label: '创建时间',
 render: (value: string) => (
 <span className="text-muted-foreground text-xs">
 {formatDate(value)}
 </span>
 ),
 },
 {
 key: 'id',
 label: '操作',
 render: (_, item) => (
 <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
 <Link
 href={`/training/${item.id}`}
 target="_blank"
 className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
 title="预览"
 >
 <Eye className="w-4 h-4" />
 </Link>
 <Link
 href={`/admin/trainings/${item.id}`}
 className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
 title="编辑"
 >
 <Edit className="w-4 h-4" />
 </Link>
 <button
 onClick={() => handleDelete(item.id, item.title)}
 className="p-1.5 rounded hover:bg-error/10 text-muted-foreground hover:text-error"
 title="删除"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 ),
 },
 ]

 return (
 <div className="space-y-6">
 {/* 筛选 + 操作按钮合并到同一行 */}
 <FilterBar activeCount={(keyword ? 1 : 0) + (statusFilter ? 1 : 0)}>
 <div className="flex-1 relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
 <input
 type="text"
 value={keyword}
 onChange={e => { setKeyword(e.target.value); setPage(1) }}
 placeholder="搜索题单标题..."
 className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
 />
 </div>
 <select
 value={statusFilter}
 onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
 className="px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground"
 >
 <option value="">全部状态</option>
 <option value="published">已发布</option>
 <option value="draft">草稿</option>
 <option value="archived">已归档</option>
 </select>
 <div className="flex items-center gap-2 ml-auto">
 <Link href="/admin/trainings/categories" className="btn-ghost btn">
 分类管理
 </Link>
 <Link href="/admin/trainings/create" className="btn-primary btn">
 <Plus className="w-4 h-4" />
 新建题单
 </Link>
 </div>
 </FilterBar>

 {/* 列表 */}
 {error ? (
 <div className="card-static py-12 text-center">
 <AlertCircle className="w-10 h-10 mx-auto mb-3 text-error" />
 <p className="text-foreground mb-4">{error}</p>
 <button onClick={fetchItems} className="btn-primary btn">
 <RefreshCw className="w-4 h-4" /> 重试
 </button>
 </div>
 ) : (
 <DataTable
 data={items}
 columns={columns}
 idKey="id"
 loading={loading}
 emptyMessage="暂无题单"
 onRowClick={(row) => router.push(`/admin/trainings/${row.id}`)}
 pagination={totalPages > 1 ? {
 page,
 pageSize,
 total,
 onPageChange: setPage,
 onPageSizeChange: (size) => { setPageSize(size); setPage(1) },
 } : undefined}
 />
 )}
 </div>
 )
}