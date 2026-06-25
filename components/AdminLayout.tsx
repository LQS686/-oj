'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { isSystemAdmin } from '@/lib/permissions'
import {
  LayoutDashboard,
  FileText,
  Users,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
  Trophy,
  GraduationCap,
  Sparkles,
  Bell,
  Megaphone,
  User,
  ChevronDown,
  Cpu,
  BookOpen,
  KeyRound,
  ShieldCheck
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useUser } from '@/contexts/UserContext'

interface AdminLayoutProps {
  children: React.ReactNode
}

const menuGroups = [
  {
    label: '内容管理',
    items: [
      { icon: LayoutDashboard, label: '仪表盘', href: '/admin' },
      { icon: FileText, label: '题目管理', href: '/admin/problems' },
      { icon: Sparkles, label: 'AI 智能出题', href: '/admin/ai-generation' },
      { icon: Cpu, label: 'AI 模型管理', href: '/admin/ai-models' },
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
      { icon: Shield, label: '提交记录', href: '/admin/submissions' },
      { icon: Settings, label: '系统设置', href: '/admin/settings' },
      { icon: KeyRound, label: '权限点', href: '/admin/permissions' },
      { icon: ShieldCheck, label: '角色权限', href: '/admin/roles' },
    ]
  }
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, isLoading, logout } = useUser()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationRef = useRef<HTMLDivElement>(null)

  // 权限门：仅 SYSTEM_ADMIN 可访问 /admin，未通过则跳到 /403
  useEffect(() => {
    if (isLoading) return
    if (!user || !isSystemAdmin(user)) {
      router.push('/403')
    }
  }, [user, isLoading, router])

  useEffect(() => {
    document.body.style.paddingTop = '0'
    return () => {
      document.body.style.paddingTop = '56px'
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
    fetchNotifications()
  }, [])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      localStorage.removeItem('token')
      logout()
      router.push('/login')
    } catch (error) {
      logger.error('登出失败', error)
      localStorage.removeItem('token')
      router.push('/login')
    }
  }

  const allMenuItems = menuGroups.flatMap(g => g.items)

  // 鉴权完成前或鉴权未通过时，不渲染后台内容，避免短暂闪现
  if (isLoading || !user || !isSystemAdmin(user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      <aside className={`fixed left-0 top-0 h-screen transition-all duration-300 z-30 flex flex-col border-r ${
        sidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0 md:w-20'
      } bg-background-secondary`}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-4">
            <div className="flex items-center justify-between mb-8">
              {sidebarOpen && (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary">
                      <LayoutDashboard className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold text-foreground">管理后台</h1>
                      <p className="text-xs text-muted-foreground">OJ Platform</p>
                    </div>
                  </div>
              )}
              {!sidebarOpen && (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto bg-primary">
                  <LayoutDashboard className="w-5 h-5 text-white" />
                </div>
              )}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-muted rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 hidden md:block"
                aria-label={sidebarOpen ? '收起侧边栏' : '展开侧边栏'}
              >
                {sidebarOpen ? <X className="w-5 h-5 text-muted-foreground" /> : <Menu className="w-5 h-5 text-muted-foreground" />}
              </button>
            </div>

            <nav className="space-y-1">
              {menuGroups.map((group, groupIdx) => (
                <div key={group.label}>
                  {groupIdx > 0 && (
                    <div className="my-3 border-t border-border" />
                  )}
                  {sidebarOpen && (
                    <p className="px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </p>
                  )}
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href ||
                                   (item.href !== '/admin' && pathname.startsWith(item.href))

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                          isActive
                            ? 'bg-primary text-white'
                            : 'text-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        {sidebarOpen && (
                          <span className="font-medium transition-opacity duration-200 group-hover:opacity-100">
                            {item.label}
                          </span>
                        )}
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
            className="flex items-center gap-3 px-4 py-3 text-foreground hover:bg-muted rounded-xl transition-colors duration-200 group"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && (
              <span className="font-medium transition-opacity duration-200 group-hover:opacity-100">
                返回主站
              </span>
            )}
          </Link>
        </div>
      </aside>

      <button
        className="fixed top-4 left-4 z-40 p-2 rounded-lg shadow-lg md:hidden bg-background-secondary border border-border"
        onClick={() => setSidebarOpen(true)}
        aria-label="打开侧边栏"
      >
        <Menu className="w-5 h-5 text-foreground" />
      </button>

      <main className={`flex-1 overflow-auto transition-all duration-300 ${
        sidebarOpen ? 'md:ml-72' : 'md:ml-20'
      }`}>
        <header className="sticky top-0 z-20 border-b bg-background-secondary border-border">
          <div className="px-4 md:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                {allMenuItems.find(item =>
                  pathname === item.href ||
                  (item.href !== '/admin' && pathname.startsWith(item.href))
                )?.label || '管理后台'}
              </h2>
              <div className="flex items-center gap-3">
                <div className="relative" ref={notificationRef}>
                  <button
                    onClick={() => setNotificationOpen(!notificationOpen)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors relative focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label="通知"
                  >
                    <Bell className="w-5 h-5 text-muted-foreground" />
                    {unreadCount > 0 && (
                      <span className="absolute top-0 right-0 w-4 h-4 rounded-full text-[10px] flex items-center justify-center text-white bg-error">
                        {unreadCount > 9 ? '9+' : unreadCount}
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
                          notifications.map((n: any) => (
                            <div key={n.id} className="px-4 py-3 hover:bg-muted border-b border-border last:border-0">
                              <p className="text-sm text-foreground">{n.title || n.message || '新通知'}</p>
                              <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString('zh-CN')}</p>
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
                    className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label="用户菜单"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div className="hidden md:flex flex-col items-end">
                      <span className="text-sm font-medium text-foreground">{user?.nickname || user?.username || '管理员'}</span>
                      <span className="text-xs text-muted-foreground">{user?.email || ''}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded-xl border py-1 z-50 shadow-lg bg-background-secondary border-border">
                      <Link
                        href="/admin/settings"
                        className="block px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        系统设置
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2.5 text-sm text-error hover:bg-error/10 transition-colors"
                      >
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
