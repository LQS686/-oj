'use client'

/**
 * app/admin/trainings/page.tsx
 * 管理后台 - 题单管理列表
 */
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import {
  Plus, Search, Edit, Trash2, Eye, Filter, BookOpen, AlertCircle, RefreshCw
} from 'lucide-react'
import toast from 'react-hot-toast'

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

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ page: String(page), pageSize: '20' })
      if (keyword) params.set('keyword', keyword)
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/admin/trainings?${params}`, {
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
  }, [page, keyword, statusFilter])

  useEffect(() => { fetchItems() }, [fetchItems])

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定删除题单「${title}」？此操作不可恢复。`)) return
    try {
      const res = await fetch(`/api/trainings/${id}`, {
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

  return (
    <AdminLayout>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary-light" />
            题单管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">创建、编辑、发布题单</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/trainings/categories" className="btn-ghost btn">
            分类管理
          </Link>
          <Link href="/admin/trainings/create" className="btn-primary btn">
            <Plus className="w-4 h-4" />
            新建题单
          </Link>
        </div>
      </div>

      {/* 筛选 */}
      <div className="card-static p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={keyword}
              onChange={e => { setKeyword(e.target.value); setPage(1) }}
              placeholder="搜索题单标题..."
              className="w-full pl-9 pr-4 py-2 bg-muted/30 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm text-foreground"
          >
            <option value="">全部状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
            <option value="archived">已归档</option>
          </select>
        </div>
      </div>

      {/* 列表 */}
      <div className="card-static overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-muted-foreground">加载中...</div>
        ) : error ? (
          <div className="py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-error" />
            <p className="text-foreground mb-4">{error}</p>
            <button onClick={fetchItems} className="btn-primary btn">
              <RefreshCw className="w-4 h-4" /> 重试
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-foreground mb-2">暂无题单</p>
            <p className="text-sm text-muted-foreground mb-4">点击右上角"新建题单"开始</p>
            <Link href="/admin/trainings/create" className="btn-primary btn">
              <Plus className="w-4 h-4" />
              新建题单
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">标题</th>
                  <th className="px-4 py-3 text-left font-medium">作者</th>
                  <th className="px-4 py-3 text-left font-medium">状态</th>
                  <th className="px-4 py-3 text-left font-medium">分类</th>
                  <th className="px-4 py-3 text-center font-medium">题数</th>
                  <th className="px-4 py-3 text-center font-medium">加入</th>
                  <th className="px-4 py-3 text-left font-medium">创建时间</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-3">
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
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {item.author?.nickname || item.author?.username || '-'}
                    </td>
                    <td className="px-4 py-3">{statusBadge(item.status)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {item.category?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">{item.problemCount}</td>
                    <td className="px-4 py-3 text-center">{item.joinCount}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">共 {total} 条</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="btn-ghost btn"
            >
              上一页
            </button>
            <span className="text-sm text-muted-foreground px-3">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="btn-ghost btn"
            >
              下一页
            </button>
          </div>
        </div>
      )}
      </div>
    </AdminLayout>
  )
}
