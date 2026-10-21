import { Suspense } from 'react'
import { getServerSessionUser } from '@/lib/auth/server-session'
import { getHomeDashboard } from '@/lib/home/dashboard'
import { listPublicAnnouncements } from '@/lib/announcement/service'
import { getUserPreferencesCollection } from '@/lib/user/service'
import { DashboardView } from '@/app/_components/DashboardView'
import { GuestView } from '@/app/_components/GuestView'
import { SiteFooter } from '@/app/_components/SiteFooter'
import { PageContainer } from '@/components/layout'

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="h-24 rounded-lg bg-muted/40" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="h-28 rounded-lg bg-muted/40" />
        <div className="h-28 rounded-lg bg-muted/40" />
        <div className="h-28 rounded-lg bg-muted/40" />
      </div>
      <div className="h-40 rounded-lg bg-muted/40" />
    </div>
  )
}

async function AuthedHome({ userId }: { userId: string }) {
  // 偏好只影响公告 toast；Mongo 读取失败不应连带首页白屏
  const [data, preferences] = await Promise.all([
    getHomeDashboard(userId),
    getUserPreferencesCollection(userId).catch((): Record<string, unknown> => ({})),
  ])
  const notifications = preferences.notifications as { systemAnnouncement?: boolean } | undefined

  return (
    <DashboardView
      initialData={data}
      initialAllowAnnouncementToast={notifications?.systemAnnouncement !== false}
    />
  )
}

async function HomeContent() {
  const user = await getServerSessionUser()

  if (!user) {
    const announcements = await listPublicAnnouncements(6)
    return (
      <div className="flex-1">
        <GuestView initialAnnouncements={announcements} />
      </div>
    )
  }

  return (
    <PageContainer className="py-4 md:py-6 flex-1">
      <Suspense fallback={<DashboardSkeleton />}>
        <AuthedHome userId={user.id} />
      </Suspense>
    </PageContainer>
  )
}

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-var(--navbar-height))] flex flex-col">
      <Suspense
        fallback={
          <PageContainer className="py-4 md:py-6 flex-1">
            <DashboardSkeleton />
          </PageContainer>
        }
      >
        <HomeContent />
      </Suspense>

      <SiteFooter />
    </div>
  )
}
