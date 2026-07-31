'use client'

import ProblemTimer from '@/components/class/ProblemTimer'
import ProblemLetterRail, {
  type ProblemLetterRailItem,
  type ProblemLetterStatus,
} from '@/components/problem/ProblemLetterRail'

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

export interface AssignmentProblemProgressListProps {
  problems: Problem[]
  submissions: Submission[]
  selectedIndex: number
  onSelect: (index: number) => void
  classId: string
  assignmentId: string
  assignmentEndTime?: string
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

  return (
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
}
