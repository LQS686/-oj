'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Loader2,
  RefreshCw,
  FlaskConical,
  Brain,
  Lightbulb,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'

interface ProblemAiPanelProps {
  /** 题目 ID */
  problemId: string
  /** 题目是否为 AI 生成（用于决定是否显示"建议元数据"按钮） */
  isAiGenerated: boolean
  /** 任务入队成功后的回调（携带 logId） */
  onTaskEnqueued?: (logId: string) => void
  /** 自定义 className */
  className?: string
}

type ActionKind =
  | 'regenerate_solution'
  | 'analyze'
  | 'suggest_metadata'
  | 'similar'

interface ActionState {
  loading: boolean
  message?: { type: 'success' | 'error'; text: string }
}

const INITIAL_STATE: ActionState = { loading: false }

/**
 * 题目侧栏 AI 面板
 *
 * 列出该题目可执行的所有 AI 操作：
 * - 重新生成题解：POST /api/admin/ai/solution/regenerate body `{ problemId }`
 * - 跳转测试数据生成：Link → /admin/ai?tab=test_data&problemId=...
 * - 智能分析：POST /api/admin/ai/analyze body `{ problemId }`
 * - 建议元数据（仅当 isAiGenerated=false）：POST /api/admin/ai/suggest-metadata body `{ problemId }`
 * - 生成相似题：仅显示占位（Phase 6 实现）
 *
 * 组件本身不轮询任务状态，仅负责入队；轮询与结果展示由 AiWorkspaceShell
 * 的右下角任务列表统一处理，或由父页面（如 edit 页面）通过 onTaskEnqueued
 * 自行启动轮询。
 */
