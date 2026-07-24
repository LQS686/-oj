'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useSettings } from '@/contexts/SettingsContext'

/**
 * 登录 / 注册 / 找回密码等访客居中卡片外壳。
 * 有意窄于 PageContainer form，聚焦单栏表单。
 */
export function GuestAuthShell({
  children,
  subtitle,
  maxWidthClass = 'max-w-md',
}: {
  children: ReactNode
  subtitle?: ReactNode
  maxWidthClass?: 'max-w-md' | 'max-w-lg'
}) {
  const { settings } = useSettings()
  const siteName = settings.siteName || '大山 OJ'
  const siteDescription = settings.siteDescription || '代码如山·算法为径·陪你从入门到顶峰'

  return (
    <div className="min-h-[calc(100vh-var(--navbar-height))] flex items-center justify-center p-4 py-8">
      <div className={`w-full ${maxWidthClass}`}>
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center bg-white shadow-md ring-1 ring-border/40">
              <img
                src="/logos/dsojlogo.png"
                alt={`${siteName} Logo`}
                width={48}
                height={48}
                className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-105"
              />
            </div>
            <div className="text-left">
              <span className="text-xl font-extrabold text-foreground">{siteName}</span>
              <p className="text-xs text-muted-foreground line-clamp-1">{siteDescription}</p>
            </div>
          </Link>
          {subtitle ? (
            <p className="text-muted-foreground mt-5 text-base md:text-lg">{subtitle}</p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  )
}
