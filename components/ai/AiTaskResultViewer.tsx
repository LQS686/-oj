'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Loader2, AlertCircle, CheckCircle, Clock, RefreshCw,
} from 'lucide-react'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { AiResultPanel, type AiResultMode } from './AiResultPanel'
import type { AiGenerationResult, AiTaskStatus, AiTaskMode } from '@/types/ai'

interface AiTaskResultViewerProps {
  /** 要追踪的任务 logId（来自表单提交后的返回值） */
  logId: string | null
  /** 结果模式（决定 AiResultPanel 渲染布局） */
  mode: AiResultMode
  /** 入库预览题目回调（generate / similar 预览模式） */
  onCommitPreview?: (logId: string) => Promise<void> | void
  /** 丢弃预览题目回调 */
  onDiscardPreview?: (logId: string) => Promise<void> | void
  /** 重新生成回调 */
  onRegenerate?: (logId: string) => Promise<void> | void
  /** 自定义 className */
  className?: string
}

/**
 * AI 任务结果查看器
 *
 * 给定 logId，轮询 GET /api/admin/ai/generate?logId=xxx 获取任务状态：
 * - PENDING / PROCESSING：展示进度骨架
 * - COMPLETED：渲染 AiResultPanel（根据 mode 渲染对应布局）
 * - FAILED：展示错误信息 + 诊断建议（result.diagnosis）
 * - DISCARDED：展示"已丢弃"提示
 *
 * 轮询策略：页面可见时每 3s 轮询；任务终态（COMPLETED/FAILED/DISCARDED）后停止。
 */
export function AiTaskResultViewer({
  logId,
  mode,
  onCommitPreview,
  onDiscardPreview,
  onRegenerate,
  className = '',
}: AiTaskResultViewerProps) {
  const [status, setStatus] = useState<AiTaskStatus | null>(null)
  const [result, setResult] = useState<AiGenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [taskMode, setTaskMode] = useState<AiTaskMode | undefined>(undefined)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isTerminal = useCallback(
    (s: AiTaskStatus | null) => s === 'COMPLETED' || s === 'FAILED' || s === 'DISCARDED',
    []
  )

  const fetchTask = useCallback(async () => {
    if (!logId) return
    try {
      const res = await fetchWithAuth(`/api/admin/ai/generate?logId=${logId}`)
      const data = await res.json()
      if (data.success && data.data) {
        const log = data.data
        setStatus(log.status as AiTaskStatus)
        setTaskMode(log.params?.mode as AiTaskMode | undefined)
        setResult(log.result as AiGenerationResult | null)
        setError(log.error || null)
      } else {
        setError(data.error || '获取任务状态失败')
      }
    } catch (err) {
      logger.error('轮询 AI 任务结果失败', err)
      setError('网络错误，无法获取任务状态')
    }
  }, [logId])

  // logId 变化时重置并立即拉取一次
  useEffect(() => {
    setStatus(null)
    setResult(null)
    setError(null)
    setTaskMode(undefined)
    if (!logId) return
    fetchTask()
  }, [logId, fetchTask])

  // 轮询：未达终态时每 5s 拉取
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
        if (document.visibilityState === 'visible' && !isTerminal(status)) {
          fetchTask()
        }
      }, 5000)
    }

    if (logId && !isTerminal(status)) {
      if (document.visibilityState === 'visible') start()
    } else {
      stop()
    }

    const onVis = () => {
      if (document.visibilityState === 'visible' && !isTerminal(status)) {
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
  }, [logId, status, isTerminal, fetchTask])

  // 未提交任何任务
  if (!logId) {
    return null
  }

  // PENDING / PROCESSING
  if (status === 'PENDING' || status === 'PROCESSING') {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span>
            {status === 'PENDING' ? '任务排队中...' : 'AI 正在生成，请稍候...'}
          </span>
          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded ml-auto">
            log: {logId.slice(-8)}
          </code>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-muted rounded animate-pulse" />
          <div className="h-3 bg-muted rounded animate-pulse w-5/6" />
          <div className="h-3 bg-muted rounded animate-pulse w-4/6" />
        </div>
      </div>
    )
  }

  // DISCARDED
  if (status === 'DISCARDED') {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted text-muted-foreground text-sm">
          <AlertCircle className="w-4 h-4" />
          该预览任务已被丢弃
        </div>
      </div>
    )
  }

  // FAILED
  if (status === 'FAILED') {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">任务失败</p>
            {error && <p className="text-xs mt-1 break-words">{error}</p>}
          </div>
          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
            log: {logId.slice(-8)}
          </code>
        </div>
        {/* 失败时也可能有 diagnosis（自动诊断入队后会有独立 log，但此处展示当前 log 的诊断结果） */}
        {result?.diagnosis && (
          <AiResultPanel
            result={result}
            mode={mode}
            onCommitPreview={onCommitPreview ? () => onCommitPreview(logId) : undefined}
            onDiscardPreview={onDiscardPreview ? () => onDiscardPreview(logId) : undefined}
            onRegenerate={onRegenerate ? () => onRegenerate(logId) : undefined}
          />
        )}
        {onRegenerate && (
          <button
            type="button"
            onClick={() => onRegenerate(logId)}
            className="btn btn-secondary text-sm flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            重试任务
          </button>
        )}
      </div>
    )
  }

  // COMPLETED
  if (status === 'COMPLETED' && result) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center gap-2 text-xs text-secondary">
          <CheckCircle className="w-3.5 h-3.5" />
          生成完成
          <code className="font-mono bg-muted px-1.5 py-0.5 rounded ml-auto">
            log: {logId.slice(-8)}
          </code>
        </div>
        <AiResultPanel
          result={result}
          mode={mode}
          onCommitPreview={onCommitPreview ? () => onCommitPreview(logId) : undefined}
          onDiscardPreview={onDiscardPreview ? () => onDiscardPreview(logId) : undefined}
          onRegenerate={onRegenerate ? () => onRegenerate(logId) : undefined}
        />
      </div>
    )
  }

  // 兜底：状态未知
  return (
    <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
      <Clock className="w-4 h-4 animate-pulse" />
      正在获取任务状态...
    </div>
  )
}

export default AiTaskResultViewer
