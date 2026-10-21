import { redirect } from 'next/navigation'
import { getServerSessionUser } from '@/lib/auth/server-session'
import { canAccessAdmin } from '@/lib/permissions'
import { computeAdminDashboard } from '@/lib/admin/dashboard'
import AdminDashboardView, { type DashboardStats } from './AdminDashboardView'

/** 服务端取首屏仪表盘数据：避免进入后台先空转 spinner 再发一次请求 */
async function loadInitialStats(): Promise<DashboardStats | null> {
  try {
    const data = await computeAdminDashboard()
    return {
      ...data,
      recentSubmissions: data.recentSubmissions.map((s) => ({
        ...s,
        submittedAt: s.submittedAt.toISOString(),
      })),
    }
  } catch {
    // 取数失败时回退客户端拉取，不把整页打成错误态
    return null
  }
}

export default async function AdminDashboardPage() {
  const user = await getServerSessionUser()
  if (!canAccessAdmin(user)) redirect('/403')

  const initialStats = await loadInitialStats()
  return <AdminDashboardView initialStats={initialStats} />
}
