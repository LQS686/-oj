'use client'

import { Check, X } from 'lucide-react'
import ProblemTimer from '@/components/class/ProblemTimer'
import ProblemLetterRail, {
  type ProblemLetterRailItem,
  type ProblemLetterStatus,
} from '@/components/problem/ProblemLetterRail'
import {
  OBJECTIVE_QUESTION_TYPE_LABELS,
  type ObjectiveQuestionType,
} from '@/lib/objective-question/types'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export interface Problem {
  id: string
  title: string
  difficulty: string
  totalSubmit: number
  totalAccepted: number
}

export interface Submission {
  id: string
  userId?: string
  problemId?: string
  status: string
  score?: number
  submittedAt: string
  timeElapsedMs?: number
}

/** 左栏客观题导航条目（仅需 id / 题号 / 题型） */
export interface ObjectiveNavItem {
  id: string
  questionNumber: string | null
  type: string
}

/** 客观题作答状态（仅需判对与否，用于角标） */
export interface ObjectiveNavSubmission {
  questionId: string
  isCorrect: boolean
}

export interface AssignmentProblemProgressListProps {
  problems: Problem[]
  submissions: Submission[]
  selectedIndex: number
  onSelect: (index: number) => void
  classId: string
  assignmentId: string
  assignmentEndTime?: string
  /** 作业客观题（按作业内顺序）；不传或为空时不渲染客观题分组 */
  objectiveQuestions?: ObjectiveNavItem[]
  /** 当前用户客观题最新作答（用于状态角标） */
  objectiveSubmissions?: ObjectiveNavSubmission[]
  /** 当前选中的客观题索引（0 起）；null = 未选中客观题 */
  selectedObjectiveIndex?: number | null
  /** 选中客观题回调（索引 0 起） */
  onSelectObjective?: (index: number) => void
}

function getBestSubmission(
  problemId: string,
  submissions: Submission[]
): Submission | null {
  const subs = submissions.filter((s) => s.problemId === problemId)
  if (subs.length === 0) return null
  return subs.reduce((best, current) =>
    (current.score || 0) > (best.score || 0) ? current : best
  )
}

function toRailStatus(sub: Submission | null): ProblemLetterStatus {
  if (!sub) return null
  if (sub.status === 'AC') return 'AC'
  return 'Attempted'
}

/**
 * 作业题号轨：基于共享 ProblemLetterRail，附加得分与计时器。
 * 存在客观题时，在编程题分组下方追加「客观题」数字导航分组（无计时器）。
 */
export default function AssignmentProblemProgressList({
  problems,
  submissions,
  selectedIndex,
  onSelect,
  classId,
  assignmentId,
  assignmentEndTime,
  objectiveQuestions,
  objectiveSubmissions,
  selectedObjectiveIndex,
  onSelectObjective,
}: AssignmentProblemProgressListProps) {
  const railProblems: ProblemLetterRailItem[] = problems.map((problem, index) => {
    const best = getBestSubmission(problem.id, submissions)
    return {
      id: problem.id,
      label: LETTERS[index] ?? String(index + 1),
      title: problem.title,
      status: toRailStatus(best),
      subtitle: best ? `${best.score ?? 0}分` : '—',
    }
  })

  const rail = (
    <ProblemLetterRail
      ariaLabel="作业题目列表"
      problems={railProblems}
      selectedIndex={selectedIndex}
      onSelect={onSelect}
      renderItemExtra={(problem, _index, isSelected) => {
        const best = getBestSubmission(problem.id, submissions)
        return (
          <ProblemTimer
            key={`${assignmentId}-${problem.id}`}
            classId={classId}
            assignmentId={assignmentId}
            problemId={problem.id}
            acHint={best?.status === 'AC'}
            assignmentEndTime={assignmentEndTime}
            active={isSelected}
            compact
            className="!px-1 !py-0 !text-[9px] !gap-0.5 max-w-full justify-center"
          />
        )
      }}
    />
  )

  const objectiveList = objectiveQuestions ?? []
  if (objectiveList.length === 0) return rail

  const objectiveSubs = objectiveSubmissions ?? []

  // 编程题与客观题共用一个滚动容器：去掉题号轨自身的 max-height，
  // 由外层统一限高滚动，避免客观题分组被 sticky 卡片底部裁切
  return (
    <div className="lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:[&>div]:max-h-none">
      {rail}
      <div>
        <div className="flex items-center justify-between px-2 pt-2 pb-1 mt-1 border-t border-border/60">
          <span className="text-xs font-medium text-muted-foreground">客观题</span>
          <span className="text-xs text-muted-foreground/70 tabular-nums">
            {objectiveList.length}
          </span>
        </div>
        <div
          className="flex lg:flex-col gap-1.5 p-2 overflow-x-auto lg:overflow-x-visible"
          role="listbox"
          aria-label="作业客观题列表"
        >
          {objectiveList.map((question, index) => {
            const isSelected = index === selectedObjectiveIndex
            const sub = objectiveSubs.find((s) => s.questionId === question.id)
            const typeLabel =
              OBJECTIVE_QUESTION_TYPE_LABELS[question.type as ObjectiveQuestionType] ??
              question.type
            return (
              <button
                key={question.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                title={
                  question.questionNumber
                    ? `${question.questionNumber} · ${typeLabel}`
                    : `客观题 ${index + 1} · ${typeLabel}`
                }
                onClick={() => onSelectObjective?.(index)}
                className={`flex flex-col items-center gap-1 shrink-0 w-[3.5rem] lg:w-full px-1 py-2 rounded-lg transition-colors ${
                  isSelected ? 'bg-primary/10 ring-1 ring-primary/25' : 'hover:bg-muted/60'
                }`}
              >
                <span
                  className={`relative w-8 h-8 rounded-md font-mono font-bold text-sm flex items-center justify-center border transition-colors ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : sub?.isCorrect
                        ? 'bg-secondary/10 text-secondary border-secondary/30'
                        : sub
                          ? 'bg-error/10 text-error border-error/30'
                          : 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  {index + 1}
                  {sub?.isCorrect && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-secondary text-white flex items-center justify-center shrink-0 border border-white dark:border-card">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                  {sub && !sub.isCorrect && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-error text-white flex items-center justify-center shrink-0 border border-white dark:border-card">
                      <X className="w-2.5 h-2.5" />
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
