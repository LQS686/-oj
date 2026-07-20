'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Loader2, Lightbulb, AlertCircle, Plus, X, CheckCircle,
} from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { DIFFICULTIES } from '@/lib/constants'
import type { AiTaskStatus } from '@/types/ai'

/**
 * 元数据建议表单（辅助出题 + 一键入库）
 *
 * 自管理完整流程：
 * 1. 用户输入题目题面（描述+输入格式+输出格式+样例）
 * 2. 点击"获取 AI 建议"→ POST /api/admin/ai/suggest-metadata → 返回 { logId }
 * 3. 轮询 GET /api/admin/ai/generate?logId=xxx 获取结果
 * 4. 结果返回后展示可编辑的 AI 建议区域（标题/标签/难度/提示/时间/内存）+ 原始题面只读
 * 5. 用户微调后点击"一键入库"→ POST /api/admin/problems 创建题目
 * 6. 入库成功后展示成功提示 + 跳转链接
 */
interface SuggestMetadataFormProps {
  /** 自定义 className */
  className?: string
}

interface SamplePair {
  input: string
  output: string
}

/** 元数据建议结果（从 AI 任务 result.metadata 读取） */
interface MetadataSuggestion {
  tags: string[]
  difficulty: string
  hint: string
  timeLimit: number
  memoryLimit: number
}

const TERMINAL_STATUS: AiTaskStatus[] = ['COMPLETED', 'FAILED', 'DISCARDED']

