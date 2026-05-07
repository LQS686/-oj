'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { History, ArrowLeft, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchWithAuth } from '@/lib/api/base'

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
  const teamId = params.id as string

  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  })
  const [filter, setFilter] = useState<'ALL' | 'EARN' | 'SPEND'>('ALL')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [teamId, pagination.page, filter])

  const loadHistory = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/login')
        return
      }

      let url = `/api/teams/${teamId}/points/history?page=${pagination.page}&limit=${pagination.limit}`
      if (filter !== 'ALL') {
        url += `&type=${filter}`
      }

      const res = await fetchWithAuth(url)

      const data = await res.json()
      if (data.success) {
        setRecords(data.data.records)
        setPagination(data.data.pagination)
      }

      setLoading(false)
    } catch (error) {
      console.error('加载失败:', error)
      setLoading(false)
    }
  }

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'EARN':
        return { bg: 'bg-secondary/15', text: 'text-secondary-light', label: '获得' }
      case 'SPEND':
        return { bg: 'bg-accent/100/15', text: 'text-amber-400', label: '花费' }
      case 'DEDUCT':
        return { bg: 'bg-error/15', text: 'text-error', label: '扣除' }
      case 'REFUND':
        return { bg: 'bg-info/15', text: 'text-info', label: '退款' }
      default:
        return { bg: 'bg-muted/50', text: 'text-muted-foreground', label: type }
    }
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link
            href={`/teams/${teamId}/points`}
            className="text-muted-foreground hover:text-primary-light transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            积分概览
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">积分历史</span>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
            <History className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">积分历史</h1>
            <p className="text-muted-foreground text-sm">查看积分变动记录</p>
          </div>
        </div>

        <div className="card-static rounded-2xl p-4 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'ALL'
                  ? 'bg-primary text-white'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setFilter('EARN')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'EARN'
                  ? 'bg-secondary text-white'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              获得
            </button>
            <button
              onClick={() => setFilter('SPEND')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'SPEND'
                  ? 'bg-accent/100 text-white'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              花费
            </button>
          </div>
        </div>

        <div className="card-static rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="relative w-16 h-16 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
                <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
              </div>
              <p className="text-muted-foreground">加载中...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <History className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">暂无积分记录</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {records.map((record) => {
                  const style = getTypeStyle(record.type)
                  return (
                    <div key={record.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`tag ${style.bg} ${style.text}`}>
                              {style.label}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {new Date(record.createdAt).toLocaleString('zh-CN')}
                            </span>
                          </div>
                          <p className="text-foreground">{record.reason}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xl font-bold flex items-center gap-1 ${
                            record.type === 'EARN' || record.type === 'REFUND'
                              ? 'text-secondary-light'
                              : 'text-error'
                          }`}>
                            {record.type === 'EARN' || record.type === 'REFUND' ? (
                              <ArrowUp className="w-4 h-4" />
                            ) : (
                              <ArrowDown className="w-4 h-4" />
                            )}
                            {record.points}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {pagination.totalPages > 1 && (
                <div className="p-4 border-t border-border flex justify-center items-center gap-4">
                  <button
                    onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                    disabled={pagination.page === 1}
                    className="btn btn-ghost px-3 py-1 text-sm disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    上一页
                  </button>
                  <span className="text-sm text-muted-foreground">
                    第 {pagination.page} / {pagination.totalPages} 页
                  </span>
                  <button
                    onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                    disabled={pagination.page === pagination.totalPages}
                    className="btn btn-ghost px-3 py-1 text-sm disabled:opacity-50"
                  >
                    下一页
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && records.length > 0 && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            共 {pagination.total} 条记录
          </div>
        )}
      </div>
    </div>
  )
}
