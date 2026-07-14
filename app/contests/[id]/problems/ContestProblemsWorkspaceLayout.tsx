'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  ContestProblemWorkspaceProvider,
  type ContestMeta,
  type ContestProblemItem,
} from '@/contexts/ContestProblemWorkspaceContext'
import ContestProblemSidebar from '@/components/contest/ContestProblemSidebar'
import ContestProblemMainHeader from '@/components/contest/ContestProblemMainHeader'
import { fetchWithCookie } from '@/lib/api/base'

export default function ContestProblemsWorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const contestId = params.id as string
  const problemId = params.problemId as string | undefined

  const [contest, setContest] = useState<ContestMeta | null>(null)
  const [initialProblems, setInitialProblems] = useState<ContestProblemItem[] | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [cRes, pRes] = await Promise.all([
          fetchWithCookie(`/api/contests/${contestId}`),
          fetchWithCookie(`/api/contests/${contestId}/problems`, { cache: 'no-store' }),
        ])
        const cData = await cRes.json()
        const pData = await pRes.json()
        if (cancelled) return
        if (!cData.success || !cData.data) {
          setLoadError('加载竞赛失败')
          return
        }
        const c = cData.data
        setContest({
          id: c.id,
          title: c.title,
          startTime: c.startTime,
          endTime: c.endTime,
          type: c.type,
        })
        setInitialProblems(pData.success && Array.isArray(pData.data) ? pData.data : [])
      } catch {
        if (!cancelled) setLoadError('网络错误')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [contestId])

  if (!problemId) {
    return <>{children}</>
  }

  if (loadError) {
    return (
      <div className="container mx-auto px-4 py-12 text-center text-error">{loadError}</div>
    )
  }

  if (!contest || initialProblems === null) {
    return (
      <div className="container mx-auto px-4 py-24 flex justify-center">
        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <ContestProblemWorkspaceProvider
      contestId={contestId}
      contest={contest}
      initialProblems={initialProblems}
    >
      <div className="container mx-auto px-4 py-4 pb-8">
        <ContestProblemMainHeader />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 items-start">
          <div className="min-w-0">{children}</div>
          <ContestProblemSidebar />
        </div>
      </div>
    </ContestProblemWorkspaceProvider>
  )
}