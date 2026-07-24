'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, Trash2, Eye, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { useUser } from '@/contexts/UserContext'
import { EducationalPageShell, PageLoading, ListEmptyState } from '@/components/common'
import { DataTable, type Column } from '@/components/admin'
import type { Notification } from '@/types/models'
import { formatDate } from '@/lib/utils'
import { loginPath } from '@/lib/navigation'

export default function NotificationsPage() {
 const router = useRouter()
 const { user, isLoading: authLoading } = useUser()
 const [notifications, setNotifications] = useState<Notification[]>([])
 const [unreadCount, setUnreadCount] = useState(0)
 const [loading, setLoading] = useState(true)
 const [filter, setFilter] = useState<'all' | 'unread'>('all')
 const [page, setPage] = useState(1)
 const [totalPages, setTotalPages] = useState(1)

 useEffect(() => {
 if (authLoading) return
 if (!user) {
 router.replace(loginPath('/notifications'))
 return
 }
 fetchNotifications()
 }, [filter, page, user, authLoading])

 const fetchNotifications = async () => {
 setLoading(true)
 try {
 const params = new URLSearchParams({
 page: page.toString(),
 pageSize: '20'
 })

 if (filter === 'unread') {
 params.append('unreadOnly', 'true')
 }

 const response = await fetchWithCookie(`/api/notifications?${params}`)

 if (response.status === 401) {
 router.push(loginPath('/notifications'))
 return
 }

 const data = await response.json()

 if (data.success) {
 setNotifications(data.data.items || [])
 setUnreadCount(data.data.unreadCount || 0)
 const total = data.data.total || 0
 const pageSize = data.data.pageSize || 20
 setTotalPages(Math.max(1, Math.ceil(total / pageSize)))
 }
 } catch (error) {
 console.error('获取通知失败:', error)
 } finally {
 setLoading(false)
 }
 }

 const markAsRead = async (notificationId: string) => {
 try {
 const response = await fetchWithCookie(`/api/notifications/${notificationId}`, {
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
 const response = await fetchWithCookie('/api/notifications/mark-all-read', {
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
 const response = await fetchWithCookie(`/api/notifications/${notificationId}`, {
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
 case 'class_invite':
 return '📨'
 case 'class_join_request':
 return '👥'
 case 'class_join_result':
 return '✅'
 case 'class_invite_result':
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
 
 return formatDate(date)
 }

 const showSkeleton = loading && notifications.length === 0

 if (authLoading || !user) {
 return <PageLoading label="加载通知中..." />
 }

 const columns: Column<Notification>[] = [
  {
   key: 'type',
   label: '类型',
   className: 'w-16 text-center',
   render: (value) => (
    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-base mx-auto">
     {getNotificationIcon(value as string)}
    </div>
   ),
  },
  {
   key: 'title',
   label: '内容',
   render: (value, row) => (
    <div className="flex items-center gap-2 min-w-0">
     {!row.isRead && (
      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
     )}
     <div className="min-w-0">
      <div className={`font-semibold truncate ${!row.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
       {value as string}
      </div>
      <p className={`text-sm truncate ${!row.isRead ? 'text-foreground/80' : 'text-muted-foreground'}`}>
       {row.content}
      </p>
     </div>
    </div>
   ),
  },
  {
   key: 'createdAt',
   label: '时间',
   className: 'w-40',
   render: (value) => (
    <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
     <Clock className="w-3 h-3" />
     {getTimeAgo(value as string)}
    </span>
   ),
  },
  {
   key: 'id',
   label: '操作',
   className: 'w-32 text-right',
   render: (_, row) => (
    <div className="flex gap-1 justify-end">
     {!row.isRead && (
      <button
       onClick={(e) => {
        e.stopPropagation()
        markAsRead(row.id)
       }}
       className="p-2.5 text-muted-foreground hover:text-primary-light hover:bg-primary/10 rounded-lg transition-colors"
       aria-label="标记已读"
       title="标记为已读"
      >
       <Eye className="w-4 h-4" />
      </button>
     )}
     <button
      onClick={(e) => {
       e.stopPropagation()
       deleteNotification(row.id)
      }}
      className="p-2.5 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-colors"
      aria-label="删除"
      title="删除"
     >
      <Trash2 className="w-4 h-4" />
     </button>
    </div>
   ),
  },
 ]

  return (
  <EducationalPageShell
  title="通知中心"
  description={unreadCount > 0 ? `您有 ${unreadCount} 条未读通知` : '所有通知已读'}
  icon={Bell}
 actions={
 unreadCount > 0 ? (
 <button onClick={markAllAsRead} className="btn btn-primary">
 <Check className="w-5 h-5" />
 全部标为已读
 </button>
 ) : undefined
 }
 toolbar={
 <div className="card-static rounded-lg p-4 border border-border">
 <div className="flex flex-wrap gap-2">
 <button
 onClick={() => {
 setFilter('all')
 setPage(1)
 }}
 className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
 filter === 'all'
 ? 'bg-primary text-white shadow-lg'
 : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
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
 ? 'bg-primary text-white shadow-lg'
 : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary-light'
 }`}
 >
 未读 {unreadCount > 0 && `(${unreadCount})`}
 </button>
 </div>
 </div>
 }
 >
 {showSkeleton ? (
 <div className="space-y-3">
 {Array.from({ length: 5 }).map((_, i) => (
 <div key={i} className="card-static rounded-lg px-4 py-3 animate-pulse">
 <div className="grid grid-cols-12 gap-4">
 <div className="col-span-1 flex items-center justify-center"><div className="w-8 h-8 rounded-lg bg-muted" /></div>
 <div className="col-span-8"><div className="h-4 w-3/4 rounded bg-muted mb-2" /><div className="h-3 w-full rounded bg-muted" /></div>
 <div className="col-span-3 flex justify-end"><div className="h-3 w-20 rounded bg-muted" /></div>
 </div>
 </div>
 ))}
 </div>
 ) : notifications.length === 0 ? (
 <ListEmptyState
 icon={Bell}
 title={filter === 'unread' ? '没有未读通知' : '暂无通知'}
 description={filter === 'unread' ? '所有通知都已阅读' : '新的通知会显示在这里'}
 />
 ) : (
  <div className="animate-fadeIn">
  <DataTable
  data={notifications}
  columns={columns}
  idKey="id"
  loading={false}
  emptyMessage={filter === 'unread' ? '没有未读通知' : '暂无通知'}
  onRowClick={(row) => handleNotificationClick(row)}
  mobileCardRenderer={(row) => (
  <div className="space-y-3">
  <div className="flex items-center gap-2">
  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-base">
  {getNotificationIcon(row.type)}
  </div>
  {!row.isRead && (
  <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary-light text-xs font-medium">
  未读
  </span>
  )}
  </div>
  <div>
  <p className={`text-sm font-medium ${row.isRead ? 'text-muted-foreground' : 'text-foreground'}`}>
  {row.title}
  </p>
  {row.content && (
  <p className="text-xs text-muted-foreground mt-1">{row.content}</p>
  )}
  </div>
  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
  <span className="text-xs text-muted-foreground flex items-center gap-1">
  <Clock className="w-3 h-3" />
  {getTimeAgo(row.createdAt)}
  </span>
  <div className="flex gap-1">
  {!row.isRead && (
  <button
  onClick={(e) => {
  e.stopPropagation()
  markAsRead(row.id)
  }}
  className="p-2.5 text-muted-foreground hover:text-primary-light hover:bg-primary/10 rounded-lg transition-colors"
  aria-label="标记已读"
  title="标记为已读"
  >
  <Eye className="w-4 h-4" />
  </button>
  )}
  <button
  onClick={(e) => {
  e.stopPropagation()
  deleteNotification(row.id)
  }}
  className="p-2.5 text-muted-foreground hover:text-error hover:bg-error/10 rounded-lg transition-colors"
  aria-label="删除"
  title="删除"
  >
  <Trash2 className="w-4 h-4" />
  </button>
  </div>
  </div>
  </div>
  )}
  />
  </div>
 )}

 {totalPages > 1 && (
 <div className="mt-8 flex justify-center">
 <div className="flex items-center gap-2 card-static rounded-lg p-2">
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
 ? 'bg-primary text-white shadow-lg'
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
 ? 'bg-primary text-white shadow-lg'
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
 </EducationalPageShell>
 )
}
