import type { ReactNode } from 'react'
import { FileText } from 'lucide-react'
import MarkdownRenderer from '@/components/common/MarkdownRenderer'

/**
 * 竞赛说明 / 题单简介 / 作业说明 共用主栏卡片
 */
export default function EntityDescriptionCard({
  title,
  content,
  emptyTitle,
  emptyHint,
  headerAction,
  footer,
}: {
  title: string
  content?: string | null
  emptyTitle: string
  emptyHint?: string
  headerAction?: ReactNode
  footer?: ReactNode
}) {
  const hasContent = !!content?.trim()

  return (
    <section className="card-static rounded-xl overflow-hidden min-w-0">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-primary-light" />
          </div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
        </div>
        {headerAction}
      </div>

      <div className="px-5 py-5">
        {hasContent ? (
          <div className="prose prose-sm max-w-none text-foreground">
            <MarkdownRenderer content={content!} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-10 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">{emptyTitle}</p>
            {emptyHint && (
              <p className="text-xs text-muted-foreground/80">{emptyHint}</p>
            )}
          </div>
        )}
        {footer}
      </div>
    </section>
  )
}
