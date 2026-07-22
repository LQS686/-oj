'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  TrainingProblemWorkspaceProvider,
  type TrainingMeta,
  type TrainingProblemItem,
} from '@/contexts/TrainingProblemWorkspaceContext'
import TrainingProblemSidebar from '@/components/training/TrainingProblemSidebar'
import TrainingProblemMainHeader from '@/components/training/TrainingProblemMainHeader'
import { fetchWithCookie } from '@/lib/api/base'
import { PageContainer } from '@/components/layout'

export default function TrainingProblemsWorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const trainingId = params.id as string
  const problemId = params.problemId as string | undefined

  const [training, setTraining] = useState<TrainingMeta | null>(null)
  const [initialProblems, setInitialProblems] = useState<TrainingProblemItem[] | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetchWithCookie(`/api/trainings/${trainingId}/problem-list`, { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return
        if (!data.success || !data.data?.training) {
          setLoadError('加载题单失败')
          return
        }
        setTraining({
          id: data.data.training.id,
          title: data.data.training.title,
        })
        setInitialProblems(
          Array.isArray(data.data.problems) ? data.data.problems : []
        )
      } catch {
        if (!cancelled) setLoadError('网络错误')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [trainingId])

  if (!problemId) {
    return <>{children}</>
  }

  if (loadError) {
    return (
      <PageContainer className="py-12 text-center text-error">{loadError}</PageContainer>
    )
  }

  if (!training || initialProblems === null) {
    return (
      <PageContainer className="py-24 flex justify-center">
        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </PageContainer>
    )
  }

  return (
    <TrainingProblemWorkspaceProvider
      trainingId={trainingId}
      training={training}
      initialProblems={initialProblems}
    >
      <PageContainer className="py-4 pb-8">
        <TrainingProblemMainHeader />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 items-start">
          <div className="min-w-0">{children}</div>
          <TrainingProblemSidebar />
        </div>
      </PageContainer>
    </TrainingProblemWorkspaceProvider>
  )
}