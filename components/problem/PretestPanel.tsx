'use client'

/**
 * 在线测试面板（参考 HOJ ProblemSubmit.vue 的 sample 运行 + Hydro OJ pretest）
 *
 * 调用：POST /api/problems/[id]/pretest
 * 入参：{ code, language }
 * 返回：每个样例测试点的 { status, time, memory, userOutput, expectedOutput, message }
 *
 * 设计要点：
 *   - 不创建提交记录，不影响评测队列
 *   - 结果面板可折叠，默认折叠（避免占用页面空间）
 *   - 单点结果：状态徽章 + 耗时/内存 + 输入/期望输出/实际输出三栏对照
 *   - 加载态使用骨架屏，错误态显式提示
 *   - 复用 lib/status 的状态颜色配置，与项目色彩语义一致
 */
import { useState } from 'react'
import {
  Play,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Timer,
  MemoryStick,
  AlertCircle,
} from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { getStatusColor, getStatusText } from '@/lib/status'
import toast from 'react-hot-toast'

interface PretestCaseResult {
  testId: string
  status: string
  time: number
  memory: number
  userOutput: string
  expectedOutput: string
  message: string
}

interface PretestResult {
  status: string
  compileError?: string
  passedTests: number
  totalTests: number
  time: number
  memory: number
  results: PretestCaseResult[]
  judgedAt?: string
  message?: string
}

export interface PretestPanelProps {
  problemId: string
  code: string
  language: string
  /** 禁用运行按钮（如未登录、代码为空） */
  disabled?: boolean
}

