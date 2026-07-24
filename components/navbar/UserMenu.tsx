'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { 
 Bell, 
 User, 
 LogOut, 
 ChevronDown, 
 Settings,
 ListChecks,
 Users
} from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { canAccessAdmin, getRoleLabel } from '@/lib/permissions'
import { useNotificationSocket } from '@/hooks/useNotificationSocket'
import { notificationApi } from '@/lib/api'
import { logger } from '@/lib/logger'
import { loginPath } from '@/lib/navigation'
import Image from 'next/image'
import Dropdown from '../common/Dropdown'

export default function UserMenu() {
 const router = useRouter()
 const [unreadCount, setUnreadCount] = useState(0)
 const [avatarError, setAvatarError] = useState(false)
 const { user, isLoading, logout: contextLogout } = useUser()

 const canAccessAdminUser = canAccessAdmin(user)

 const fetchUnreadCount = useCallback(async () => {
 try {
 const data = await notificationApi.getNotifications(1, 1)
 setUnreadCount(data.unreadCount)
 } catch (error) {
 // 测试环境忽略；非测试环境仅记录一次（避免控制台刷屏）
 if (process.env.NODE_ENV !== 'test') {
 logger.error('获取未读通知数量失败', error)
 }
 }
 }, [])

 useNotificationSocket({
 userId: user?.id || null,
 onNotification: useCallback((notification: { title: string; message: string }) => {
 if ('Notification' in window && Notification.permission === 'granted') {
 new Notification(notification.title, {
 body: notification.message,
 icon: '/logo.png'
 })
 }
 
 fetchUnreadCount()
 }, [fetchUnreadCount]),
 enabled: !!user
 })

 useEffect(() => {
 if (user && 'Notification' in window && Notification.permission === 'default') {
 Notification.requestPermission()
 }
 }, [user])

 useEffect(() => {
 if (!user) return

 // 首次加载立即拉取一次（fetchUnreadCount 是 async，setState 在异步回调中执行，非同步调用）
 // eslint-disable-next-line react-hooks/set-state-in-effect
 fetchUnreadCount()

 // 30s 轮询：页面不可见时暂停，可见时立即刷新并恢复轮询
 let intervalId: ReturnType<typeof setInterval> | null = null
 const start = () => {
 if (intervalId) return
 intervalId = setInterval(fetchUnreadCount, 30000)
 }
 const stop = () => {
 if (intervalId) {
 clearInterval(intervalId)
 intervalId = null
 }
 }
 const onVisibilityChange = () => {
 if (document.visibilityState === 'visible') {
 fetchUnreadCount()
 start()
 } else {
 stop()
 }
 }

 // 初始根据当前可见性决定是否启动
 if (document.visibilityState === 'visible') {
 start()
 } else {
 stop()
 }
 document.addEventListener('visibilitychange', onVisibilityChange)

 return () => {
 stop()
 document.removeEventListener('visibilitychange', onVisibilityChange)
 }
 }, [user, fetchUnreadCount])

 const handleLogout = useCallback(async () => {
 await contextLogout()
 router.replace('/')
 }, [contextLogout, router])

 if (isLoading) {
 return (
 <div className="flex items-center gap-2" aria-hidden="true">
 <div className="hidden sm:block h-9 w-14 rounded-lg bg-muted/60 animate-pulse" />
 <div className="h-9 w-20 rounded-lg bg-muted/60 animate-pulse" />
 <div className="h-9 w-9 rounded-full bg-muted/60 animate-pulse" />
 </div>
 )
 }

 if (!user) {
 return (
 <>
 <Link href={loginPath()} className="btn-ghost btn group">
 <span className="group-hover:text-primary-light transition-colors duration-300">登录</span>
 </Link>
 <Link href="/register" className="btn-primary btn group">
 <span className="hidden sm:inline transition-transform duration-300">免费注册</span>
 <span className="sm:hidden transition-transform duration-300">注册</span>
 </Link>
 </>
 )
 }

 return (
 <>
 <Link
 href="/notifications"
 className="btn-ghost btn p-3 relative group"
 >
 <Bell className="w-5 h-5" />
 {unreadCount > 0 && (
 <span className="absolute -top-0.5 -right-0.5 badge-primary badge min-w-[18px] h-[18px] text-[10px]">
 {unreadCount > 99 ? '99+' : unreadCount}
 </span>
 )}
 </Link>

 <Dropdown 
 trigger={
 <button
 className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-primary/10 transition-all duration-200 group"
 aria-label="用户菜单"
 >
 {user.avatar && !avatarError ? (
 <div className="avatar avatar-md border-2 border-primary/30 group-hover:border-primary transition-all duration-300">
 <Image 
 src={user.avatar} 
 alt="Avatar" 
 width={40} 
 height={40} 
 className="object-cover w-full h-full" 
 loading="lazy"
 onError={() => setAvatarError(true)}
 />
 </div>
 ) : (
 <div className="avatar avatar-md border-2 border-primary/30 group-hover:border-primary transition-all duration-300">
 <div className="avatar-fallback text-sm">
 {user.username?.charAt(0).toUpperCase()}
 </div>
 </div>
 )}
 <div className="hidden sm:flex flex-col items-start">
 <span className="text-sm font-semibold text-foreground leading-tight group-hover:text-primary-light transition-colors duration-300">
 {user.nickname || user.username}
 </span>
 <span className="text-xs text-muted-foreground leading-tight group-hover:text-primary/70 transition-colors duration-300">
 {getRoleLabel(user?.role)}
 </span>
 </div>
 <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 hidden sm:block group-hover:text-primary-light`} />
 </button>
 }
 >
 <div className="min-w-[200px]">
 {canAccessAdminUser && (
 <Link
 href="/admin"
 className="dropdown-item text-primary-light group"
 >
 <Settings className="w-[18px] h-[18px] transition-transform duration-300" />
 后台管理
 </Link>
 )}
 <Link
 href={`/user/${user.id}`}
 className="dropdown-item group"
 >
 <User className="w-[18px] h-[18px] transition-transform duration-300" />
 个人主页
 </Link>
 {canAccessAdminUser && (
 <Link
 href="/submissions"
 className="dropdown-item group"
 >
 <ListChecks className="w-[18px] h-[18px] transition-transform duration-300" />
 提交记录
 </Link>
 )}
 <Link
 href="/classes"
 className="dropdown-item group"
 >
 <Users className="w-[18px] h-[18px] transition-transform duration-300" />
 我的班级
 </Link>
 <Link
 href="/settings"
 className="dropdown-item group"
 >
 <Settings className="w-[18px] h-[18px] transition-transform duration-300" />
 设置
 </Link>
 <div className="my-1.5 border-t border-border" />
 <button
 onClick={handleLogout}
 className="dropdown-item destructive w-full group"
 >
 <LogOut className="w-[18px] h-[18px] transition-transform duration-300" />
 退出登录
 </button>
 </div>
 </Dropdown>
 </>
 )
}
