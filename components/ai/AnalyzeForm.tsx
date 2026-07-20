'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Loader2, AlertCircle, FileSearch, CheckCircle,
  Plus, X, RefreshCw, Save,
} from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { ProblemNumberSearch, type ProblemFullInfo } from './ProblemNumberSearch'
import { ProblemDetailCard } from './ProblemDetailCard'
import { DIFFICULTIES } from '@/lib/constants'
import type { AiTaskStatus } from '@/types/ai'

/**
 * 题目智能分析表单（含一键入库）
 *
 * 流程：
 * 1. 题号搜索选题 → 展示题目信息确认
 * 2. 点击"开始分析" → POST /api/admin/ai/analyze → 返回 { logId }
 * 3. 轮询 GET /api/admin/ai/generate?logId=xxx 获取分析结果
 * 4. 结果返回后展示 5 维度分析 + 可编辑的建议元数据（tags/difficulty/hints）
 * 5. 点击"一键入库" → PATCH /api/admin/problems/[id] 用 AI 建议更新这道题
 */

/** 题目分析结果（5 维度，与 AnalysisResult 对齐） */
interface AnalysisResult {
  suggestedTags: string[]
  suggestedDifficulty: string
  qualityIssues: string[]
  suggestedHints: string[]
  testCaseGaps: string[]
}

const TERMINAL_STATUS: AiTaskStatus[] = ['COMPLETED', 'FAILED', 'DISCARDED']

interface AnalyzeFormProps {
  defaultProblemId?: string
  className?: string
}

