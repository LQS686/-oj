'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Send,
  AlertCircle,
  CheckCircle2,
  Code as CodeIcon,
} from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { useContestProblemWorkspace } from '@/contexts/ContestProblemWorkspaceContext'
import { formatProblemDocumentTitle } from '@/lib/document-title'
import ContestCountdownPanel from '@/components/contest/ContestCountdownPanel'
import JudgeStatus from '@/components/submission/JudgeStatus'
import CodeEditor, { CodeLanguage } from '@/components/code-editor/CodeEditor'

const languageOptions = [
  { value: 'cpp', label: 'C++', version: 'C++17' },
  { value: 'c', label: 'C', version: 'C11' },
  { value: 'python', label: 'Python', version: 'Python 3.10' },
]

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function ContestProblemSidebar() {
  const params = useParams()
  const problemId = params.problemId as string
  const contestId = params.id as string
  const { user } = useUser()
  const ws = useContestProblemWorkspace()

  const {
    contest,
    contestProblems,
    contestTitle,
    code,
    setCode,
    language,
    setLanguage,
    submitting,
    submitResult,
    showJudgeStatus,
    judgeStatus,
    setShowJudgeStatus,
    submitCode,
  } = ws

  return (
    <div className="lg:sticky lg:top-4 space-y-3">
      {contestProblems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {contestProblems.map((cp, index) => {
            const letter = cp.label || LETTERS[index] || String(index + 1)
            const isActive = cp.id === problemId
            const isAccepted = cp.status === 'Accepted'
            const isAttempted = cp.status === 'Attempted'
            return (
              <Link
                key={cp.id}
                href={`/contests/${contestId}/problems/${cp.id}`}
                scroll={false}
                title={formatProblemDocumentTitle(cp.title, {
                  kind: 'contest',
                  label: letter,
                  contestTitle: contestTitle || undefined,
                })}
                className={`relative w-10 h-10 rounded-lg font-mono font-bold text-sm transition-all duration-200 border flex items-center justify-center ${
                  isActive
                    ? 'bg-primary text-white border-primary shadow-md scale-105'
                    : isAccepted
                      ? 'bg-secondary/10 text-secondary border-secondary/30 hover:border-secondary/50'
                      : isAttempted
                        ? 'bg-warning/10 text-warning border-warning/30 hover:border-warning/50'
                        : 'bg-muted text-muted-foreground border-border hover:border-primary/30 hover:text-foreground'
                }`}
              >
                {letter}
                {isAccepted && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-secondary rounded-full border-[1.5px] border-white dark:border-card" />
                )}
              </Link>
            )
          })}
        </div>
      )}

      <ContestCountdownPanel startTime={contest.startTime} endTime={contest.endTime} />

      <div className="card-static rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted">
          <CodeIcon className="w-4 h-4 text-primary-light" />
          <h3 className="font-medium text-foreground">提交代码</h3>
        </div>

        {showJudgeStatus && judgeStatus && (
          <div className="px-4 pt-4">
            <JudgeStatus
              submissionId={judgeStatus.submissionId}
              status={judgeStatus.status}
              passedTests={judgeStatus.passedTests}
              totalTests={judgeStatus.totalTests}
              testResults={judgeStatus.testResults}
              onClose={() => setShowJudgeStatus(false)}
            />
          </div>
        )}

        {submitResult && (
          <div
            className={`mx-4 mt-4 p-3 rounded-xl flex items-center gap-2 text-sm ${
              submitResult.type === 'success'
                ? 'bg-secondary/10 text-secondary-light border border-secondary/20'
                : 'bg-error/10 text-error border border-error/20'
            }`}
          >
            {submitResult.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{submitResult.text}</span>
          </div>
        )}

        <div className="p-4 space-y-3">
          {!user && (
            <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-accent-light text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>请先登录后再提交代码</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium text-foreground">语言</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="input w-auto min-w-[140px] py-1.5 text-sm"
            >
              {languageOptions.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label} ({lang.version})
                </option>
              ))}
            </select>
          </div>

          <CodeEditor
            value={code}
            onChange={setCode}
            language={language as CodeLanguage}
            placeholder="在此粘贴或输入代码... (Ctrl+Enter 提交)"
            height="360px"
            onSubmit={submitCode}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={submitCode}
              disabled={submitting || !user}
              className="btn-primary btn flex-1"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  评测中...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  提交
                </>
              )}
            </button>
            <button type="button" onClick={() => setCode('')} className="btn-ghost btn">
              清空
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}