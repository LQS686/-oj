import { redirect } from 'next/navigation'

/** 兼容旧单题链接 → 题单详情练习 Tab */
export default async function TrainingProblemDetailRedirect({
  params,
}: {
  params: Promise<{ id: string; problemId: string }>
}) {
  const { id, problemId } = await params
  redirect(
    `/training/${id}?tab=problems&problem=${encodeURIComponent(problemId)}`
  )
}