export default function PretestPanel({ problemId, code, language, disabled }: PretestPanelProps) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PretestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  const handleRunPretest = async () => {
    if (running) return
    if (!code.trim() || code.trim().length < 10) {
      toast.error('代码不能为空或少于 10 个字符')
      return
    }

    setRunning(true)
    setError(null)
    setResult(null)
    setExpanded(true)

    try {
      const res = await fetchWithCookie(`/api/problems/${problemId}/pretest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || '运行测试失败')
        toast.error(data.error || '运行测试失败')
        return
      }
      setResult(data.data as PretestResult)
      if (data.data?.totalTests === 0) {
        toast('本题暂无样例测试点，建议直接提交', { icon: 'ℹ️' })
      } else if (data.data?.status === 'AC') {
        toast.success(`样例全部通过 (${data.data.passedTests}/${data.data.totalTests})`)
      } else {
        toast.error(`样例未全部通过 (${data.data.passedTests}/${data.data.totalTests})`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '网络错误'
      setError(msg)
      toast.error(msg)
    } finally {
      setRunning(false)
    }
  }

  const hasResult = !!result
  const allPassed = result && result.totalTests > 0 && result.passedTests === result.totalTests

  return (
    <div className="rounded-xl border border-border bg-card/30 overflow-hidden">
      {/* 顶部标题栏 + 运行按钮 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Play className="w-4 h-4 text-primary-light" />
          在线测试（样例）
        </button>
        <button
          type="button"
          onClick={handleRunPretest}
          disabled={running || disabled}
          className="btn-ghost btn-sm btn cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          title="使用题目样例测试点运行代码，不会创建提交记录"
        >
          {running ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              运行中...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              运行测试
            </>
          )}
        </button>
      </div>

      {/* 结果区域 */}
      {expanded && (running || hasResult || error) && (
        <div className="p-4 space-y-3">
          {/* 加载态 */}
          {running && !hasResult && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              正在编译并运行样例...
            </div>
          )}

          {/* 错误态 */}
          {error && !running && (
            <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium">运行失败</div>
                <div className="text-xs mt-0.5 opacity-90">{error}</div>
              </div>
            </div>
          )}

          {/* 结果展示 */}
          {hasResult && !running && (
            <>
              {/* 汇总信息 */}
              {result!.totalTests === 0 ? (
                <div className="p-3 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {result!.message || '本题暂无样例测试点'}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 flex-wrap text-sm">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium ${
                        allPassed
                          ? 'bg-secondary/10 text-secondary border border-secondary/20'
                          : 'bg-error/10 text-error border border-error/20'
                      }`}
                    >
                      {allPassed ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      {allPassed ? '全部通过' : '未通过'}
                    </span>
                    <span className="text-muted-foreground">
                      通过样例：
                      <span className="font-mono tabular-nums text-foreground">
                        {result!.passedTests}/{result!.totalTests}
                      </span>
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Timer className="w-3.5 h-3.5" />
                      最大耗时：
                      <span className="font-mono tabular-nums text-foreground">
                        {result!.time} ms
                      </span>
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <MemoryStick className="w-3.5 h-3.5" />
                      峰值内存：
                      <span className="font-mono tabular-nums text-foreground">
                        {formatMemory(result!.memory)}
                      </span>
                    </span>
                  </div>

                  {/* 编译错误：单独展示，不展开各点 */}
                  {result!.status === 'CE' && result!.compileError && (
                    <div className="rounded-lg border border-error/30 bg-error/5 overflow-hidden">
                      <div className="px-3 py-2 bg-error/10 text-error text-sm font-medium flex items-center gap-1.5 border-b border-error/20">
                        <AlertCircle className="w-4 h-4" />
                        编译错误
                      </div>
                      <pre className="p-3 text-xs text-foreground/80 overflow-x-auto whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                        {result!.compileError}
                      </pre>
                    </div>
                  )}

                  {/* 各样例点结果 */}
                  {result!.status !== 'CE' && result!.results.length > 0 && (
                    <div className="space-y-2">
                      {result!.results.map((r, idx) => (
                        <SampleResultCard key={r.testId || idx} index={idx + 1} result={r} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** 单个样例测试点结果卡片 */
function SampleResultCard({ index, result }: { index: number; result: PretestCaseResult }) {
  const [showDetail, setShowDetail] = useState(false)
  const statusColor = getStatusColor(result.status)
  const statusText = getStatusText(result.status)
  const passed = result.status === 'AC'

  return (
    <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
      {/* 卡片头部 */}
      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground font-mono tabular-nums">#{index}</span>
          <span className={`${statusColor} font-medium`}>{statusText}</span>
          {result.message && result.status !== 'AC' && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              · {result.message}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 font-mono tabular-nums">
            <Timer className="w-3 h-3" />
            {result.time} ms
          </span>
          <span className="flex items-center gap-1 font-mono tabular-nums">
            <MemoryStick className="w-3 h-3" />
            {formatMemory(result.memory)}
          </span>
          {showDetail ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* 详情：输入/期望输出/实际输出 三栏对照 */}
      {showDetail && (
        <div className="border-t border-border p-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <OutputBlock
            title="期望输出"
            content={result.expectedOutput || '(空)'}
            tone={passed ? 'neutral' : 'expected'}
          />
          <OutputBlock
            title="实际输出"
            content={result.userOutput || '(空)'}
            tone={passed ? 'success' : 'error'}
          />
          {result.message && result.status !== 'AC' && (
            <div className="md:col-span-3 p-2 rounded bg-error/5 border border-error/20 text-error">
              <span className="font-medium">详情：</span>
              <span className="opacity-90">{result.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 输出块组件 */
function OutputBlock({
  title,
  content,
  tone,
}: {
  title: string
  content: string
  tone: 'neutral' | 'success' | 'expected' | 'error'
}) {
  const toneClass =
    tone === 'success'
      ? 'border-secondary/30 bg-secondary/5'
      : tone === 'error'
      ? 'border-error/30 bg-error/5'
      : tone === 'expected'
      ? 'border-primary/30 bg-primary/5'
      : 'border-border bg-muted/30'
  const titleClass =
    tone === 'success'
      ? 'text-secondary'
      : tone === 'error'
      ? 'text-error'
      : tone === 'expected'
      ? 'text-primary'
      : 'text-muted-foreground'

  return (
    <div className={`rounded border ${toneClass} overflow-hidden`}>
      <div className={`px-2 py-1 ${titleClass} font-medium border-b ${toneClass}`}>{title}</div>
      <pre className="p-2 text-foreground/80 overflow-x-auto whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
        {content}
      </pre>
    </div>
  )
}

/** 内存格式化：KB → MB（保留 2 位小数） */
function formatMemory(kb: number): string {
  if (kb <= 0) return '0 KB'
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}
