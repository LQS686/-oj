'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { fetchWithAuth, fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { canAccessAdmin, isSystemAdmin } from '@/lib/permissions'
import { formatDateTime } from '@/lib/utils'
import {
  LayoutDashboard,
  FileText,
  FileCode,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Trophy,
  GraduationCap,
  Sparkles,
  Bell,
  Megaphone,
  ChevronDown,
  Cpu,
  BookOpen,
  Activity,
  UserCircle
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useUser } from '@/contexts/UserContext'
import type { Notification } from '@/types/models'
import { getRoleLabel } from '@/lib/permissions'

interface AdminMenuItem {
  icon: React.ComponentType<{ className?: string }>
  label: string
  href: string
  /** 仅 SYSTEM_ADMIN 可见 */
  systemAdminOnly?: boolean
}

interface AdminLayoutProps {
  children: React.ReactNode
}

const menuGroups: { label: string; items: AdminMenuItem[] }[] = [
  {
    label: 'AI 助手',
    items: [
      { icon: Sparkles, label: 'AI 工作区', href: '/admin/ai' },
      { icon: Cpu, label: 'AI 模型管理', href: '/admin/ai-models' },
      { icon: Activity, label: 'AI 任务监控', href: '/admin/ai-monitor', systemAdminOnly: true },
    ]
  },
  {
    label: '内容管理',
    items: [
      { icon: LayoutDashboard, label: '仪表盘', href: '/admin' },
      { icon: FileText, label: '题目管理', href: '/admin/problems' },
    ]
  },
  {
    label: '运营管理',
    items: [
      { icon: Trophy, label: '竞赛管理', href: '/admin/contests' },
      { icon: BookOpen, label: '题单管理', href: '/admin/trainings' },
      { icon: GraduationCap, label: '班级管理', href: '/admin/classes' },
      { icon: Users, label: '用户管理', href: '/admin/users' },
      { icon: Megaphone, label: '系统公告', href: '/admin/announcements' },
    ]
  },
  {
    label: '系统管理',
    items: [
      { icon: FileCode, label: '提交记录', href: '/admin/submissions' },
      { icon: Settings, label: '系统设置', href: '/admin/settings', systemAdminOnly: true },
    ]
  }
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading, logout } = useUser()
  const canAccess = canAccessAdmin(user)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [avatarError, setAvatarError] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<(Notification & { message?: string })[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationRef = useRef<HTMLDivElement>(null)

  // 桌面端（≥ 768px）默认展开，移动端默认收起
  // 初始渲染使用 false（移动端友好），useEffect 中根据视口调整，避免水合不一致
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      setSidebarOpen(true)
    }
    setMounted(true)
  }, [])

  // 权限门：仅 SYSTEM_ADMIN / ADMIN 可访问后台，未通过则跳到 /403
  // 等待用户信息加载完成后再判定，避免短暂闪现 / 误判
  useEffect(() => {
    if (isLoading) return
    if (!user || !canAccess) {
      router.push('/403')
    }
  }, [user, isLoading, canAccess, router])

  useEffect(() => {
    document.body.style.paddingTop = '0'
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflowY = 'hidden'
    return () => {
      document.body.style.paddingTop = '56px'
      document.body.style.overflow = ''
      document.documentElement.style.overflowY = ''
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setNotificationOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchNotifications = async () => {
    try {
      const response = await fetchWithAuth('/api/notifications?limit=10')
      const data = await response.json()
      if (data.success) {
        setNotifications(data.data?.notifications || data.data || [])
        setUnreadCount(data.data?.unreadCount || 0)
      }
    } catch (error) {
      logger.error('获取通知失败', error)
    }
  }

  useEffect(() => {
    // fetchNotifications 是 async，setState 在异步回调中执行，非同步调用
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications()

    // 30s 轮询：页面不可见时暂停，可见时立即刷新并恢复轮询
    let intervalId: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (intervalId) return
      intervalId = setInterval(fetchNotifications, 30000)
    }
    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchNotifications()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') {
      start()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const handleLogout = async () => {
    try {
      await fetchWithCookie('/api/auth/logout', {
        method: 'POST',
      })
      logout()
      router.push('/login')
    } catch (error) {
      logger.error('登出失败', error)
      router.push('/login')
    }
  }

  // 按角色过滤菜单项：默认 SYSTEM_ADMIN/ADMIN 可见，systemAdminOnly 项仅 SYSTEM_ADMIN 可见
  const visibleGroups = menuGroups
    .map((g) => ({ ...g, items: g.items.filter((item) => (item.systemAdminOnly ? isSystemAdmin(user) : true)) }))
    .filter((g) => g.items.length > 0)
  const allMenuItems = visibleGroups.flatMap((g) => g.items)

  // 移动端点击导航项后自动收回侧边栏（桌面端保持原状态）
  const closeSidebarOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }

  // 鉴权完成前或鉴权未通过时，不渲染后台内容，避免短暂闪现
  if (isLoading || !user || !canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">加载中...</div>
      </div>
    )
  }

  return (
    <div className="h-screen overflow-hidden flex">
      <aside className={`fixed left-0 top-0 h-screen z-40 flex flex-col border-r bg-background-secondary transition-[transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        sidebarOpen ? 'w-72 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-20'
      }`}>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-4">
            <div className={`flex items-center mb-8 transition-all duration-300 ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
              {sidebarOpen ? (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary flex-shrink-0">
                      <LayoutDashboard className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <h1 className="text-lg font-bold text-foreground truncate whitespace-nowrap">管理后台</h1>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">大山 OJ</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-2 hover:bg-muted rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 flex-shrink-0"
                    aria-label="收起侧边栏"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 hover:bg-muted rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label="展开侧边栏"
                >
                  <Menu className="w-5 h-5 text-muted-foreground" />
                </button>
              )}
            </div>

            <nav className="space-y-1">
              {visibleGroups.map((group, groupIdx) => (
                <div key={group.label}>
                  {groupIdx > 0 && (
                    <div className="my-3 border-t border-border" />
                  )}
                  <div className={`overflow-hidden transition-[max-height,opacity,margin] duration-300 ${
                    sidebarOpen ? 'max-h-8 opacity-100 my-0' : 'max-h-0 opacity-0 my-0'
                  }`}>
                    <p className="px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      {group.label}
                    </p>
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href ||
                                   (item.href !== '/admin' && pathname.startsWith(item.href + '/'))

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={closeSidebarOnMobile}
                        title={sidebarOpen ? undefined : item.label}
                        className={`flex items-center py-3 rounded-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group ${
                          sidebarOpen ? 'px-4 gap-3' : 'justify-center px-2 gap-0'
                        } ${
                          isActive
                            ? 'bg-primary text-white'
                            : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span className={`font-medium truncate overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          sidebarOpen ? 'opacity-100 max-w-[180px]' : 'opacity-0 max-w-0'
                        }`}>
                          {item.label}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              ))}
            </nav>
          </div>
        </div>

        <div className="flex-shrink-0 p-4 border-t border-border">
          <Link
            href="/"
            onClick={closeSidebarOnMobile}
            title={sidebarOpen ? undefined : '返回主站'}
            className={`flex items-center py-3 rounded-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group ${
              sidebarOpen ? 'px-4 gap-3' : 'justify-center px-2 gap-0'
            } text-foreground hover:bg-muted`}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className={`font-medium truncate overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              sidebarOpen ? 'opacity-100 max-w-[180px]' : 'opacity-0 max-w-0'
            }`}>
              返回主站
            </span>
          </Link>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className={`flex-1 overflow-y-auto transition-all duration-300 ${
        sidebarOpen ? 'md:ml-72' : 'md:ml-20'
      }`}>
        <header className="sticky top-0 z-20 border-b bg-background-secondary border-border">
          <div className="px-4 md:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="md:hidden p-3 -ml-2 rounded-lg hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 flex-shrink-0"
                  aria-label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
                >
                  {sidebarOpen ? <X className="w-5 h-5 text-foreground" /> : <Menu className="w-5 h-5 text-foreground" />}
                </button>
                <h2 className="text-xl md:text-2xl font-bold text-foreground truncate">
                  {allMenuItems.find(item =>
                    pathname === item.href ||
                    (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
                  )?.label || '管理后台'}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative" ref={notificationRef}>
                  <button
                    onClick={() => setNotificationOpen(!notificationOpen)}
                    className="btn-ghost btn p-2.5 relative group"
                    aria-label="通知"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 badge-primary badge min-w-[18px] h-[18px] text-[10px]">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {notificationOpen && (
                    <div className="absolute right-0 mt-2 w-80 rounded-xl border z-50 shadow-lg bg-background-secondary border-border">
                      <div className="p-3 border-b border-border">
                        <h3 className="font-medium text-foreground">通知</h3>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {notifications.length > 0 ? (
                          notifications.map((n) => (
                            <div key={n.id} className="px-4 py-3 hover:bg-muted border-b border-border last:border-0">
                              <p className="text-sm text-foreground">{n.title || n.message || '新通知'}</p>
                              <p className="text-xs text-muted-foreground mt-1">{formatDateTime(n.createdAt)}</p>
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-center text-muted-foreground text-sm">暂无通知</div>
                        )}
                      </div>
                      <Link
                        href="/notifications"
                        className="block p-3 text-center text-sm text-primary hover:text-primary-dark transition-colors border-t border-border"
                        onClick={() => setNotificationOpen(false)}
                      >
                        查看全部通知
                      </Link>
                    </div>
                  )}
                </div>

                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-primary/10 transition-all duration-200 group"
                    aria-label="用户菜单"
                  >
                    {user.avatar && !avatarError ? (
                      <div className="avatar avatar-md border-2 border-primary/30 group-hover:border-primary transition-all duration-300">
                        <img
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
                    <div className="hidden md:flex flex-col items-start">
                      <span className="text-sm font-semibold text-foreground leading-tight group-hover:text-primary-light transition-colors duration-300">
                        {user.nickname || user.username}
                      </span>
                      <span className="text-xs text-muted-foreground leading-tight group-hover:text-primary/70 transition-colors duration-300">
                        {getRoleLabel(user?.role)}
                      </span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 hidden md:block group-hover:text-primary-light ${userMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-52 rounded-xl border py-1.5 z-50 shadow-lg bg-background-secondary border-border">
                      <Link
                        href={`/user/${user.id}`}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <UserCircle className="w-[18px] h-[18px]" />
                        个人主页
                      </Link>
                      {isSystemAdmin(user) && (
                        <Link
                          href="/admin/settings"
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          <Settings className="w-[18px] h-[18px]" />
                          系统设置
                        </Link>
                      )}
                      <Link
                        href="/"
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <LogOut className="w-[18px] h-[18px]" />
                        返回主站
                      </Link>
                      <div className="my-1 border-t border-border" />
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-error hover:bg-error/10 transition-colors"
                      >
                        <LogOut className="w-[18px] h-[18px]" />
                        退出登录
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="p-4 md:p-6 lg:p-8 bg-background" style={{ minHeight: 'calc(100vh - 73px)' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
