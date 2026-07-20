'use client'

import { useState } from 'react'
import { Loader2, GitFork, AlertCircle } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { ProblemNumberSearch, type ProblemFullInfo } from './ProblemNumberSearch'
import { ProblemDetailCard } from './ProblemDetailCard'

/**
 * 相似题生成表单
 *
 * 使用 ProblemNumberSearch 让用户通过题号模糊搜索源题目，
 * 选中后展示源题目信息卡片，点击"生成相似题"提交：
 *   POST /api/admin/ai/similar body={ problemId } → 返回 { logId }
 * AI 基于原题（title / tags / difficulty / solutionCpp）生成变体题目，走预览-确认流程。
 * 成功后通过 onEnqueued(logId) 通知父组件展示结果。
 */
interface SimilarProblemFormProps {
  /** 默认 problemId（从 URL query 预填） */
  defaultProblemId?: string
  /** 提交成功回调 */
  onEnqueued: (logId: string) => void
  /** 自定义 className */
  className?: string
}

export function SimilarProblemForm({
  defaultProblemId,
  onEnqueued,
  className = '',
}: SimilarProblemFormProps) {
  const [problem, setProblem] = useState<ProblemFullInfo | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    if (!problem?.id) {
      setError('请先选择源题目')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetchWithCookie('/api/admin/ai/similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId: problem.id }),
      })
      const data = await res.json()
      if (data.success) {
        const logId = data.data?.logId || data.data?.id
        if (logId) onEnqueued(logId)
      } else {
        setError(data.error || '入队失败')
      }
    } catch (err) {
      logger.error('相似题生成入队失败', err)
      setError('网络错误，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`space-y-5 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <GitFork className="w-4 h-4 text-primary" />
        <h3 className="text-base font-bold text-foreground">相似题生成</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        AI 基于源题目的标题、标签、难度与标程，生成一道算法核心相近但背景不同的变体题目。生成结果为预览，需确认后入库。
      </p>

      <ProblemNumberSearch
        defaultProblemId={defaultProblemId}
        onProblemSelected={setProblem}
        placeholder="输入题号（如 P1000）或标题关键字"
      />

      {/* 源题目完整详情卡片 */}
      {problem && (
        <ProblemDetailCard problem={problem} showTestCases={false} />
      )}

      {error && (
        <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !problem?.id}
        className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitFork className="w-4 h-4" />}
        {submitting ? '入队中...' : '生成相似题'}
      </button>
    </div>
  )
}

export default SimilarProblemForm
