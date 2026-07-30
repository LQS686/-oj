'use client'

import { useEffect, useState, useRef } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { createPortal } from 'react-dom'
import {
  Clock,
  MemoryStick,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Timer,
  AlertTriangle,
  Loader2,
  LogIn,
  ChevronDown,
  Code2,
  Copy,
  Check,
  Download,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getStatusConfig, getStatusText } from '@/lib/status'
import {
  SubmissionStatus,
  isAcceptedStatus,
  isCompileErrorStatus,
  isNonFinalSubmissionStatus,
} from '@/lib/constants/submission-status'
import { formatDateTime, formatTime, formatMemory } from '@/lib/utils'
import { fetchWithCookie } from '@/lib/api/base'
import type { UserData } from '@/lib/api/auth'
import { loginPath } from '@/lib/navigation'
import CodeEditor, { type CodeLanguage } from '@/components/code-editor/CodeEditor'
import type { SubmissionListRow } from '@/hooks/useSubmissionResultFlow'
import { downloadFirstWaTestCase, findFirstWaIndex } from '@/lib/submission/wa-download'

export type SubmissionListItem = SubmissionListRow

interface SubmissionListProps {
  submissions: SubmissionListItem[]
  loading: boolean
  error: string | null
  user: UserData | null
  /** 当前展开的提交 ID；受控 */
  expandedId?: string | null
  onExpandedChange?: (id: string | null) => void
}

function toCodeLanguage(lang?: string): CodeLanguage {
  if (lang === 'c' || lang === 'python') return lang
  return 'cpp'
}

function StatusIcon({ name, className }: { name: string; className?: string }) {
  const cls = className || 'w-3.5 h-3.5'
  switch (name) {
    case 'check-circle-2':
      return <CheckCircle2 className={cls} />
    case 'x-circle':
      return <XCircle className={cls} />
    case 'timer':
      return <Timer className={cls} />
    case 'alert-triangle':
      return <AlertTriangle className={cls} />
    case 'loader-2':
      return <Loader2 className={`${cls} animate-spin`} />
    case 'alert-circle':
    default:
      return <AlertCircle className={cls} />
  }
}

function shortStatus(status: string): string {
  switch (status) {
    case SubmissionStatus.ACCEPTED:
      return 'AC'
    case SubmissionStatus.WRONG_ANSWER:
      return 'WA'
    case SubmissionStatus.TIME_LIMIT_EXCEEDED:
      return 'TLE'
    case SubmissionStatus.MEMORY_LIMIT_EXCEEDED:
      return 'MLE'
    case SubmissionStatus.RUNTIME_ERROR:
      return 'RE'
    case SubmissionStatus.COMPILE_ERROR:
      return 'CE'
    case SubmissionStatus.SYSTEM_ERROR:
      return 'SE'
    case SubmissionStatus.PRESENTATION_ERROR:
      return 'PE'
    case SubmissionStatus.OUTPUT_LIMIT_EXCEEDED:
      return 'OLE'
    case SubmissionStatus.PARTLY_CORRECT:
      return 'PC'
    case SubmissionStatus.PENDING:
    case SubmissionStatus.JUDGING:
    case SubmissionStatus.RUNNING:
      return '...'
    default:
      return status.length > 4 ? status.slice(0, 4) : status
  }
}

/** 洛谷风格测试点色块背景 */
function testPointBlockClass(status: string): string {
  switch (status) {
    case SubmissionStatus.ACCEPTED:
      return 'bg-[var(--difficulty-easy)]'
    case SubmissionStatus.WRONG_ANSWER:
      return 'bg-[var(--difficulty-hard)]'
    case SubmissionStatus.TIME_LIMIT_EXCEEDED:
      return 'bg-[var(--difficulty-medium)]'
    case SubmissionStatus.MEMORY_LIMIT_EXCEEDED:
      return 'bg-[var(--info)]'
    case SubmissionStatus.RUNTIME_ERROR:
      return 'bg-[var(--difficulty-expert)]'
    case SubmissionStatus.COMPILE_ERROR:
      return 'bg-muted-foreground'
    case SubmissionStatus.PRESENTATION_ERROR:
    case SubmissionStatus.OUTPUT_LIMIT_EXCEEDED:
    case SubmissionStatus.PARTLY_CORRECT:
      return 'bg-[var(--accent)]'
    case SubmissionStatus.PENDING:
    case SubmissionStatus.JUDGING:
    case SubmissionStatus.RUNNING:
      return 'bg-primary/70'
    default:
      return 'bg-muted-foreground'
  }
}