export function ProblemAiPanel({
  problemId,
  isAiGenerated,
  onTaskEnqueued,
  className = '',
}: ProblemAiPanelProps) {
  const [states, setStates] = useState<Record<ActionKind, ActionState>>({
    regenerate_solution: { ...INITIAL_STATE },
    analyze: { ...INITIAL_STATE },
    suggest_metadata: { ...INITIAL_STATE },
    similar: { ...INITIAL_STATE },
  })

  const updateState = (kind: ActionKind, patch: Partial<ActionState>) => {
    setStates(prev => ({
      ...prev,
      [kind]: { ...prev[kind], ...patch },
    }))
  }

  /**
   * 统一入队：POST 请求 + 解析 { success, data: { logId } }
   * 成功后清空消息（由调用方决定下一步动作），失败展示错误。
   */
  const enqueue = async (
    kind: ActionKind,
    url: string,
    body: Record<string, unknown>,
    successText: string
  ) => {
    updateState(kind, { loading: true, message: undefined })
    try {
      const res = await fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        const logId: string | undefined = data.data?.logId
        updateState(kind, {
          loading: false,
          message: { type: 'success', text: successText },
        })
        if (logId) onTaskEnqueued?.(logId)
      } else {
        const text =
          (typeof data?.error === 'string' && data.error) ||
          data?.error?.message ||
          data?.message ||
          '入队失败'
        updateState(kind, { loading: false, message: { type: 'error', text } })
      }
    } catch (err) {
      logger.error(`ProblemAiPanel ${kind} 失败`, err)
      const text = err instanceof Error ? err.message : '网络错误'
      updateState(kind, { loading: false, message: { type: 'error', text } })
    }
  }

  const handleRegenerateSolution = () => {
    if (!window.confirm('将删除原 AI 官方题解并重新生成。确定继续吗？')) return
    enqueue(
      'regenerate_solution',
      '/api/admin/ai/solution/regenerate',
      { problemId },
      'AI 题解已重新入队生成'
    )
  }

  const handleAnalyze = () => {
    enqueue(
      'analyze',
      '/api/admin/ai/analyze',
      { problemId },
      '智能分析任务已入队'
    )
  }

  const handleSuggestMetadata = () => {
    enqueue(
      'suggest_metadata',
      '/api/admin/ai/suggest-metadata',
      { problemId },
      '元数据建议任务已入队'
    )
  }

  const handleSimilarProblem = () => {
    // Phase 6 Task 28.6: 调用 /api/admin/ai/similar 入队相似题生成
    if (!window.confirm('将基于本题生成一道相似变体题（同主题/同难度，不同背景）。确定继续吗？')) return
    enqueue(
      'similar',
      '/api/admin/ai/similar',
      { problemId },
      '相似题生成任务已入队'
    )
  }

  const renderMessage = (kind: ActionKind) => {
    const msg = states[kind].message
    if (!msg) return null
    return (
      <p
        className={`mt-1.5 text-xs ${
          msg.type === 'success' ? 'text-success' : 'text-error'
        }`}
      >
        {msg.text}
      </p>
    )
  }

  return (
    <section
      className={`card-static p-5 space-y-4 ${className}`}
      aria-label="题目 AI 操作面板"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background:
              'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)',
          }}
        >
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">AI 操作</h3>
          <p className="text-xs text-muted-foreground">
            一键触发该题目的 AI 辅助能力
          </p>
        </div>
      </div>

      {/* 重新生成题解 */}
      <div>
        <button
          type="button"
          onClick={handleRegenerateSolution}
          disabled={states.regenerate_solution.loading}
          className="btn btn-primary w-full text-sm flex items-center justify-center gap-2"
          title="删除原 AI 官方题解并重新入队生成"
        >
          {states.regenerate_solution.loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          重新生成题解
        </button>
        {renderMessage('regenerate_solution')}
      </div>

      {/* 跳转测试数据生成（Link 跳转到工作区） */}
      <div>
        <Link
          href={`/admin/ai?tab=test_data&problemId=${encodeURIComponent(problemId)}`}
          className="btn btn-ghost w-full text-sm flex items-center justify-center gap-2"
          title="跳转到 AI 工作区生成测试数据"
        >
          <FlaskConical className="w-4 h-4" />
          跳转测试数据生成
        </Link>
      </div>

      {/* 智能分析 */}
      <div>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={states.analyze.loading}
          className="btn btn-ghost w-full text-sm flex items-center justify-center gap-2"
          title="AI 智能分析题目（标签 / 难度 / 质量 / 测试维度缺口）"
        >
          {states.analyze.loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Brain className="w-4 h-4" />
          )}
          智能分析
        </button>
        {renderMessage('analyze')}
      </div>

      {/* 建议元数据（仅当 isAiGenerated=false 时显示） */}
      {!isAiGenerated && (
        <div>
          <button
            type="button"
            onClick={handleSuggestMetadata}
            disabled={states.suggest_metadata.loading}
            className="btn btn-ghost w-full text-sm flex items-center justify-center gap-2"
            title="AI 建议标签 / 难度 / 提示 / 时空限制"
          >
            {states.suggest_metadata.loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Lightbulb className="w-4 h-4" />
            )}
            建议元数据
          </button>
          {renderMessage('suggest_metadata')}
        </div>
      )}

      {/* 生成相似题（Phase 6 Task 28.6 已实现） */}
      <div>
        <button
          type="button"
          onClick={handleSimilarProblem}
          disabled={states.similar.loading}
          className="btn btn-ghost w-full text-sm flex items-center justify-center gap-2"
          title="基于本题生成一道相似变体题（同主题/同难度，不同背景）"
        >
          {states.similar.loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          生成相似题
        </button>
        {renderMessage('similar')}
      </div>

      {/* 提示信息 */}
      <div className="flex items-start gap-2 pt-2 border-t border-border text-xs text-muted-foreground">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <p>
          AI 任务提交后可在工作区右下角任务列表查看进度。任务可能需要排队，请耐心等待。
        </p>
      </div>
    </section>
  )
}

export default ProblemAiPanel
