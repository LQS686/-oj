import { redirect } from 'next/navigation'

/**
 * 旧做题入口并入题单详情「练习」Tab
 * /training/:id/problems?problem=xxx → /training/:id?tab=problems&problem=xxx
 */
export default async function TrainingProblemsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ problem?: string }>
}) {
  const { id } = await params
  const { problem } = await searchParams
  const qs = new URLSearchParams({ tab: 'problems' })
  if (problem) qs.set('problem', problem)
  redirect(`/training/${id}?${qs.toString()}`)
}
