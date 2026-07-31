import AdminLayout from '@/components/AdminLayout'
import { pageMetadata } from '@/lib/metadata'

export const metadata = pageMetadata('管理后台')

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>
}