function formatBlockUsage(time?: number, memory?: number): string {
  const t = formatTime(time ?? 0)
  const m = formatMemory(memory ?? 0)
  return `${t}/${m}`
}

function testPointTooltipText(
  result: NonNullable<SubmissionListItem['testResults']>[number],
  index: number
): string {
  const statusText = getStatusText(result.status)
  const lines: string[] = [`#${index + 1} ${statusText}`]
  lines.push(formatBlockUsage(result.time, result.memory))
  if (result.message && result.message.trim()) {
    lines.push(result.message.trim())
  }
  return lines.join('\n')
}

function TestPointBlock({
  result,
  index,
}: {
  result: NonNullable<SubmissionListItem['testResults']>[number]
  index: number
}) {
  const label = shortStatus(result.status)
  const tip = testPointTooltipText(result, index)
  const blockRef = useRef<HTMLDivElement>(null)
  const [tipPos, setTipPos] = useState<{ left: number; top: number; place: 'above' | 'below' } | null>(
    null
  )

  const showTip = () => {
    const el = blockRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const placeAbove = rect.top > 120
    setTipPos({
      left: rect.left + rect.width / 2,
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      place: placeAbove ? 'above' : 'below',
    })
  }

  const hideTip = () => setTipPos(null)

  useEffect(() => {
    if (!tipPos) return
    const update = () => showTip()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipPos != null])

  return (
    <div
      ref={blockRef}
      className="w-full min-w-0"
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
      onFocus={showTip}
      onBlur={hideTip}
    >
      <div
        tabIndex={0}
        className={`w-full aspect-square rounded p-1 flex flex-col text-white shadow-sm cursor-default outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${testPointBlockClass(result.status)}`}
        aria-label={tip}
      >
        <span className="text-[9px] font-medium opacity-90 leading-none">#{index + 1}</span>
        <span className="flex-1 flex items-center justify-center text-sm font-bold tracking-wide">
          {label}
        </span>
        <span className="text-[8px] opacity-90 tabular-nums leading-tight text-center truncate w-full px-0.5">
          {formatBlockUsage(result.time, result.memory)}
        </span>
      </div>
      {tipPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[200] w-max max-w-[min(18rem,80vw)] rounded px-2.5 py-1.5 text-left text-[11px] leading-snug text-white whitespace-pre-wrap break-words shadow-lg bg-[#333]/95 dark:bg-[#1a1a1a]/95"
            style={{
              left: tipPos.left,
              top: tipPos.top,
              transform:
                tipPos.place === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            }}
          >
            {tip}
          </div>,
          document.body
        )}
    </div>
  )
}

