import { redirect } from 'next/navigation'

/** 旧路径兼容：题解详情统一挂在 /problem/:id/solutions/:solutionId */
export default async function LegacySolutionDetailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; solutionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id, solutionId } = await params
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v))
    else if (value !== undefined) query.set(key, value)
  }
  const suffix = query.toString()
  redirect(`/problem/${id}/solutions/${solutionId}${suffix ? `?${suffix}` : ''}`)
}
