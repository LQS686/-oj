import Link from 'next/link'
import { Home, Search, AlertTriangle } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center animate-fadeIn">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl scale-150" />
          <span className="text-[180px] md:text-[220px] font-extrabold text-foreground opacity-30 select-none">
            404
          </span>
        </div>

        <div className="w-20 h-20 rounded-lg bg-amber-500 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-white" />
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
          页面未找到
        </h1>
        <p className="text-muted-foreground text-lg max-w-md mx-auto mb-8">
          抱歉，您访问的页面不存在或已被移除。<br />
          请检查链接是否正确，或返回首页继续浏览。
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
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
        </div>
      </div>
    </div>
  )
}
