'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import ContestHeader from './ContestHeader'

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
      <div className={hideHeader ? '' : 'container mx-auto px-4 py-6'}>{children}</div>
    </div>
  )
}