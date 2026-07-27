import { redirect } from 'next/navigation'

/**
 * 题解列表已并入题目页「题解」Tab（行内展开）。
 * 保留此路由以免旧链接/书签失效。
 */
export default async function SolutionsListRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ create?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const q = new URLSearchParams({ tab: 'solutions' })
  if (sp.create === '1') q.set('create', '1')
  redirect(`/problem/${id}?${q.toString()}`)
}