export function SuggestMetadataForm({
  className = '',
}: SuggestMetadataFormProps) {
  /* ---------- 题面输入 ---------- */
  const [description, setDescription] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [samples, setSamples] = useState<SamplePair[]>([])

  /* ---------- 提交 / 轮询状态 ---------- */
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [logId, setLogId] = useState<string | null>(null)
  const [taskStatus, setTaskStatus] = useState<AiTaskStatus | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ---------- AI 建议结果（可编辑） ---------- */
  const [suggestion, setSuggestion] = useState<MetadataSuggestion | null>(null)
  const [title, setTitle] = useState('')
  const [tagInput, setTagInput] = useState('')

  /* ---------- 入库状态 ---------- */
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState('')
  const [committedProblemId, setCommittedProblemId] = useState<string | null>(null)

  /* ---------- 样例操作 ---------- */
  const addSample = () => setSamples(prev => [...prev, { input: '', output: '' }])
  const removeSample = (idx: number) => setSamples(prev => prev.filter((_, i) => i !== idx))
  const updateSample = (idx: number, field: 'input' | 'output', val: string) => {
    setSamples(prev => prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s)))
  }

  /* ---------- 标签操作 ---------- */
  const addTag = () => {
    const t = tagInput.trim()
    if (!t) return
    setSuggestion(prev =>
      prev && !prev.tags.includes(t) ? { ...prev, tags: [...prev.tags, t] } : prev
    )
    setTagInput('')
  }
  const removeTag = (t: string) => {
    setSuggestion(prev => (prev ? { ...prev, tags: prev.tags.filter(x => x !== t) } : prev))
  }

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
        if (log.status === 'COMPLETED' && log.result?.metadata) {
          const m = log.result.metadata
          setSuggestion({
            tags: Array.isArray(m.tags) ? m.tags : [],
            difficulty: typeof m.difficulty === 'string' ? m.difficulty : '普及',
            hint: typeof m.hint === 'string' ? m.hint : '',
            timeLimit: typeof m.timeLimit === 'number' ? m.timeLimit : 1000,
            memoryLimit: typeof m.memoryLimit === 'number' ? m.memoryLimit : 128,
          })
          // 若用户尚未填标题，预填一个占位（来自描述前若干字）
          if (!title) {
            setTitle(description.slice(0, 30).trim() || '新题目')
          }
        }
      } else {
        setTaskError(data.error || '获取任务状态失败')
      }
    } catch (err) {
      logger.error('轮询 AI 任务结果失败', err)
      setTaskError('网络错误，无法获取任务状态')
    }
  }, [logId, title, description])

  // logId 变化时重置并立即拉取一次
  useEffect(() => {
    setTaskStatus(null)
    setTaskError(null)
    if (!logId) return
    fetchTask()
  }, [logId, fetchTask])

  // 轮询：未达终态时每 3s 拉取
  useEffect(() => {
    const stop = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
    const start = () => {
      if (pollingRef.current) return
      pollingRef.current = setInterval(() => {
        if (document.visibilityState === 'visible' && !isTerminal(taskStatus)) {
          fetchTask()
        }
      }, 5000)
    }

    if (logId && !isTerminal(taskStatus)) {
      if (document.visibilityState === 'visible') start()
    } else {
      stop()
    }

    const onVis = () => {
      if (document.visibilityState === 'visible' && !isTerminal(taskStatus)) {
        fetchTask()
        start()
      } else {
        stop()
      }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [logId, taskStatus, isTerminal, fetchTask])

  /* ---------- 提交：获取 AI 建议 ---------- */
  const handleSubmit = async () => {
    setError('')
    if (!description.trim()) {
      setError('请填写题目描述')
      return
    }
    setSubmitting(true)
    setSuggestion(null)
    setCommittedProblemId(null)
    setTaskError(null)
    try {
      const res = await fetchWithCookie('/api/admin/ai/suggest-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            description: description.trim(),
            input: input.trim() || undefined,
            output: output.trim() || undefined,
            samples: samples.filter(s => s.input.trim() || s.output.trim()).length > 0
              ? samples.filter(s => s.input.trim() || s.output.trim())
              : undefined,
          },
        }),
      })
      const data = await res.json()
      if (data.success) {
        const id = data.data?.logId || data.data?.id
        if (id) setLogId(id)
      } else {
        setError(data.error || '入队失败')
      }
    } catch (err) {
      logger.error('元数据建议入队失败', err)
      setError('网络错误，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  /* ---------- 提交：一键入库 ---------- */
  const handleCommit = async () => {
    setCommitError('')
    if (!title.trim()) {
      setCommitError('请填写题目标题')
      return
    }
    if (!description.trim()) {
      setCommitError('题目描述不能为空')
      return
    }
    if (!suggestion) {
      setCommitError('AI 建议结果缺失')
      return
    }
    setCommitting(true)
    try {
      const res = await fetchWithCookie('/api/admin/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          input: input.trim() || undefined,
          output: output.trim() || undefined,
          samples: samples.filter(s => s.input.trim() || s.output.trim()),
          hint: suggestion.hint || undefined,
          tags: suggestion.tags,
          difficulty: suggestion.difficulty,
          timeLimit: suggestion.timeLimit,
          memoryLimit: suggestion.memoryLimit,
          type: 'programming',
        }),
      })
      const data = await res.json()
      if (data.success) {
        const pid = data.data?.problem?.id || data.data?.id
        if (pid) setCommittedProblemId(pid)
      } else {
        setCommitError(data.error || '入库失败')
      }
    } catch (err) {
      logger.error('题目入库失败', err)
      setCommitError('网络错误，请稍后重试')
    } finally {
      setCommitting(false)
    }
  }

  const isPolling = !!logId && !isTerminal(taskStatus)
  const showSuggestion = !!suggestion && taskStatus === 'COMPLETED'

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 标题 + 副标题（放在同一块，避免负边距导致重叠） */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="w-4 h-4 text-primary" />
          <h3 className="text-base font-bold text-foreground">元数据建议（辅助出题）</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          输入题面后由 AI 建议标签 / 难度 / 提示 / 时间限制 / 内存限制，可微调后一键入库为新题目。
        </p>
      </div>

      {/* 题面输入区 */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          题目描述 <span className="text-error">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="粘贴题面描述、输入输出格式、数据范围等"
          className="input font-mono text-sm"
          disabled={showSuggestion}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">输入格式（可选）</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder="输入格式说明"
            className="input text-sm"
            disabled={showSuggestion}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">输出格式（可选）</label>
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            rows={3}
            placeholder="输出格式说明"
            className="input text-sm"
            disabled={showSuggestion}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-foreground">样例（可选）</label>
          <button
            type="button"
            onClick={addSample}
            disabled={showSuggestion}
            className="btn btn-ghost text-xs flex items-center gap-1 px-2 py-1 disabled:opacity-50"
          >
            <Plus className="w-3 h-3" />
            添加样例
          </button>
        </div>
        {samples.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无样例，点击"添加样例"新增。</p>
        ) : (
          <div className="space-y-2">
            {samples.map((s, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-2 p-2 rounded-lg bg-muted relative">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">#{idx + 1} 输入</p>
                  <textarea
                    value={s.input}
                    onChange={(e) => updateSample(idx, 'input', e.target.value)}
                    rows={2}
                    className="input text-xs font-mono"
                    disabled={showSuggestion}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">输出</p>
                  <textarea
                    value={s.output}
                    onChange={(e) => updateSample(idx, 'output', e.target.value)}
                    rows={2}
                    className="input text-xs font-mono"
                    disabled={showSuggestion}
                  />
                </div>
                {!showSuggestion && (
                  <button
                    type="button"
                    onClick={() => removeSample(idx)}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-error text-white flex items-center justify-center hover:opacity-80"
                    title="删除样例"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 错误提示（入队） */}
      {error && (
        <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* 提交按钮 */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !description.trim() || showSuggestion}
        className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
        {submitting ? '入队中...' : '获取 AI 建议'}
      </button>

      {/* 轮询进度 */}
      {isPolling && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span>AI 正在分析题面并生成建议...</span>
          {logId && (
            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded ml-auto">
              log: {logId.slice(-8)}
            </code>
          )}
        </div>
      )}

      {/* 轮询失败 */}
      {taskStatus === 'FAILED' && (
        <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">AI 建议生成失败</p>
            {taskError && <p className="text-xs mt-1 break-words">{taskError}</p>}
          </div>
        </div>
      )}

      {/* AI 建议结果区（可编辑） */}
      {showSuggestion && suggestion && (
        <div className="card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm text-secondary">
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">AI 建议结果</span>
            <span className="text-xs text-muted-foreground">（可微调后入库）</span>
          </div>

          {/* 题目标题 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              题目标题 <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入题目标题"
              className="input"
            />
          </div>

          {/* 标签（可增删） */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">标签</label>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {suggestion.tags.length === 0 && (
                <span className="text-xs text-muted-foreground">暂无标签</span>
              )}
              {suggestion.tags.map(t => (
                <span
                  key={t}
                  className="tag text-xs flex items-center gap-1 bg-primary/10 text-primary"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="hover:text-error"
                    title="移除标签"
                  >
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
                placeholder="输入标签后回车添加"
                className="input flex-1 text-sm"
              />
              <button
                type="button"
                onClick={addTag}
                className="btn btn-secondary text-xs flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                添加
              </button>
            </div>
          </div>

          {/* 难度（下拉） */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">难度</label>
            <select
              value={suggestion.difficulty}
              onChange={(e) => setSuggestion(prev => prev ? { ...prev, difficulty: e.target.value } : prev)}
              className="input"
            >
              {DIFFICULTIES.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* 提示 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">提示</label>
            <textarea
              value={suggestion.hint}
              onChange={(e) => setSuggestion(prev => prev ? { ...prev, hint: e.target.value } : prev)}
              rows={3}
              placeholder="数据范围提示（不透露算法）"
              className="input text-sm"
            />
          </div>

          {/* 时间 / 内存限制 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                时间限制（ms）
              </label>
              <input
                type="number"
                value={suggestion.timeLimit}
                min={1}
                max={30000}
                onChange={(e) =>
                  setSuggestion(prev =>
                    prev ? { ...prev, timeLimit: Number(e.target.value) || 0 } : prev
                  )
                }
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                内存限制（MB）
              </label>
              <input
                type="number"
                value={suggestion.memoryLimit}
                min={1}
                max={1024}
                onChange={(e) =>
                  setSuggestion(prev =>
                    prev ? { ...prev, memoryLimit: Number(e.target.value) || 0 } : prev
                  )
                }
                className="input"
              />
            </div>
          </div>

          {/* 原始题面只读展示 */}
          <details className="border border-border rounded-lg">
            <summary className="px-3 py-2 text-sm font-medium text-foreground cursor-pointer select-none">
              原始题面（只读，将随入库一并保存）
            </summary>
            <div className="px-3 py-2 space-y-2 text-xs">
              <div>
                <p className="text-muted-foreground mb-1">描述：</p>
                <pre className="whitespace-pre-wrap font-mono bg-muted p-2 rounded">{description}</pre>
              </div>
              {input.trim() && (
                <div>
                  <p className="text-muted-foreground mb-1">输入格式：</p>
                  <pre className="whitespace-pre-wrap font-mono bg-muted p-2 rounded">{input}</pre>
                </div>
              )}
              {output.trim() && (
                <div>
                  <p className="text-muted-foreground mb-1">输出格式：</p>
                  <pre className="whitespace-pre-wrap font-mono bg-muted p-2 rounded">{output}</pre>
                </div>
              )}
              {samples.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1">样例：</p>
                  <pre className="whitespace-pre-wrap font-mono bg-muted p-2 rounded">
                    {JSON.stringify(samples, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </details>

          {/* 入库错误提示 */}
          {commitError && (
            <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-sm">{commitError}</span>
            </div>
          )}

          {/* 入库成功提示 */}
          {committedProblemId && (
            <div className="bg-secondary/10 border border-green-500/30 text-secondary px-4 py-3 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span className="text-sm flex-1">题目入库成功！</span>
              <Link
                href={`/admin/problems/${committedProblemId}`}
                className="text-xs underline hover:opacity-80 flex-shrink-0"
              >
                查看题目
              </Link>
            </div>
          )}

          {/* 一键入库按钮 */}
          {!committedProblemId && (
            <button
              type="button"
              onClick={handleCommit}
              disabled={committing || !title.trim()}
              className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {committing ? '入库中...' : '一键入库'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default SuggestMetadataForm
