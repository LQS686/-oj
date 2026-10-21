import { redirect } from 'next/navigation'

/**
 * /problems/:id 无独立题面页（题面与题解均在 /problem/:id）。
 * 误访 /problems/:id 时重定向，避免双轨分裂。
 */
export default async function ProblemsIdRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v))
    else if (value !== undefined) query.set(key, value)
  }
  const suffix = query.toString()
  redirect(`/problem/${id}${suffix ? `?${suffix}` : ''}`)
}
