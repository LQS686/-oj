'use client'

import Link from 'next/link'
import { PageContainer } from '@/components/layout'

export function SiteFooter({ siteName, siteDescription }: { siteName: string; siteDescription: string }) {
  return (
    <footer className="mt-auto border-t border-border bg-muted/20">
      <PageContainer variant="full">
        {/* 品牌 + 帮助/友链（不重复顶栏主导航） */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-5">
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
              <span className="text-xs text-muted-foreground leading-snug mt-0.5">{siteDescription}</span>
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground md:justify-end">
              <Link href="/help" className="hover:text-primary transition-colors font-medium">
                使用帮助
              </Link>
              <span className="text-border/60">·</span>
              <a
                href="https://www.luogu.com.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors font-medium"
              >
                洛谷
              </a>
              <span className="text-border/60">·</span>
              <a
                href="https://oj.czos.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors font-medium"
              >
                东方博宜OJ
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-border/60 py-3 flex flex-col sm:flex-row items-center justify-center gap-x-3 gap-y-1">
          <p className="text-center text-xs text-muted-foreground/80">
            &copy; {new Date().getFullYear()} {siteName}
          </p>
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-xs text-muted-foreground/60 hover:text-primary transition-colors"
          >
            蜀ICP备2026040117号-1
          </a>
        </div>
      </PageContainer>
    </footer>
  )
}
