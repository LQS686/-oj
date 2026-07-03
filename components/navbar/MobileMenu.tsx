'use client'

import React, { useState, useEffect } from 'react'
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
 LogOut
} from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { canAccessAdmin } from '@/lib/permissions'
import { useRouter } from 'next/navigation'

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
 ]

 useEffect(() => {
 if (isMenuOpen) {
 document.body.style.overflow = 'hidden'
 } else {
 document.body.style.overflow = ''
 }
 return () => {
 document.body.style.overflow = ''
 }
 }, [isMenuOpen])

 const handleLogout = async () => {
 setIsMenuOpen(false)
 await contextLogout()
 router.push('/')
 router.refresh()
 }

 return (
 <React.Fragment>
 <button
 onClick={() => setIsMenuOpen(true)}
 className="lg:hidden btn-ghost btn p-2.5 group"
 aria-label="打开菜单"
 >
 <Menu className="w-5 h-5 transition-transform duration-300 group-" />
 </button>

 {isMenuOpen && (
 <div className="fixed inset-0 z-[200] lg:hidden">
 <div
 className="absolute inset-0 bg-black/50 animate-fadeIn"
 onClick={() => setIsMenuOpen(false)}
 />

 <div className="absolute top-0 right-0 bottom-0 w-[280px] max-w-[80vw] bg-background shadow-2xl animate-slideInRight overflow-y-auto">
 <div className="flex items-center justify-between px-5 py-4 border-b border-border">
 <span className="font-bold text-lg text-foreground">导航菜单</span>
 <button
 onClick={() => setIsMenuOpen(false)}
 className="btn-ghost btn p-2"
 aria-label="关闭菜单"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 <div className="px-3 py-4 space-y-1">
 {navLinks.map((link) => {
 const Icon = link.icon
 const isActive = pathname === link.href
 return (
 <Link
 key={link.href}
 href={link.href}
 onClick={() => setIsMenuOpen(false)}
 className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
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
 <React.Fragment>
 <div className="pt-4 mt-4 border-t border-border">
 <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
 个人中心
 </div>

 {canAccessAdminUser && (
 <Link
 href="/admin"
 onClick={() => setIsMenuOpen(false)}
 className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-primary-light hover:bg-primary/10"
 >
 <Settings className="w-5 h-5 shrink-0" />
 <span>后台管理</span>
 </Link>
 )}

 {canAccessAdminUser && (
 <Link
 href="/submissions"
 onClick={() => setIsMenuOpen(false)}
 className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-foreground hover:bg-muted hover:text-primary-light"
 >
 <ListChecks className="w-5 h-5 shrink-0" />
 <span>提交记录</span>
 </Link>
 )}

 <Link
 href={`/user/${user.id}`}
 onClick={() => setIsMenuOpen(false)}
 className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-foreground hover:bg-muted hover:text-primary-light"
 >
 <User className="w-5 h-5 shrink-0" />
 <span>个人主页</span>
 </Link>

 <Link
 href="/settings"
 onClick={() => setIsMenuOpen(false)}
 className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-foreground hover:bg-muted hover:text-primary-light"
 >
 <Settings className="w-5 h-5 shrink-0" />
 <span>设置</span>
 </Link>

 <button
 onClick={handleLogout}
 className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all duration-200 text-error hover:bg-error/10"
 >
 <LogOut className="w-5 h-5 shrink-0" />
 <span>退出登录</span>
 </button>
 </div>
 </React.Fragment>
 )}
 </div>
 </div>
 </div>
 )}
 </React.Fragment>
 )
}
