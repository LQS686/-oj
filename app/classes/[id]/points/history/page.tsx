'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { History, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchWithAuth } from '@/lib/api/base'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { useClass } from '@/hooks/useClass'
import { useUser } from '@/contexts/UserContext'

interface HistoryRecord {
  id: string
  type: 'EARN' | 'SPEND' | 'DEDUCT' | 'REFUND'
  points: number
  reason: string
  sourceType: string
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function PointsHistoryPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string
  const { user } = useUser()
  const { classData } = useClass(classId)

  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })
  const [filter, setFilter] = useState<'ALL' | 'EARN' | 'SPEND'>('ALL')
  const [loading, setLoading] = useState(true)

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true)
      if (!user) {
        router.push('/login')
        return
      }

      let url = `/api/classes/${classId}/points/history?page=${pagination.page}&limit=${pagination.limit}`
      if (filter !== 'ALL') {
        url += `&type=${filter}`
      }

      const res = await fetchWithAuth(url)
      const data = await res.json()
      if (data.success) {
        setRecords(data.data.records || [])
        const p = data.data.pagination
        setPagination((prev) => ({
          page: p?.page ?? prev.page,
          limit: p?.limit ?? p?.pageSize ?? prev.limit,
          total: p?.total ?? 0,
          totalPages: p?.totalPages ?? 1,
        }))
      }
    } catch (error) {
      console.error('加载失败:', error)
    } finally {
      setLoading(false)
    }
  }, [classId, filter, pagination.page, pagination.limit, user, router])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'EARN':
        return { bg: 'bg-secondary/15', text: 'text-secondary', label: '获得' }
      case 'SPEND':
        return { bg: 'bg-accent/15', text: 'text-accent', label: '花费' }
      case 'DEDUCT':
        return { bg: 'bg-error/15', text: 'text-error', label: '扣除' }
      case 'REFUND':
        return { bg: 'bg-info/15', text: 'text-info', label: '退款' }
      default:
        return { bg: 'bg-muted', text: 'text-muted-foreground', label: type }
    }
  }

  const toolbar = (
    <div className="flex gap-2 flex-wrap">
      {(['ALL', 'EARN', 'SPEND'] as const).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            setFilter(key)
            setPagination((p) => ({ ...p, page: 1 }))
          }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
            filter === key
              ? 'bg-primary text-white border-primary'
              : 'bg-card text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          {key === 'ALL' ? '全部' : key === 'EARN' ? '获得' : '花费'}
        </button>
      ))}
    </div>
  )

  if (loading && records.length === 0 && pagination.total === 0) {
    return <PageLoading label="加载积分历史..." />
  }

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title="积分历史"
      description={pagination.total > 0 ? `共 ${pagination.total} 条记录` : '查看积分变动记录'}
      icon={History}
      actions={
        <Link href={`/classes/${classId}/points`} className="btn btn-ghost btn-sm">
          积分概览
        </Link>
      }
      toolbar={toolbar}
    >
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">加载中...</div>
        ) : records.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <History className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">暂无积分记录</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {records.map((record) => {
                const style = getTypeStyle(record.type)
                const positive = record.type === 'EARN' || record.type === 'REFUND'
                return (
                  <div key={record.id} className="px-4 py-3 hover:bg-muted transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`tag text-xs ${style.bg} ${style.text}`}>{style.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(record.createdAt).toLocaleString('zh-CN')}
                          </span>
                        </div>
                        <p className="text-sm text-foreground">{record.reason}</p>
                      </div>
                      <p
                        className={`text-lg font-bold flex items-center gap-1 shrink-0 ${
                          positive ? 'text-secondary' : 'text-error'
                        }`}
                      >
                        {positive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                        {record.points}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {pagination.totalPages > 1 && (
              <div className="p-4 border-t border-border flex justify-center items-center gap-4">
                <button
                  type="button"
                  onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="btn btn-ghost btn-sm disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一页
                </button>
                <span className="text-sm text-muted-foreground">
                  第 {pagination.page} / {pagination.totalPages} 页
                </span>
                <button
                  type="button"
                  onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="btn btn-ghost btn-sm disabled:opacity-50"
                >
                  下一页
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </ClassWorkspaceShell>
  )
}