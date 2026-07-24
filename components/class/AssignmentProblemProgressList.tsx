'use client'

import ProblemTimer from '@/components/class/ProblemTimer'

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
  problemId: string
  status: string
  score: number
  submittedAt: string
  timeElapsedMs?: number
}

export interface AssignmentProblemProgressListProps {
  problems: Problem[]
  submissions: Submission[]
  selectedIndex: number
  onSelect: (index: number) => void
  classId: string
  assignmentId: string
  assignmentEndTime?: string
}

function getProblemStatus(
  problemId: string,
  submissions: Submission[]
): Submission | null {
  const subs = submissions.filter((s) => s.problemId === problemId)
  if (subs.length === 0) return null
  return subs.reduce((best, current) =>
    (current.score || 0) > (best.score || 0) ? current : best
  )
}

/**
 * 作业题号轨：桌面竖排窄栏，移动端横滑，把宽度留给题面与编辑器。
 */
export default function AssignmentProblemProgressList({
  problems,
  submissions,
  selectedIndex,
  onSelect,
  classId,
  assignmentId,
  assignmentEndTime,
}: AssignmentProblemProgressListProps) {
  if (problems.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-muted-foreground">
        暂无题目
      </div>
    )
  }

  return (
    <div
      className="flex lg:flex-col gap-1.5 p-2 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:max-h-[calc(100vh-11rem)]"
      role="listbox"
      aria-label="作业题目列表"
    >
      {problems.map((problem, index) => {
        const isSelected = index === selectedIndex
        const status = getProblemStatus(problem.id, submissions)
        const letter = LETTERS[index] ?? String(index + 1)

        return (
          <button
            key={problem.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            title={problem.title}
            onClick={() => onSelect(index)}
            className={`flex flex-col items-center gap-1 shrink-0 w-[3.5rem] lg:w-full px-1 py-2 rounded-lg transition-colors ${
              isSelected ? 'bg-primary/10 ring-1 ring-primary/25' : 'hover:bg-muted/60'
            }`}
          >
            <span
              className={`relative w-8 h-8 rounded-md font-mono font-bold text-sm flex items-center justify-center border transition-colors ${
                isSelected
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : status?.status === 'AC'
                    ? 'bg-secondary/10 text-secondary border-secondary/30'
                    : status
                      ? 'bg-warning/10 text-warning border-warning/30'
                      : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {letter}
              {status?.status === 'AC' && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-secondary rounded-full border border-white dark:border-card" />
              )}
            </span>

            <span
              className={`text-[10px] font-semibold tabular-nums leading-none ${
                status?.status === 'AC'
                  ? 'text-secondary'
                  : status && status.score > 0
                    ? 'text-accent'
                    : 'text-muted-foreground/70'
              }`}
            >
              {status ? `${status.score}分` : '—'}
            </span>

            <ProblemTimer
              key={`${assignmentId}-${problem.id}`}
              classId={classId}
              assignmentId={assignmentId}
              problemId={problem.id}
              acHint={status?.status === 'AC'}
              assignmentEndTime={assignmentEndTime}
              active={isSelected}
              compact
              className="!px-1 !py-0 !text-[9px] !gap-0.5 max-w-full justify-center"
            />
          </button>
        )
      })}
    </div>
  )
}
