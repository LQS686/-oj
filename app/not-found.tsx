'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Home, Search, AlertTriangle } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="text-center"
      >
        <div className="relative mb-8">
          <motion.div 
            className="absolute inset-0 bg-primary/10 rounded-full blur-3xl scale-150"
            animate={{ 
              scale: [1.5, 1.6, 1.5],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.span 
            className="text-[180px] md:text-[220px] font-extrabold text-foreground opacity-30"
            animate={{ 
              opacity: [0.2, 0.35, 0.2],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            404
          </motion.span>
        </div>

        <motion.div 
          className="w-20 h-20 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/30"
          animate={{ 
            rotate: [0, -5, 5, -5, 0],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <AlertTriangle className="w-10 h-10 text-white" />
        </motion.div>

        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
          页面未找到
        </h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto mb-8">
          抱歉，您访问的页面不存在或已被移除。<br />
          请检查链接是否正确，或返回首页继续浏览。
        </p>

        <motion.div 
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <Link
            href="/"
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Home className="w-5 h-5" />
            返回首页
          </Link>
          <Link
            href="/problems"
            className="btn btn-outline inline-flex items-center gap-2"
          >
            <Search className="w-5 h-5" />
            浏览题库
          </Link>
        </motion.div>
      </motion.div>
    </div>
  )
}
