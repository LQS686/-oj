import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type EntityInfoItem = {
  label: string
  value: ReactNode
  icon?: LucideIcon
}

/**
 * 竞赛信息 / 关于本题单 / 作业信息 共用侧栏元信息列表
 */
export default function EntityInfoCard({
  title,
  items,
  children,
}: {
  title: string
  items: EntityInfoItem[]
  /** 插在标题与列表之间，如报名按钮、开始学习 */
  children?: ReactNode
}) {
  return (
    <section className="card-static rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
      {items.length > 0 && (
        <dl className="divide-y divide-border">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="flex items-start gap-3 px-4 py-2.5 text-sm"
              >
                <dt className="flex items-center gap-1.5 text-muted-foreground shrink-0 w-[5.5rem]">
                  {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                  {item.label}
                </dt>
                <dd className="text-foreground font-medium min-w-0 break-words flex-1">
                  {item.value}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </section>
  )
}
