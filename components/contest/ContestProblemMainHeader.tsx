'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Timer, MemoryStick, CheckCircle2, FileCode } from 'lucide-react'
import { useContestProblemWorkspace } from '@/contexts/ContestProblemWorkspaceContext'
import type { Problem } from '@/types/models'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** 全宽题头：与右侧栏分离，使右侧 A/B/C 可与左侧「题目描述」卡片顶对齐 */
export default function ContestProblemMainHeader() {
  const params = useParams()
  const problemId = params.problemId as string
  const { contestProblems } = useContestProblemWorkspace()
  const [problem, setProblem] = useState<Problem | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/problems/${problemId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setProblem(d.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [problemId])

  if (!problem) {
    return (
      <div className="mb-4 h-16 rounded-lg bg-muted/40 animate-pulse" aria-hidden />
    )
  }

  const meta = contestProblems.find((p) => p.id === problemId)
  const label =
    meta?.label || LETTERS[contestProblems.findIndex((p) => p.id === problemId)] || ''

  const acceptRate =
    problem.totalSubmit > 0
      ? ((problem.totalAccepted / problem.totalSubmit) * 100).toFixed(1)
      : '0.0'

  const difficultyTagClass =
    problem.difficulty === '入门'
      ? 'tag-success'
      : problem.difficulty === '普及-' || problem.difficulty === '普及'
        ? 'tag-info'
        : problem.difficulty === '普及+' || problem.difficulty === '提高'
          ? 'tag-warning'
          : 'tag-error'

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {label ? (
          <span className="font-mono text-sm font-bold text-primary-light bg-primary/10 px-3 py-1 rounded-lg">
            {label}
          </span>
        ) : null}
        <h1 className="text-xl font-bold text-foreground md:text-2xl">{problem.title}</h1>
        <span className={`tag ${difficultyTagClass}`}>{problem.difficulty}</span>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Timer className="w-4 h-4" />
          <span>时间限制: {problem.timeLimit}ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MemoryStick className="w-4 h-4" />
          <span>内存限制: {problem.memoryLimit}MB</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span>通过率 {acceptRate}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <FileCode className="w-4 h-4" />
          <span>{problem.totalSubmit?.toLocaleString() || '0'} 提交</span>
        </div>

      </div>
    </div>
  )
}