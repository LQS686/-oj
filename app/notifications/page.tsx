'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check, Trash2, Eye, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchWithAuth } from '@/lib/api/base'
import { EducationalPageShell, PageLoading } from '@/components/common'
import type { Notification } from '@/types/models'
import { formatDate } from '@/lib/utils'

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
 const params = new URLSearchParams({
 page: page.toString(),
 pageSize: '20'
 })

 if (filter === 'unread') {
 params.append('unreadOnly', 'true')
 }

 const response = await fetchWithAuth(`/api/notifications?${params}`)

 if (response.status === 401) {
 router.push('/login')
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

  return (
  <EducationalPageShell
  width="narrow"
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
 <div className="card-static rounded-lg p-16 text-center">
 <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
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
 <div className="animate-fadeIn">
 <div className="card-static rounded-t-lg overflow-hidden">
 <div className="bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground border-b border-border">
 <div className="grid grid-cols-12 gap-4">
 <div className="col-span-1 text-center">类型</div>
 <div className="col-span-8">内容</div>
 <div className="col-span-3 text-right">时间</div>
 </div>
 </div>
 </div>
 <div className="card-static rounded-b-lg border-t-0 overflow-hidden">
 {notifications.map((notification) => (
 <div
 key={notification.id}
 onClick={() => handleNotificationClick(notification)}
 className={`grid grid-cols-12 gap-4 px-4 py-3 border-b border-border hover:bg-primary/5 transition-colors group cursor-pointer ${
 !notification.isRead ? 'bg-primary/5' : ''
 }`}
 >
 <div className="col-span-1 flex items-center justify-center">
 <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-base">
 {getNotificationIcon(notification.type)}
 </div>
 </div>

 <div className="col-span-8 flex items-center gap-2 min-w-0">
 {!notification.isRead && (
 <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
 )}
 <div className="min-w-0">
 <div className={`font-semibold truncate ${!notification.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
 {notification.title}
 </div>
 <p className={`text-sm truncate ${!notification.isRead ? 'text-foreground/80' : 'text-muted-foreground'}`}>
 {notification.content}
 </p>
 </div>
 </div>

 <div className="col-span-3 flex items-center justify-end gap-2">
 <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
 <Clock className="w-3 h-3" />
 {getTimeAgo(notification.createdAt)}
 </span>
 {!notification.isRead && (
 <button
 onClick={(e) => {
 e.stopPropagation()
 markAsRead(notification.id)
 }}
 className="p-1.5 text-muted-foreground hover:text-primary-light hover:bg-primary/10 rounded-md transition-colors"
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
 className="p-1.5 text-muted-foreground hover:text-error hover:bg-error/10 rounded-md transition-colors"
 title="删除"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 </div>
 ))}
 </div>
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
