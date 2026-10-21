'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu,
  X,
  BookOpen,
  Trophy,
  Dumbbell,
  Users,
  BarChart3,
  ListChecks,
  Settings,
  User,
  LogOut,
  CircleHelp,
} from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { canAccessAdmin } from '@/lib/permissions'
import { useRouter } from 'next/navigation'

const MENU_ID = 'mobile-nav-menu'

export default function MobileMenu() {
  const pathname = usePathname()
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { user, logout: contextLogout } = useUser()

  const canAccessAdminUser = canAccessAdmin(user)

  const navLinks = [
    { href: '/problems', label: '题库', icon: BookOpen },
    { href: '/contests', label: '竞赛', icon: Trophy },
    { href: '/training', label: '训练', icon: Dumbbell },
    { href: '/classes', label: '班级', icon: Users },
    { href: '/rank', label: '排行榜', icon: BarChart3 },
    { href: '/help', label: '使用帮助', icon: CircleHelp },
  ]

  useEffect(() => {
    if (!isMenuOpen) return
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isMenuOpen])

  const handleLogout = async () => {
    setIsMenuOpen(false)
    await contextLogout()
    router.replace('/')
  }

  return (
    <>
      <button
        onClick={() => setIsMenuOpen(true)}
        className="lg:hidden btn-ghost btn btn-icon-lg group"
        aria-label="打开菜单"
        aria-haspopup="dialog"
        aria-expanded={isMenuOpen}
        aria-controls={isMenuOpen ? MENU_ID : undefined}
      >
        <Menu className="w-5 h-5" />
      </button>

      {isMenuOpen && (
        <div className="fixed inset-0 lg:hidden" style={{ zIndex: 'var(--z-drawer)' }}>
          <div
            className="absolute inset-0 bg-black/50 animate-backdrop-in"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden="true"
          />

          <div
            id={MENU_ID}
            className="absolute top-0 right-0 bottom-0 w-[280px] max-w-[80vw] bg-background shadow-2xl overflow-y-auto animate-slideInRight"
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <span className="font-bold text-lg text-foreground">导航菜单</span>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="btn-ghost btn p-2"
                aria-label="关闭菜单"
                autoFocus
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-3 py-4 space-y-1 animate-stagger-in">
              {navLinks.map((link) => {
                const Icon = link.icon
                const isActive =
                  pathname === link.href ||
                  pathname.startsWith(link.href + '/') ||
                  (link.href === '/problems' && pathname.startsWith('/problem/'))
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-primary/10 text-primary-light font-semibold'
                        : 'text-foreground hover:bg-muted hover:text-primary-light'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{link.label}</span>
                  </Link>
                )
              })}

              {user && (
                <>
                  <div className="pt-4 mt-4 border-t border-border">
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      个人中心
                    </div>
                  </div>

                  {canAccessAdminUser && (
                    <Link
                      href="/admin"
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-primary-light hover:bg-primary/10"
                    >
                      <Settings className="w-5 h-5 shrink-0" />
                      <span>后台管理</span>
                    </Link>
                  )}

                  {canAccessAdminUser && (
                    <Link
                      href="/submissions"
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-foreground hover:bg-muted hover:text-primary-light"
                    >
                      <ListChecks className="w-5 h-5 shrink-0" />
                      <span>提交记录</span>
                    </Link>
                  )}

                  <Link
                    href={`/user/${user.id}`}
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-foreground hover:bg-muted hover:text-primary-light"
                  >
                    <User className="w-5 h-5 shrink-0" />
                    <span>个人主页</span>
                  </Link>

                  <Link
                    href="/classes"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-foreground hover:bg-muted hover:text-primary-light"
                  >
                    <Users className="w-5 h-5 shrink-0" />
                    <span>我的班级</span>
                  </Link>

                  <Link
                    href="/settings"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-foreground hover:bg-muted hover:text-primary-light"
                  >
                    <Settings className="w-5 h-5 shrink-0" />
                    <span>设置</span>
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-3 py-3 rounded-xl transition-all duration-200 text-error hover:bg-error/10"
                  >
                    <LogOut className="w-5 h-5 shrink-0" />
                    <span>退出登录</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
