'use client'

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

/** 与作业页一致：workspace 宽度 + 顶栏卡片 + 内容区 */
export default function ContestHeaderShell({
  contest,
  canViewDetails,
  children,
}: {
  contest: Contest
  canViewDetails: boolean
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-6">
      <PageContainer variant="workspace" className="py-4">
        <ContestHeader contest={contest} canViewDetails={canViewDetails} />
        {children}
      </PageContainer>
    </div>
  )
}
