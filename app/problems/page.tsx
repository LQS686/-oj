import { Suspense } from 'react'
import { getServerSessionUser } from '@/lib/auth/server-session'
import { listProblemTags, listPublicProblems } from '@/lib/problem/service'
import { getProblemStatusesForUser } from '@/lib/problem/user-status'
import { PageContainer } from '@/components/layout'
import ProblemsView, { type ProblemsInitialData } from './ProblemsView'

const PAGE_SIZE = 30

async function loadInitialData(): Promise<ProblemsInitialData | null> {
  try {
    const [user, list, tags] = await Promise.all([
      getServerSessionUser(),
      listPublicProblems({ page: 1, pageSize: PAGE_SIZE }),
      // 标签集合来自全库扫描，库内已有 5 分钟缓存；失败不影响列表
      listProblemTags().catch((): string[] => []),
    ])
    const statuses = user
      ? await getProblemStatusesForUser(
          user.id,
          list.problems.map((p) => p.id)
        )
      : {}
    return {
      problems: list.problems,
      total: list.pagination.total,
      totalPages: list.pagination.totalPages,
      tags,
      statuses,
    }
  } catch {
    // 首屏取数失败时回退为客户端拉取，不把整页打成错误态
    return null
  }
}

function ProblemsSkeleton() {
  return (
    <PageContainer className="py-4 md:py-6">
      <div className="space-y-4 animate-pulse" aria-hidden="true">
        <div className="h-9 w-28 rounded bg-muted/60" />
        <div className="h-10 rounded-lg bg-muted/40" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/30" />
          ))}
        </div>
      </div>
    </PageContainer>
  )
}

async function ProblemsContent() {
  const initialData = await loadInitialData()
  return <ProblemsView initialData={initialData} />
}

export default function ProblemsPage() {
  return (
    <Suspense fallback={<ProblemsSkeleton />}>
      <ProblemsContent />
    </Suspense>
  )
}
