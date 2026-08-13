'use client'

import type { ReactNode } from 'react'
import { AlertCircle, Send } from 'lucide-react'
import CodeEditor, { type CodeLanguage } from '@/components/code-editor/CodeEditor'
import PretestPanel from '@/components/problem/PretestPanel'
import { WORKSPACE_LANGUAGE_OPTIONS } from './ProblemSubmitColumnMeta'

// 向后兼容：轻量导出从 meta 文件 re-export，避免其它页面同步引入时连带 CodeMirror
export { WORKSPACE_LANGUAGE_OPTIONS, ProblemSubmitColumnHeader } from './ProblemSubmitColumnMeta'

interface ProblemSubmitColumnProps {
  user: { id: string } | null | undefined
  code: string
  language: string
  onCodeChange: (code: string) => void
  onLanguageChange: (language: string) => void
  onSubmit: () => void
  submitting: boolean
  problemId?: string | null
  /** 编辑器高度，默认与竞赛/训练/作业 dense 一致 */
  editorHeight?: string
  /** 竞赛预测试透传 */
  contestId?: string
  /** 提交按钮上方的状态条（作业未开始/冷却等） */
  statusBanner?: ReactNode
  submitDisabled?: boolean
  submitDisabledTitle?: string
  submitLabel?: string
}

/**
 * 做题工作区右侧提交列：登录提示、语言、编辑器、提交/清空、样例自测。
 */
export default function ProblemSubmitColumn({
  user,
  code,
  language,
  onCodeChange,
  onLanguageChange,
  onSubmit,
  submitting,
  problemId,
  editorHeight = 'min(28rem, calc(100vh - 22rem))',
  contestId,
  statusBanner,
  submitDisabled = false,
  submitDisabledTitle,
  submitLabel,
}: ProblemSubmitColumnProps) {
  const disabled = submitting || !user || !code.trim() || submitDisabled
  const title =
    submitDisabledTitle ||
    (!user ? '请先登录' : submitting ? '正在评测中...' : '')

  return (
    <>
      {!user && (
        <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          请先登录后再提交代码
        </div>
      )}
      {statusBanner}
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-medium text-foreground whitespace-nowrap">语言</label>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="px-2.5 py-1 rounded-md border border-border bg-background text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
        >
          {WORKSPACE_LANGUAGE_OPTIONS.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label} ({lang.version})
            </option>
          ))}
        </select>
      </div>
      <CodeEditor
        value={code}
        onChange={onCodeChange}
        language={language as CodeLanguage}
        placeholder="在此粘贴或输入代码... (Ctrl+Enter 提交)"
        height={editorHeight}
        maxLength={65536}
        onSubmit={onSubmit}
      />
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          title={title}
          className="btn btn-primary flex-1 max-w-xs h-9 text-sm"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              评测中...
            </>
          ) : !user ? (
            <>
              <Send className="w-4 h-4" />
              请先登录
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              {submitLabel || '提交代码'}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => onCodeChange('')}
          className="btn btn-ghost cursor-pointer h-9 text-sm"
        >
          清空
        </button>
      </div>
      {problemId && (
        <PretestPanel
          problemId={problemId}
          code={code}
          language={language}
          disabled={!user || submitting}
          contestId={contestId}
        />
      )}
    </>
  )
}
