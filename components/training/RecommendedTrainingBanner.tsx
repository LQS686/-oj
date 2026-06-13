'use client'

/**
 * components/training/RecommendedTrainingBanner.tsx
 * 列表页顶部推荐位（最多 3 个）
 */
import Link from 'next/link'
import { Sparkles, ChevronRight, BookOpen } from 'lucide-react'

export interface RecommendedTraining {
  id: string
  title: string
  description: string
  difficulty: string
  cover?: string | null
  problemCount: number
  joinCount?: number
  category?: { id: string; name: string } | null
}

interface RecommendedTrainingBannerProps {
  items: RecommendedTraining[]
}

export function RecommendedTrainingBanner({ items }: RecommendedTrainingBannerProps) {
  if (!items || items.length === 0) return null

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-warning" />
          编辑推荐
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map(t => (
          <Link
            key={t.id}
            href={`/training/${t.id}`}
            className="card-static p-5 group hover:border-primary/40 transition-all"
          >
            <div className="flex items-start gap-3">
              {t.cover ? (
                <div
                  className="w-12 h-12 rounded-lg bg-cover bg-center flex-shrink-0"
                  style={{ backgroundImage: `url(${t.cover})` }}
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-primary-light" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  {t.category && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/15 text-primary-light">
                      {t.category.name}
                    </span>
                  )}
                  <span className="text-xs px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                    {t.difficulty}
                  </span>
                </div>
                <h3 className="font-semibold text-foreground group-hover:text-primary-light transition-colors line-clamp-1">
                  {t.title}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {t.description}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                  <span>{t.problemCount} 题</span>
                  {typeof t.joinCount === 'number' && (
                    <>
                      <span>·</span>
                      <span>{t.joinCount} 人加入</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end mt-3 text-xs text-primary-light group-hover:gap-2 transition-all">
              开始学习
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default RecommendedTrainingBanner
