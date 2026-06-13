'use client'

/**
 * components/training/ProblemListItem.tsx
 * 题单中单个题目行
 */
import Link from 'next/link'
import { CheckCircle2, Circle, AlertCircle, Loader2, ChevronRight } from 'lucide-react'
import type { TrainingProblemStatus } from '@/lib/training/types'

export interface ProblemListItemData {
  problemId: string
  title: string
  difficulty: string
  orderIndex: number
  score: number
  required: boolean
  status: TrainingProblemStatus
  tags?: string[]
}

interface ProblemListItemProps {
  item: ProblemListItemData
  trainingId: string
  judgeStatus?: { problemId: string; status: string } | null
}

function difficultyClass(diff: string) {
  if (diff.includes('入门')) return 'text-success'
  if (diff.includes('提高') || diff.includes('省选') || diff.includes('NOI')) return 'text-error'
  if (diff.includes('普及')) return 'text-warning'
  return 'text-primary-light'
}

function statusBadge(status: TrainingProblemStatus, judgeStatus?: string | null) {
  if (judgeStatus && (judgeStatus === 'Pending' || judgeStatus === 'Judging' || judgeStatus === 'Running')) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-info">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        评测中
      </span>
    )
  }
  switch (status) {
    case 'AC':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="w-3.5 h-3.5" />
          已通过
        </span>
      )
    case 'ATTEMPTED':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-error">
          <AlertCircle className="w-3.5 h-3.5" />
          尝试过
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Circle className="w-3.5 h-3.5" />
          未开始
        </span>
      )
  }
}

export function ProblemListItem({ item, trainingId, judgeStatus }: ProblemListItemProps) {
  const isJudging = judgeStatus?.problemId === item.problemId
    && judgeStatus.status
    && ['Pending', 'Judging', 'Running'].includes(judgeStatus.status)

  return (
    <Link
      href={`/problem/${item.problemId}?from=training&trainingId=${trainingId}`}
      className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-primary/5 transition-colors group"
    >
      <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center text-sm font-semibold text-muted-foreground flex-shrink-0">
        {item.orderIndex + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground group-hover:text-primary-light transition-colors truncate">
            {item.title}
          </span>
          {item.required && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/20 flex-shrink-0">
              必做
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span className={difficultyClass(item.difficulty)}>{item.difficulty}</span>
          {item.score > 0 && <span>· {item.score} 分</span>}
        </div>
      </div>
      <div className="flex-shrink-0">
        {statusBadge(item.status, isJudging ? judgeStatus?.status : null)}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary-light flex-shrink-0" />
    </Link>
  )
}

export default ProblemListItem
