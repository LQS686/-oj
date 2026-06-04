'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
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
  MessageSquare,
  Briefcase,
  Sparkles,
  Bell,
  User,
  ChevronDown,
  Cpu,
  CheckCircle
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useUser } from '@/contexts/UserContext'

interface AdminLayoutProps {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useUser()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.body.style.paddingTop = '0'
    return () => {
      document.body.style.paddingTop = '88px'
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

  const menuItems = [
    {
      icon: LayoutDashboard,
      label: '仪表盘',
      href: '/admin'
    },
    {
      icon: FileText,
      label: '题目管理',
      href: '/admin/problems'
    },
    {
      icon: CheckCircle,
      label: '题目审核',
      href: '/admin/problems/review'
    },
    {
      icon: Sparkles,
      label: 'AI 智能出题',
      href: '/admin/ai-generation'
    },
    {
      icon: Cpu,
      label: 'AI 模型管理',
      href: '/admin/ai-models'
    },
    {
      icon: Trophy,
      label: '竞赛管理',
      href: '/admin/contests'
    },
    {
      icon: Users,
      label: '用户管理',
      href: '/admin/users'
    },
    {
      icon: Briefcase,
      label: '团队管理',
      href: '/admin/teams'
    },
    {
      icon: MessageSquare,
      label: '帖子管理',
      href: '/admin/posts'
    },
    {
      icon: Shield,
      label: '提交记录',
      href: '/admin/submissions'
    },
    {
      icon: Settings,
      label: '系统设置',
      href: '/admin/settings'
    }
  ]

  return (
    <div className="min-h-screen flex">
      <aside className={`fixed left-0 top-0 h-screen transition-all duration-300 z-30 flex flex-col shadow-lg md:translate-x-0 border-r ${
        sidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full md:translate-x-0 md:w-20'
      }`}
      style={{ background: 'linear-gradient(180deg, var(--background-secondary) 0%, var(--background) 100%)', borderColor: 'var(--border)'
      }}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-4">
            <div className="flex items-center justify-between mb-8">
              {sidebarOpen && (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)', boxShadow: '0 4px 24px rgba(59, 130, 246, 0.25)' }}>
                      <LayoutDashboard className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold text-foreground">管理后台</h1>
                      <p className="text-xs text-muted-foreground">OJ Platform</p>
                    </div>
                  </div>
              )}
              {!sidebarOpen && (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto"
                  style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)', boxShadow: '0 4px 24px rgba(59, 130, 246, 0.25)' }}>
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
              {menuItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || 
                               (item.href !== '/admin' && pathname.startsWith(item.href))
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                      isActive
                        ? 'text-white'
                        : 'text-foreground hover:bg-muted'
                    }`}
                    style={isActive ? { background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)', boxShadow: '0 4px 20px rgba(59, 130, 246, 0.25)' } : {}}
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
            </nav>
          </div>
        </div>

        <div className="flex-shrink-0 p-4 border-t" style={{ borderColor: 'var(--border)' }}>
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
        className="fixed top-4 left-4 z-40 p-2 rounded-lg shadow-lg md:hidden bg-background-secondary border"
        onClick={() => setSidebarOpen(true)}
        aria-label="打开侧边栏"
        style={{ borderColor: 'var(--border)'
        }}
      >
        <Menu className="w-5 h-5 text-foreground" />
      </button>

      <main className={`flex-1 overflow-auto transition-all duration-300 ${
        sidebarOpen ? 'md:ml-72' : 'md:ml-20'
      }`}>
        <header className="sticky top-0 z-20 border-b bg-background-secondary/80 backdrop-blur-xl"
          style={{ borderColor: 'var(--border)'
          }}>
          <div className="px-4 md:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                {menuItems.find(item => 
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
                      <span className="absolute top-0 right-0 w-4 h-4 rounded-full text-[10px] flex items-center justify-center text-white" style={{ background: 'var(--error)' }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                  
                  {notificationOpen && (
                    <div className="absolute right-0 mt-2 w-80 rounded-xl border z-50 shadow-lg"
                      style={{ background: 'var(--background-secondary)', borderColor: 'var(--border)'
                      }}>
                      <div className="p-3 border-b" style={{ borderColor: 'var(--border)'
                      }}>
                        <h3 className="font-medium text-foreground">通知</h3>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {notifications.length > 0 ? (
                          notifications.map((n: any) => (
                            <div key={n.id} className="px-4 py-3 hover:bg-muted border-b last:border-0" style={{ borderColor: 'var(--border)'
                            }}>
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
                        className="block p-3 text-center text-sm text-primary hover:text-primary-dark transition-colors border-t"
                        onClick={() => setNotificationOpen(false)}
                        style={{ borderColor: 'var(--border)'
                        }}
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
                    <div className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)', boxShadow: '0 0 24px rgba(59, 130, 246, 0.25)' }}>
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <div className="hidden md:flex flex-col items-end">
                      <span className="text-sm font-medium text-foreground">{user?.nickname || user?.username || '管理员'}</span>
                      <span className="text-xs text-muted-foreground">{user?.email || ''}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded-xl border py-1 z-50 shadow-lg"
                      style={{ background: 'var(--background-secondary)', borderColor: 'var(--border)'
                      }}>
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

        <div className="p-4 md:p-6 lg:p-8" style={{ background: 'var(--background)', minHeight: 'calc(100vh - 73px)'
        }}>
          {children}
        </div>
      </main>
    </div>
  )
}
