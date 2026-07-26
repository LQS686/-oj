import type { ReactNode } from 'react'

/**
 * 概览页两栏：主说明 + sticky 侧栏（竞赛 / 题单 / 作业信息）
 */
export default function EntityOverviewLayout({
  main,
  aside,
}: {
  main: ReactNode
  aside: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)] gap-4 lg:gap-5 items-start">
      <div className="min-w-0 space-y-4">{main}</div>
      <aside className="space-y-3 lg:sticky lg:top-[72px]">{aside}</aside>
    </div>
  )
}