export function AnalyzeForm({
  defaultProblemId,
  className = '',
}: AnalyzeFormProps) {
  const [problem, setProblem] = useState<ProblemFullInfo | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  /* ---------- 轮询状态 ---------- */
  const [logId, setLogId] = useState<string | null>(null)
  const [taskStatus, setTaskStatus] = useState<AiTaskStatus | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ---------- 分析结果（可编辑） ---------- */
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [tagInput, setTagInput] = useState('')

  /* ---------- 入库状态 ---------- */
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState('')
  const [committed, setCommitted] = useState(false)

  const isTerminal = useCallback((s: AiTaskStatus | null) => !!s && TERMINAL_STATUS.includes(s), [])

  /* ---------- 轮询获取任务结果 ---------- */
  const fetchTask = useCallback(async () => {
    if (!logId) return
    try {
      const res = await fetchWithCookie(`/api/admin/ai/generate?logId=${logId}`)
      const data = await res.json()
      if (data.success && data.data) {
        const log = data.data
        setTaskStatus(log.status as AiTaskStatus)
        setTaskError(log.error || null)
        if (log.status === 'COMPLETED' && log.result?.analysis) {
          const a = log.result.analysis
          setAnalysis({
            suggestedTags: Array.isArray(a.suggestedTags) ? a.suggestedTags : [],
            suggestedDifficulty: typeof a.suggestedDifficulty === 'string' ? a.suggestedDifficulty : (problem?.difficulty || '普及'),
            qualityIssues: Array.isArray(a.qualityIssues) ? a.qualityIssues : [],
            suggestedHints: Array.isArray(a.suggestedHints) ? a.suggestedHints : [],
            testCaseGaps: Array.isArray(a.testCaseGaps) ? a.testCaseGaps : [],
          })
        }
      } else {
        setTaskError(data.error || '获取任务状态失败')
      }
    } catch (err) {
      logger.error('轮询 AI 任务结果失败', err)
      setTaskError('网络错误，无法获取任务状态')
    }
  }, [logId, problem?.difficulty])

  useEffect(() => {
    setTaskStatus(null)
    setTaskError(null)
    setAnalysis(null)
    setCommitted(false)
    if (!logId) return
    fetchTask()
  }, [logId, fetchTask])

  useEffect(() => {
    const stop = () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    }
    const start = () => {
      if (pollingRef.current) return
      pollingRef.current = setInterval(() => {
        if (document.visibilityState === 'visible' && !isTerminal(taskStatus)) fetchTask()
      }, 5000)
    }
    if (logId && !isTerminal(taskStatus)) {
      if (document.visibilityState === 'visible') start()
    } else { stop() }
    const onVis = () => {
      if (document.visibilityState === 'visible' && !isTerminal(taskStatus)) { fetchTask(); start() }
      else { stop() }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [logId, taskStatus, isTerminal, fetchTask])

  /* ---------- 提交分析 ---------- */
  const handleSubmit = async () => {
    setError('')
    if (!problem?.id) {
      setError('请先选择题目')
      return
    }
    setSubmitting(true)
    setAnalysis(null)
    setCommitted(false)
    setTaskError(null)
    try {
      const res = await fetchWithCookie('/api/admin/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId: problem.id }),
      })
      const data = await res.json()
      if (data.success) {
        const id = data.data?.logId || data.data?.id
        if (id) {
          setLogId(id)
        }
      } else {
        setError(data.error || '入队失败')
      }
    } catch (err) {
      logger.error('题目分析入队失败', err)
      setError('网络错误，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  /* ---------- 标签操作 ---------- */
  const addTag = () => {
    const t = tagInput.trim()
    if (!t) return
    setAnalysis(prev => prev && !prev.suggestedTags.includes(t)
      ? { ...prev, suggestedTags: [...prev.suggestedTags, t] }
      : prev)
    setTagInput('')
  }
  const removeTag = (t: string) => {
    setAnalysis(prev => prev ? { ...prev, suggestedTags: prev.suggestedTags.filter(x => x !== t) } : prev)
  }

  /* ---------- 一键入库：用 AI 建议更新题目 ---------- */
  const handleCommit = async () => {
    if (!problem?.id || !analysis) return
    setCommitError('')
    setCommitting(true)
    try {
      const res = await fetchWithCookie(`/api/admin/problems/${problem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: analysis.suggestedTags,
          difficulty: analysis.suggestedDifficulty,
          hint: analysis.suggestedHints.join('\n') || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setCommitted(true)
      } else {
        setCommitError(data.error || '入库失败')
      }
    } catch (err) {
      logger.error('题目更新失败', err)
      setCommitError('网络错误，请稍后重试')
    } finally {
      setCommitting(false)
    }
  }

  const isPolling = !!logId && !isTerminal(taskStatus)
  const showAnalysis = !!analysis && taskStatus === 'COMPLETED'

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-2">
        <FileSearch className="w-4 h-4 text-primary" />
        <h3 className="text-base font-bold text-foreground">题目智能分析</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        AI 从 5 个维度分析题目（标签 / 难度 / 质量 / 测试缺口 / 提示建议），可微调建议后一键入库更新题目元数据。
      </p>

      <ProblemNumberSearch
        defaultProblemId={defaultProblemId}
        onProblemSelected={setProblem}
        placeholder="输入题号（如 P1000）或标题关键字"
      />

      {/* 选中题目后：一个卡片显示完整题目信息（测试点默认折叠可展开） */}
      {problem && (
        <ProblemDetailCard problem={problem} showTestCases={false} />
      )}

      {/* 提交错误 */}
      {error && (
        <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* 分析按钮 */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !problem?.id || isPolling}
        className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
        {submitting ? '入队中...' : '开始分析'}
      </button>

      {/* 轮询进度 */}
      {isPolling && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span>AI 正在分析题目...</span>
          {logId && (
            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded ml-auto">
              log: {logId.slice(-8)}
            </code>
          )}
        </div>
      )}

      {/* 分析失败 */}
      {taskStatus === 'FAILED' && (
        <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">分析失败</p>
            {taskError && <p className="text-xs mt-1 break-words">{taskError}</p>}
          </div>
        </div>
      )}

      {/* 分析结果 + 可编辑建议 + 一键入库 */}
      {showAnalysis && analysis && (
        <>
          {/* 5 维度分析结果（扁平展示） */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-secondary">
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">分析结果</span>
            </div>

            {/* 质量问题 */}
            {analysis.qualityIssues.length > 0 && (
              <div>
                <p className="text-xs font-medium text-foreground mb-1">质量问题</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                  {analysis.qualityIssues.map((issue, i) => <li key={i}>{issue}</li>)}
                </ul>
              </div>
            )}

            {/* 测试维度缺口 */}
            {analysis.testCaseGaps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-foreground mb-1">测试维度缺口</p>
                <div className="flex flex-wrap gap-1">
                  {analysis.testCaseGaps.map((gap, i) => (
                    <span key={i} className="tag text-xs bg-warning/10 text-warning">{gap}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 可编辑的建议元数据 + 一键入库 */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4 text-primary" />
              <span className="font-medium text-foreground">建议元数据</span>
              <span className="text-xs text-muted-foreground">（可微调后一键入库更新题目）</span>
            </div>

            {/* 标签（可增删） */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">标签</label>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {analysis.suggestedTags.length === 0 && (
                  <span className="text-xs text-muted-foreground">暂无标签</span>
                )}
                {analysis.suggestedTags.map(t => (
                  <span key={t} className="tag text-xs flex items-center gap-1 bg-primary/10 text-primary">
                    {t}
                    <button type="button" onClick={() => removeTag(t)} className="hover:text-error" title="移除标签">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="输入标签后回车添加"
                  className="input flex-1 text-sm"
                />
                <button type="button" onClick={addTag} className="btn btn-secondary text-xs flex items-center gap-1">
                  <Plus className="w-3 h-3" /> 添加
                </button>
              </div>
            </div>

            {/* 难度 */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">难度</label>
              <select
                value={analysis.suggestedDifficulty}
                onChange={(e) => setAnalysis(prev => prev ? { ...prev, suggestedDifficulty: e.target.value } : prev)}
                className="input"
              >
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* 提示建议 */}
            {analysis.suggestedHints.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">提示建议（将合并写入题目 hint）</label>
                <textarea
                  value={analysis.suggestedHints.join('\n')}
                  onChange={(e) => setAnalysis(prev => prev ? { ...prev, suggestedHints: e.target.value.split('\n').filter(Boolean) } : prev)}
                  rows={3}
                  className="input text-sm"
                />
              </div>
            )}

            {/* 入库错误提示 */}
            {commitError && (
              <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">{commitError}</span>
              </div>
            )}

            {/* 入库成功提示 */}
            {committed && (
              <div className="bg-secondary/10 border border-green-500/30 text-secondary px-4 py-3 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm flex-1">题目元数据已更新！</span>
                {problem?.id && (
                  <Link href={`/admin/problems/${problem.id}`} className="text-xs underline hover:opacity-80 flex-shrink-0">
                    查看题目
                  </Link>
                )}
              </div>
            )}

            {/* 一键入库按钮 */}
            {!committed && (
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing}
                className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {committing ? '入库中...' : '一键入库'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default AnalyzeForm
