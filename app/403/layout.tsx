import { pageMetadata } from '@/lib/metadata'

export const metadata = pageMetadata('无权限')

export default function ForbiddenLayout({ children }: { children: React.ReactNode }) {
  return children
}