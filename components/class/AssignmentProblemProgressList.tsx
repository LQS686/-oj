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

/**
 * 获取某题的最高分提交
 */
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
    <div className="flex flex-col gap-1 p-2 max-h-[calc(100vh-100px)] overflow-y-auto">
      {problems.map((problem, index) => {
        const isSelected = index === selectedIndex
        const status = getProblemStatus(problem.id, submissions)

        return (
          <button
            key={problem.id}
            onClick={() => onSelect(index)}
            className={`flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors w-full ${
              isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
            }`}
          >
            <span
              className={`relative w-9 h-9 rounded-lg font-mono font-bold text-sm flex items-center justify-center shrink-0 border ${
                isSelected
                  ? 'bg-primary text-white border-primary shadow-md'
                  : status?.status === 'AC'
                    ? 'bg-secondary/10 text-secondary border-secondary/30'
                    : status
                      ? 'bg-warning/10 text-warning border-warning/30'
                      : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {LETTERS[index]}
              {status?.status === 'AC' && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-secondary rounded-full border-[1.5px] border-white dark:border-card" />
              )}
            </span>

            <div className="flex flex-col items-start min-w-[3rem] shrink-0">
              {status ? (
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    status.status === 'AC'
                      ? 'text-secondary'
                      : status.score > 0
                        ? 'text-accent'
                        : 'text-muted-foreground'
                  }`}
                >
                  {status.score}分
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/60">—</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <ProblemTimer
                key={`${assignmentId}-${problem.id}`}
                classId={classId}
                assignmentId={assignmentId}
                problemId={problem.id}
                acHint={status?.status === 'AC'}
                assignmentEndTime={assignmentEndTime}
                active={isSelected}
                className="!px-1.5 !py-0.5 !text-[10px]"
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}