function ExpandedDetail({
  submission,
  detail,
  detailLoading,
}: {
  submission: SubmissionListItem
  detail: SubmissionListItem | null
  detailLoading: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [waDownloading, setWaDownloading] = useState(false)
  const [waDownloadError, setWaDownloadError] = useState('')
  const data = detail || submission
  const judging = isNonFinalSubmissionStatus(data.status)
  const isAc = isAcceptedStatus(data.status)
  const isCe = isCompileErrorStatus(data.status)
  const testResults = data.testResults || []
  const showTests = judging || testResults.length > 0
  const firstWaIndex = findFirstWaIndex(testResults)
  const codeLines = data.code ? data.code.split('\n').length : 0
  // 短代码完整展开；超过约 16 行后限制高度并滚动，避免撑满整页
  const codeHeightPx = Math.min(Math.max(codeLines, 4) * 20 + 24, 320)
  const codeHeight = `${codeHeightPx}px`

  const handleCopy = async () => {
    if (!data.code) return
    try {
      await navigator.clipboard.writeText(data.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  const handleDownloadWa = async () => {
    if (waDownloading || !data.id) return
    setWaDownloadError('')
    setWaDownloading(true)
    try {
      await downloadFirstWaTestCase(data.id)
    } catch (err) {
      setWaDownloadError(err instanceof Error ? err.message : '下载失败')
    } finally {
      setWaDownloading(false)
    }
  }

  if (detailLoading && !detail) {
    return (
      <div className="border-t border-border bg-muted/20 px-4 py-8 flex justify-center">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          加载详情…
        </span>
      </div>
    )
  }

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
      {(data.message || isCe) && (
        <div
          className={`rounded-lg border p-3 flex gap-2.5 ${
            isCe || !isAc
              ? 'bg-error/5 border-error/25'
              : 'bg-accent/10 border-accent/25'
          }`}
        >
          <AlertTriangle
            className={`w-4 h-4 shrink-0 mt-0.5 ${isCe || !isAc ? 'text-error' : 'text-accent'}`}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground mb-1">
              {isCe ? '编译信息' : '评测信息'}
            </div>
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
              {data.message || '（无详细信息）'}
            </pre>
          </div>
        </div>
      )}

      {showTests && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-medium text-foreground">测试点信息</div>
            {firstWaIndex >= 0 && (
              <button
                type="button"
                onClick={() => void handleDownloadWa()}
                disabled={waDownloading}
                className="btn btn-outline text-xs py-1 px-2.5 gap-1"
                title="仅可下载第一个 WA 测试点"
              >
                {waDownloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                下载 WA#{firstWaIndex + 1}
              </button>
            )}
          </div>
          {waDownloadError && (
            <p className="mb-2 text-xs text-error">{waDownloadError}</p>
          )}
          {testResults.length > 0 ? (
            <div className="grid gap-1.5 grid-cols-4 sm:grid-cols-6 md:grid-cols-8">
              {testResults.map((r, i) => (
                <TestPointBlock key={r.testId || `t-${i}`} result={r} index={i} />
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground rounded-lg border border-dashed border-border">
              <Loader2 className="w-4 h-4 animate-spin inline-block mr-1.5" />
              评测进行中…
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm font-medium text-foreground inline-flex items-center gap-1.5">
            <Code2 className="w-4 h-4 text-primary" />
            源代码
            <span className="text-xs font-normal text-muted-foreground">
              {data.language || '—'}
              {data.code ? ` · ${codeLines} 行` : ''}
            </span>
          </div>
          {data.code && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void handleCopy()
              }}
              className="btn btn-outline text-xs py-1 px-2.5 gap-1"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  复制
                </>
              )}
            </button>
          )}
        </div>
        {data.code ? (
          <CodeEditor
            value={data.code}
            onChange={() => {}}
            language={toCodeLanguage(data.language)}
            readOnly
            height={codeHeight}
            className="hover:border-border focus-within:border-border focus-within:ring-0"
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            {detailLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                加载代码…
              </span>
            ) : (
              '无代码内容（可能无权查看或已脱敏）'
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SubmissionList({
  submissions,
  loading,
  error,
  user,
  expandedId = null,
  onExpandedChange,
}: SubmissionListProps) {
  const pathname = usePathname()
  const [detailCache, setDetailCache] = useState<Record<string, SubmissionListItem>>({})
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)
  const expandedStatus = submissions.find((s) => s.id === expandedId)?.status

  useDeferredEffect(() => {
    if (!expandedId) return

    let cancelled = false
    setDetailLoadingId(expandedId)
    void (async () => {
      try {
        const res = await fetchWithCookie(`/api/submissions/${expandedId}`)
        const data = await res.json()
        if (cancelled || !data.success) return
        const listItem = submissions.find((s) => s.id === expandedId)
        setDetailCache((prev) => ({
          ...prev,
          [expandedId]: {
            ...listItem,
            ...data.data,
            id: expandedId,
            status: listItem?.status || data.data.status,
            score: listItem?.score ?? data.data.score,
            time: listItem?.time ?? data.data.time,
            memory: listItem?.memory ?? data.data.memory,
            passedTests: listItem?.passedTests ?? data.data.passedTests,
            totalTests: listItem?.totalTests ?? data.data.totalTests,
            message: listItem?.message ?? data.data.message,
            testResults:
              listItem?.testResults && listItem.testResults.length > 0
                ? listItem.testResults
                : data.data.testResults,
            code: data.data.code || listItem?.code,
          },
        }))
      } catch {
        // 忽略：展开区仍展示列表摘要
      } finally {
        if (!cancelled) setDetailLoadingId((id) => (id === expandedId ? null : id))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [expandedId, expandedStatus])

  useDeferredEffect(() => {
    if (!expandedId) return
    const listItem = submissions.find((s) => s.id === expandedId)
    if (!listItem) return
    setDetailCache((prev) => {
      const cur = prev[expandedId]
      if (!cur) {
        return { ...prev, [expandedId]: { ...listItem } }
      }
      return {
        ...prev,
        [expandedId]: {
          ...cur,
          status: listItem.status,
          score: listItem.score ?? cur.score,
          time: listItem.time ?? cur.time,
          memory: listItem.memory ?? cur.memory,
          passedTests: listItem.passedTests ?? cur.passedTests,
          totalTests: listItem.totalTests ?? cur.totalTests,
          message: listItem.message ?? cur.message,
          language: listItem.language ?? cur.language,
          code: cur.code || listItem.code,
          testResults:
            listItem.testResults && listItem.testResults.length > 0
              ? listItem.testResults
              : cur.testResults,
        },
      }
    })
  }, [submissions, expandedId])

  const toggle = (id: string) => {
    onExpandedChange?.(expandedId === id ? null : id)
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="relative w-12 h-12 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6 text-error" />
        </div>
        <p className="text-error">{error}</p>
      </div>
    )
  }

  if (submissions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Clock className="w-6 h-6 text-muted-foreground" />
        </div>
        {user ? (
          <p className="text-muted-foreground">你还没有提交过这道题目</p>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground">请登录后查看提交记录</p>
            <Link
              href={loginPath(pathname)}
              className="btn btn-primary btn-sm inline-flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              登录
            </Link>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card-static rounded-lg divide-y divide-border">
      {submissions.map((sub) => {
        const statusConfig = getStatusConfig(sub.status)
        const passed = sub.passedTests ?? 0
        const total = sub.totalTests ?? 0
        const expanded = expandedId === sub.id

        return (
          <div key={sub.id} className={expanded ? 'bg-primary/5' : ''}>
            <button
              type="button"
              className="w-full grid grid-cols-12 gap-3 px-4 py-3 text-left hover:bg-primary/5 transition-colors"
              onClick={() => toggle(sub.id)}
              aria-expanded={expanded}
            >
              <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                <ChevronDown
                  className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${
                    expanded ? 'rotate-0' : '-rotate-90'
                  }`}
                />
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold border truncate ${statusConfig.className}`}
                >
                  <span className={`${statusConfig.iconBg} p-0.5 rounded shrink-0`}>
                    <StatusIcon name={statusConfig.icon} />
                  </span>
                  {sub.status}
                </span>
              </div>

              <div className="col-span-5 flex items-center gap-3 text-sm text-muted-foreground min-w-0">
                <span className="font-mono shrink-0">{sub.language || '—'}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="font-semibold text-foreground">{sub.score ?? 0}</span>
                  <span>分</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="tabular-nums">
                    {passed}/{total}
                  </span>
                </div>
              </div>

              <div className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="w-3.5 h-3.5" />
                  {formatTime(sub.time ?? 0)}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <MemoryStick className="w-3.5 h-3.5" />
                  {formatMemory(sub.memory ?? 0)}
                </span>
              </div>

              <div className="col-span-3 flex items-center justify-end text-sm text-muted-foreground">
                {formatDateTime(sub.submittedAt)}
              </div>
            </button>

            {expanded && (
              <ExpandedDetail
                submission={sub}
                detail={detailCache[sub.id] || null}
                detailLoading={detailLoadingId === sub.id}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
