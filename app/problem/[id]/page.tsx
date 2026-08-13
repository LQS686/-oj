/**
 * 题面页（服务端组件）：SSR 预取题目详情 + 服务端渲染题面内容（markdown/KaTeX/代码高亮）。
 * 交互部分（编辑器 / tab / 提交）在 ProblemPageClient 中保持客户端渲染。
 */
import { notFound } from 'next/navigation'
import { getProblemDetailData } from '@/lib/problem/detail'
import { resolveViewerFromCookies } from '@/lib/api/handler'
import { AppError } from '@/lib/errors'
import type { Problem } from '@/types/models'
import ProblemDescription from '@/components/problem/ProblemDescription'
import ProblemPageClient from './ProblemPageClient'

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let data
  try {
    data = await getProblemDetailData(id, await resolveViewerFromCookies())
  } catch (error) {
    // 不存在或不可访问 → 统一 404，避免探测非公开题存在性
    if (error instanceof AppError && error.status === 404) {
      notFound()
    }
    throw error
  }

  // API 详情响应的形状与前端 Problem 类型一致（前端此前即按 Problem 消费该响应）
  const problem = data as unknown as Problem

  return (
    <ProblemPageClient
      problemId={id}
      initialProblem={problem}
      // 题面静态内容在服务端渲染（含缓存），客户端仅负责复制/回顶等交互
      descriptionContent={<ProblemDescription problem={problem} />}
    />
  )
}
