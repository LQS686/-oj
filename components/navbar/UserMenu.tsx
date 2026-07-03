'use client'

import React, { useState, useCallback, useEffect } from 'react'
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
import Image from 'next/image'
import Dropdown from '../common/Dropdown'

export default function UserMenu() {
 const router = useRouter()
 const [unreadCount, setUnreadCount] = useState(0)
 const { user, logout: contextLogout } = useUser()

 const canAccessAdminUser = canAccessAdmin(user)

 const fetchUnreadCount = useCallback(async () => {
 try {
 const data = await notificationApi.getNotifications(1, 1)
 setUnreadCount(data.unreadCount)
 } catch (error) {
 logger.error('获取未读通知数量失败', error)
 // 在测试环境中忽略错误
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
 if (user) {
 fetchUnreadCount()
 const interval = setInterval(fetchUnreadCount, 30000)
 return () => clearInterval(interval)
 }
 }, [user, fetchUnreadCount])

 const handleLogout = useCallback(async () => {
 await contextLogout()
 router.push('/')
 router.refresh()
 }, [contextLogout, router])

 if (!user) {
 return (
 <>
 <Link href="/login" className="btn-ghost btn group">
 <span className="group-hover:text-primary-light transition-colors duration-300">登录</span>
 </Link>
 <Link href="/register" className="btn-primary btn group">
 <span className="hidden sm:inline group- transition-transform duration-300">免费注册</span>
 <span className="sm:hidden group- transition-transform duration-300">注册</span>
 </Link>
 </>
 )
 }

 return (
 <>
 <Link
 href="/notifications"
 className="btn-ghost btn p-2.5 relative group"
 >
 <Bell className="w-5 h-5 transition-transform duration-300 group-" />
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
 {user.avatar ? (
 <div className="avatar avatar-md border-2 border-primary/30 group-hover:border-primary group- transition-all duration-300">
 <Image 
 src={user.avatar} 
 alt="Avatar" 
 width={40} 
 height={40} 
 className="object-cover w-full h-full" 
 loading="lazy"
 />
 </div>
 ) : (
 <div className="avatar avatar-md group- transition-transform duration-300">
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
