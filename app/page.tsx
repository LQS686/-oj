'use client'

import { useSettings } from '@/contexts/SettingsContext'
import { useUser } from '@/contexts/UserContext'
import { DashboardView } from '@/app/_components/DashboardView'
import { GuestView } from '@/app/_components/GuestView'
import { SiteFooter } from '@/app/_components/SiteFooter'
import { PageContainer } from '@/components/layout'

export default function Home() {
  const { settings } = useSettings()
  const { user } = useUser()
  // 最终兜底：确保品牌名称/描述永不显示空白
  const siteName = settings.siteName || '大山 OJ'
  const siteDescription = settings.siteDescription || '代码如山·算法为径·陪你从入门到顶峰'

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col">
      <PageContainer className="py-6 md:py-10 flex-1">
        {user ? <DashboardView /> : <GuestView />}
      </PageContainer>

      <SiteFooter siteName={siteName} siteDescription={siteDescription} />
    </div>
  )
}
