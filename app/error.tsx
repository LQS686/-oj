'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { logger } from '@/lib/logger'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error('Client-side error caught', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md animate-fadeIn">
        <Link href="/" className="inline-block mb-6 group" aria-label="返回首页">
          <div className="w-16 h-16 mx-auto rounded-xl overflow-hidden bg-white shadow-md ring-1 ring-border/40 transition-transform duration-200 group-hover:scale-105">
            <img
              src="/logos/dsojlogo.png"
              alt="大山 OJ Logo"
              width={64}
              height={64}
              className="w-full h-full object-contain"
            />
          </div>
        </Link>

        <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-error to-red-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-error/30 transition-transform duration-300 hover:scale-110 hover:rotate-3">
          <AlertCircle className="w-10 h-10 text-white" />
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-4">
          出错了
        </h1>
        <p className="text-muted-foreground text-lg mb-8">
          抱歉，系统遇到了一些问题。我们已经记录了此错误，请稍后重试。
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={reset}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            重试
          </button>
          <Link
            href="/"
            className="btn btn-outline inline-flex items-center gap-2"
          >
            <Home className="w-5 h-5" />
            返回首页
          </Link>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 rounded-xl bg-error/10 border border-error/20 text-left">
            <p className="text-sm font-medium text-error mb-2">错误详情：</p>
            <p className="text-xs text-error/80 font-mono break-all">
              {error.message}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
