import { redirect } from 'next/navigation'

/** 新建题解入口 → 题目页题解 Tab 并打开创建弹窗 */
export default async function NewSolutionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/problem/${id}?tab=solutions&create=1`)
}
