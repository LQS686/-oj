import { redirect } from 'next/navigation'

/** 兼容旧链接：单题页并入作业式三栏工作台 */
export default async function ContestProblemDetailRedirect({
  params,
}: {
  params: Promise<{ id: string; problemId: string }>
}) {
  const { id, problemId } = await params
  redirect(`/contests/${id}/problems?problem=${encodeURIComponent(problemId)}`)
}
