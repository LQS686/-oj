import { redirect } from 'next/navigation'

/**
 * /problems/:id 无独立题面页（题面在 /problem/:id，题解在 /problems/:id/solutions）。
 * 误访 /problems/:id 时重定向，避免双轨分裂。
 */
export default async function ProblemsIdRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/problem/${id}`)
}
