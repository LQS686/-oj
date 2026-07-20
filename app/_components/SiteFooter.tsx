'use client'

import Link from 'next/link'

export function SiteFooter({ siteName, siteDescription }: { siteName: string; siteDescription: string }) {
  return (
    <footer className="mt-auto border-t border-border bg-muted/20">
      <div className="container mx-auto px-4">
        {/* 上区：品牌 + 导航 + 友情链接 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 py-8">
          {/* 品牌区 */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center bg-white ring-1 ring-border/40 shrink-0">
              <img
                src="/logos/dsojlogo.png"
                alt={`${siteName} Logo`}
                width={36}
                height={36}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-foreground text-sm leading-tight">{siteName}</span>
              <span className="text-[11px] text-muted-foreground leading-snug mt-0.5">{siteDescription}</span>
            </div>
          </div>

          {/* 导航区 */}
          <nav className="flex flex-col items-start md:items-center gap-2 md:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1">导航</span>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              <Link href="/problems" className="hover:text-primary transition-colors duration-200 font-medium">题库</Link>
              <Link href="/contests" className="hover:text-primary transition-colors duration-200 font-medium">竞赛</Link>
              <Link href="/training" className="hover:text-primary transition-colors duration-200 font-medium">训练</Link>
              <Link href="/rank" className="hover:text-primary transition-colors duration-200 font-medium">排行榜</Link>
            </div>
          </nav>

          {/* 友情链接区 */}
          <div className="flex flex-col items-start md:items-end gap-2 md:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1">友情链接</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground md:justify-end">
              <a
                href="https://www.luogu.com.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors duration-200 font-medium"
              >
                洛谷
              </a>
              <span className="text-border/60">·</span>
              <a
                href="https://oj.czos.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors duration-200 font-medium"
              >
                东方博宜OJ
              </a>
            </div>
          </div>
        </div>

        {/* 下区：版权 + ICP备案 */}
        <div className="border-t border-border/60 py-4 flex flex-col items-center gap-1.5">
          <p className="text-center text-xs text-muted-foreground/80">
            &copy; {new Date().getFullYear()} {siteName} · 代码如山·算法为径·陪你从入门到顶峰
          </p>
          <p className="text-center text-[11px] text-muted-foreground/60 flex items-center gap-1.5">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors duration-200"
            >
              蜀ICP备2026040117号-1
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
