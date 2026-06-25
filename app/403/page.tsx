'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Home, ShieldX, Mail } from 'lucide-react'

export default function ForbiddenPage() {
 return (
 <div className="min-h-screen flex items-center justify-center px-4 py-12">
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.5 }}
 className="card-static max-w-lg w-full p-8 md:p-12 text-center"
 >
 <div className="relative mb-6">
 <div className="absolute inset-0 bg-error/10 rounded-full blur-3xl scale-150"></div>
 <div className="relative">
 <span className="text-[140px] md:text-[180px] font-extrabold leading-none" style={{ color: 'var(--error)', opacity: 0.85 }}>
 403
 </span>
 </div>
 </div>

 <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-error to-red-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-error/30">
 <ShieldX className="w-8 h-8 text-white" />
 </div>

 <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
 无权访问
 </h1>
 <p className="text-muted-foreground text-sm md:text-base mb-8 leading-relaxed">
 您没有访问此页面的权限，请联系系统管理员
 </p>

 <div className="flex flex-col sm:flex-row gap-3 justify-center">
 <Link
 href="/"
 className="btn btn-primary inline-flex items-center justify-center gap-2"
 >
 <Home className="w-4 h-4" />
 返回首页
 </Link>
 <a
 href="mailto:admin@oj.local"
 className="btn btn-outline inline-flex items-center justify-center gap-2"
 >
 <Mail className="w-4 h-4" />
 联系管理员
 </a>
 </div>
 </motion.div>
 </div>
 )
}
