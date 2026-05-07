'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, Trash2, Eye, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchWithAuth } from '@/lib/api/base'

interface Notification {
  id: string
  type: string
  title: string
  content: string
  link: string | null
  isRead: boolean
  createdAt: string
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    fetchNotifications()
  }, [filter, page])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/login')
        return
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      })
      
      if (filter === 'unread') {
        params.append('unreadOnly', 'true')
      }

      const response = await fetchWithAuth(`/api/notifications?${params}`)

      const data = await response.json()

      if (data.success) {
        setNotifications(data.data.notifications)
        setUnreadCount(data.data.unreadCount)
        setTotalPages(data.data.totalPages)
      }
    } catch (error) {
      console.error('获取通知失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetchWithAuth(`/api/notifications/${notificationId}`, {
        method: 'PUT',
      })

      const data = await response.json()

      if (data.success) {
        fetchNotifications()
      }
    } catch (error) {
      console.error('标记失败:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const response = await fetchWithAuth('/api/notifications/mark-all-read', {
        method: 'POST',
      })

      const data = await response.json()

      if (data.success) {
        fetchNotifications()
      }
    } catch (error) {
      console.error('批量标记失败:', error)
    }
  }

  const deleteNotification = async (notificationId: string) => {
    if (!confirm('确定删除这条通知吗?')) return

    try {
      const response = await fetchWithAuth(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (data.success) {
        fetchNotifications()
      }
    } catch (error) {
      console.error('删除失败:', error)
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await markAsRead(notification.id)
    }

    if (notification.link) {
      router.push(notification.link)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'team_invite':
        return '📨'
      case 'team_join_request':
        return '👥'
      case 'team_join_result':
        return '✅'
      case 'team_invite_result':
        return '📬'
      default:
        return '🔔'
    }
  }

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (seconds < 60) return '刚刚'
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} 天前`
    
    return date.toLocaleDateString('zh-CN')
  }

  if (loading && notifications.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载通知中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">通知中心</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {unreadCount > 0 ? `您有 ${unreadCount} 条未读通知` : '所有通知已读'}
              </p>
            </div>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="btn btn-primary"
            >
              <Check className="w-5 h-5" />
              全部标为已读
            </button>
          )}
        </div>

        <div className="card-static rounded-2xl p-6 mb-8">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setFilter('all')
                setPage(1)
              }}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                filter === 'all'
                  ? 'bg-primary text-white shadow-lg shadow-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => {
                setFilter('unread')
                setPage(1)
              }}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                filter === 'unread'
                  ? 'bg-primary text-white shadow-lg shadow-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
              }`}
            >
              未读 {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="card-static rounded-2xl p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-foreground text-xl font-semibold mb-2">
              {filter === 'unread' ? '没有未读通知' : '暂无通知'}
            </div>
            <div className="text-muted-foreground">
              {filter === 'unread' ? '所有通知都已阅读' : '新的通知会显示在这里'}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`card p-5 cursor-pointer group ${
                  !notification.isRead ? 'border-l-4 border-l-primary' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="text-2xl flex-shrink-0 w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
                    {getNotificationIcon(notification.type)}
                  </div>

                  <div
                    className="flex-1 min-w-0"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className={`font-semibold ${
                          !notification.isRead ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {notification.title}
                        </h3>
                        {!notification.isRead && (
                          <span className="tag tag-primary text-[10px] px-2 py-0.5">
                            未读
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getTimeAgo(notification.createdAt)}
                      </span>
                    </div>
                    <p className={`text-sm ${
                      !notification.isRead ? 'text-foreground/80' : 'text-muted-foreground'
                    }`}>
                      {notification.content}
                    </p>
                    {notification.link && (
                      <p className="text-xs text-primary-light mt-2 group-hover:underline">
                        点击查看详情 →
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!notification.isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          markAsRead(notification.id)
                        }}
                        className="p-2 text-muted-foreground hover:text-primary-light hover:bg-primary/10 rounded-lg transition-colors"
                        title="标记为已读"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteNotification(notification.id)
                      }}
                      className="p-2 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex justify-center">
            <div className="flex items-center gap-2 glass-strong rounded-xl p-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-ghost px-3 py-2"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + 1
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-10 h-10 rounded-lg font-semibold transition-all ${
                        page === pageNum
                          ? 'bg-primary text-white shadow-lg shadow-primary/30'
                          : 'text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
                {totalPages > 5 && (
                  <>
                    <span className="px-2 text-muted-foreground">...</span>
                    <button
                      onClick={() => setPage(totalPages)}
                      className={`w-10 h-10 rounded-lg font-semibold transition-all ${
                        page === totalPages
                          ? 'bg-primary text-white shadow-lg shadow-primary/30'
                          : 'text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
                      }`}
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn btn-ghost px-3 py-2"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
