'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import ContestHeader from './ContestHeader'
import { PageContainer } from '@/components/layout'

interface Contest {
  id: string
  title: string
  startTime: Date
  endTime: Date
  type: string
}

/** 进入单题详情时隐藏竞赛顶栏（倒计时改在右侧栏） */
export default function ContestHeaderShell({
  contest,
  canViewDetails,
  children,
}: {
  contest: Contest
  canViewDetails: boolean
  children: ReactNode
}) {
  const pathname = usePathname()
  const hideHeader = /^\/contests\/[^/]+\/problems\/[^/]+$/.test(pathname)

  return (
    <div className="min-h-screen bg-background">
      {!hideHeader && <ContestHeader contest={contest} canViewDetails={canViewDetails} />}
      {hideHeader ? (
        <>{children}</>
      ) : (
        <PageContainer variant="full" className="py-6">{children}</PageContainer>
      )}
    </div>
  )
}