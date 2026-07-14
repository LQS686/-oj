'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
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

const overlayVariants = {
 hidden: { opacity: 0 },
 visible: { opacity: 1 },
}

const panelVariants = {
  hidden: { x: '100%' },
  visible: {
    x: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 30 },
  },
  exit: {
    x: '100%',
    transition: { duration: 0.2, ease: 'easeIn' as const },
  },
}

const itemVariants = {
 hidden: { opacity: 0, x: 20 },
 visible: (i: number) => ({
   opacity: 1,
   x: 0,
   transition: { delay: i * 0.05, duration: 0.2 },
 }),
}

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
 <>
 <button
 onClick={() => setIsMenuOpen(true)}
 className="lg:hidden btn-ghost btn p-2.5 group"
 aria-label="打开菜单"
 >
 <Menu className="w-5 h-5" />
 </button>

 <AnimatePresence>
 {isMenuOpen && (
 <motion.div
   className="fixed inset-0 z-[200] lg:hidden"
   initial="hidden"
   animate="visible"
   exit="hidden"
 >
   <motion.div
     className="absolute inset-0 bg-black/50"
     variants={overlayVariants}
     onClick={() => setIsMenuOpen(false)}
   />

   <motion.div
     className="absolute top-0 right-0 bottom-0 w-[280px] max-w-[80vw] bg-background shadow-2xl overflow-y-auto"
     variants={panelVariants}
   >
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
       {navLinks.map((link, i) => {
         const Icon = link.icon
         const isActive = pathname === link.href || pathname.startsWith(link.href + '/')
         return (
           <motion.div
             key={link.href}
             custom={i}
             variants={itemVariants}
             initial="hidden"
             animate="visible"
           >
             <Link
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
           </motion.div>
         )
       })}

       {user && (
         <>
           <motion.div
             custom={navLinks.length}
             variants={itemVariants}
             initial="hidden"
             animate="visible"
             className="pt-4 mt-4 border-t border-border"
           >
             <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
               个人中心
             </div>
           </motion.div>

           {canAccessAdminUser && (
             <motion.div
               custom={navLinks.length + 1}
               variants={itemVariants}
               initial="hidden"
               animate="visible"
             >
               <Link
                 href="/admin"
                 onClick={() => setIsMenuOpen(false)}
                 className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-primary-light hover:bg-primary/10"
               >
                 <Settings className="w-5 h-5 shrink-0" />
                 <span>后台管理</span>
               </Link>
             </motion.div>
           )}

           {canAccessAdminUser && (
             <motion.div
               custom={navLinks.length + 2}
               variants={itemVariants}
               initial="hidden"
               animate="visible"
             >
               <Link
                 href="/submissions"
                 onClick={() => setIsMenuOpen(false)}
                 className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-foreground hover:bg-muted hover:text-primary-light"
               >
                 <ListChecks className="w-5 h-5 shrink-0" />
                 <span>提交记录</span>
               </Link>
             </motion.div>
           )}

           <motion.div
             custom={navLinks.length + 3}
             variants={itemVariants}
             initial="hidden"
             animate="visible"
           >
             <Link
               href={`/user/${user.id}`}
               onClick={() => setIsMenuOpen(false)}
               className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-foreground hover:bg-muted hover:text-primary-light"
             >
               <User className="w-5 h-5 shrink-0" />
               <span>个人主页</span>
             </Link>
           </motion.div>

           <motion.div
             custom={navLinks.length + 4}
             variants={itemVariants}
             initial="hidden"
             animate="visible"
           >
             <Link
               href="/classes"
               onClick={() => setIsMenuOpen(false)}
               className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-foreground hover:bg-muted hover:text-primary-light"
             >
               <Users className="w-5 h-5 shrink-0" />
               <span>我的班级</span>
             </Link>
           </motion.div>

           <motion.div
             custom={navLinks.length + 5}
             variants={itemVariants}
             initial="hidden"
             animate="visible"
           >
             <Link
               href="/settings"
               onClick={() => setIsMenuOpen(false)}
               className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-foreground hover:bg-muted hover:text-primary-light"
             >
               <Settings className="w-5 h-5 shrink-0" />
               <span>设置</span>
             </Link>
           </motion.div>

           <motion.div
             custom={navLinks.length + 6}
             variants={itemVariants}
             initial="hidden"
             animate="visible"
           >
             <button
               onClick={handleLogout}
               className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all duration-200 text-error hover:bg-error/10"
             >
               <LogOut className="w-5 h-5 shrink-0" />
               <span>退出登录</span>
             </button>
           </motion.div>
         </>
       )}
     </div>
   </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 </>
 )
}
