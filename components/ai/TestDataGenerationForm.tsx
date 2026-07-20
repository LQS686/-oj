'use client'

import { useState } from 'react'
import {
  Loader2, AlertCircle, RefreshCw, Plus, Database,
} from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { ProblemNumberSearch, type ProblemFullInfo } from './ProblemNumberSearch'
import { ProblemDetailCard } from './ProblemDetailCard'

type TestDataMode = 'test_data' | 'test_data_incremental'

interface TestDataGenerationFormProps {
  problemId?: string
  modelId?: string
  onEnqueued?: (logId: string) => void
  className?: string
}

export function TestDataGenerationForm({
  problemId: defaultProblemId,
  modelId,
  onEnqueued,
  className = '',
}: TestDataGenerationFormProps) {
  const [problem, setProblem] = useState<ProblemFullInfo | null>(null)
  const [mode, setMode] = useState<TestDataMode>('test_data')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    if (!problem?.id) {
      setError('请先选择题目')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetchWithCookie('/api/admin/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          problemId: problem.id,
          targetProblemId: problem.id,
          title: problem.title,
          description: problem.description || '',
          modelId: modelId || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        const logId = data.data?.logId || data.data?.id
        if (logId && onEnqueued) onEnqueued(logId)
      } else {
        setError(data.error || '入队失败')
      }
    } catch (err) {
      logger.error('测试数据生成入队失败', err)
      setError('网络错误，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-primary" />
        <h3 className="text-base font-bold text-foreground">测试数据生成</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        题号搜索选题后，AI 基于题面生成测试用例。全量替换覆盖现有测试点，增量补充仅追加缺失维度。
      </p>

      <ProblemNumberSearch
        defaultProblemId={defaultProblemId}
        onProblemSelected={setProblem}
        placeholder="输入题号（如 P1000）或标题关键字"
      />

      {/* 选中题目后：一个卡片显示完整题目信息（测试点默认折叠可展开） */}
      {problem && (
        <ProblemDetailCard problem={problem} showTestCases />
      )}

      {/* 模式切换：显眼双卡片 */}
      {problem && (
        <div>
          <p className="text-sm font-medium text-foreground mb-2">生成模式</p>
          <div className="grid grid-cols-2 gap-3">
            <label
              className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                mode === 'test_data'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted'
              }`}
            >
              <input
                type="radio"
                name="test-data-mode"
                value="test_data"
                checked={mode === 'test_data'}
                onChange={() => setMode('test_data')}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">全量替换</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  删除现有测试点后生成全新测试点（10 维覆盖）
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                mode === 'test_data_incremental'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted'
              }`}
            >
              <input
                type="radio"
                name="test-data-mode"
                value="test_data_incremental"
                checked={mode === 'test_data_incremental'}
                onChange={() => setMode('test_data_incremental')}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-secondary" />
                  <span className="text-sm font-medium text-foreground">增量补充</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  保留现有测试点，仅补充缺失维度
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {problem && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          {submitting
            ? '入队中...'
            : mode === 'test_data_incremental'
              ? '生成测试数据（增量补充）'
              : '生成测试数据（全量替换）'}
        </button>
      )}
      {!modelId && problem && (
        <p className="text-xs text-muted-foreground">未选择模型，将使用系统默认模型</p>
      )}
    </div>
  )
}

export default TestDataGenerationForm
