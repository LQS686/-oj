import { pageMetadata } from '@/lib/metadata'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata('管理后台')

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children
}