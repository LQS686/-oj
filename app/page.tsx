'use client'

import { useSettings } from '@/contexts/SettingsContext'
import { useUser } from '@/contexts/UserContext'
import { DashboardView } from '@/app/_components/DashboardView'
import { GuestView } from '@/app/_components/GuestView'
import { SiteFooter } from '@/app/_components/SiteFooter'
import { PageContainer } from '@/components/layout'

export default function Home() {
  const { settings } = useSettings()
  const { user, isLoading } = useUser()
  // 最终兜底：确保品牌名称/描述永不显示空白
  const siteName = settings.siteName || '大山 OJ'
  const siteDescription = settings.siteDescription || '代码如山·算法为径·陪你从入门到顶峰'

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col">
      {isLoading ? (
        <PageContainer className="py-4 md:py-6 flex-1">
          <div className="space-y-4 animate-pulse" aria-hidden="true">
            <div className="h-8 w-64 rounded-lg bg-muted/60" />
            <div className="h-24 rounded-xl bg-muted/40" />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="h-28 rounded-xl bg-muted/40" />
              <div className="h-28 rounded-xl bg-muted/40" />
            </div>
          </div>
        </PageContainer>
      ) : user ? (
        <PageContainer className="py-4 md:py-6 flex-1">
          <DashboardView />
        </PageContainer>
      ) : (
        <div className="flex-1">
          <GuestView />
        </div>
      )}

      <SiteFooter siteName={siteName} siteDescription={siteDescription} />
    </div>
  )
}
