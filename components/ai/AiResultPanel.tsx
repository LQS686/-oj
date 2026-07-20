'use client'

import { useState } from 'react'
import {
  AlertTriangle, CheckCircle, Copy, FileText, Tag, Lightbulb,
  Target, ListChecks, AlertCircle, Check, Loader2, RotateCw,
  Trash2, ShieldCheck, Gauge, Stethoscope, GitCompare,
} from 'lucide-react'
import { DIFFICULTY_COLORS, isValidDifficulty, migrateDifficulty, type Difficulty } from '@/lib/constants'
import { AiThinkingTrace } from './AiThinkingTrace'
import { ProblemDetailCard } from './ProblemDetailCard'
import type { ProblemFullInfo } from './ProblemNumberSearch'
import type { AiGenerationResult } from '@/types/ai'

/** 4 种结果模式 */
export type AiResultMode = 'generate' | 'test_data' | 'analyze' | 'suggest_metadata'

interface AiResultPanelProps {
  /** 生成结果（来自 AiGenerationLog.result） */
  result: AiGenerationResult
  /** 结果模式（决定渲染布局） */
  mode: AiResultMode
  /** 自定义 className */
  className?: string
  /** 采纳建议回调（suggest_metadata 模式下点击"采纳"按钮触发） */
  onAdoptMetadata?: (metadata: NonNullable<AiGenerationResult['metadata']>) => void
  /** 跳转关联题目（generate 模式下"在题库中查看"按钮触发；默认打开新窗口） */
  onViewInLibrary?: () => void
  /** Phase 6 Task 27.5: 入库预览题目（commit） */
  onCommitPreview?: () => Promise<void> | void
  /** Phase 6 Task 27.5: 丢弃预览题目（discard） */
  onDiscardPreview?: () => Promise<void> | void
  /** Phase 6 Task 27.5: 重新生成 */
  onRegenerate?: () => Promise<void> | void
  /** 任务状态：'DISCARDED' 时显示"已丢弃"状态条而非操作按钮。
   *  来自 AiTask.status（commit 后后端将 isPreview 改为 false + committedProblemIds 写入 result，
   *  discard 后 status 改为 DISCARDED）。 */
  taskStatus?: string
}

/**
 * AI 生成结果展示面板
 *
 * 根据 mode 渲染不同结果布局：
 * - generate：题目描述 / 样例 / 标程 / 测试点列表 / 思维过程 / 质量自检
 * - test_data：测试点列表
 * - analyze：分析卡片（建议标签 / 建议难度 / 质量问题 / 测试维度缺口 / 提示建议）
 * - suggest_metadata：建议卡片 + 采纳按钮
 *
 * 从 ai-generation/page.tsx 提取的"生成结果"展示逻辑（原行 ~1056-1147）。
 */
export function AiResultPanel({
  result,
  mode,
  className = '',
  onAdoptMetadata,
  onViewInLibrary,
  onCommitPreview,
  onDiscardPreview,
  onRegenerate,
  taskStatus,
}: AiResultPanelProps) {
  const [copied, setCopied] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getDifficultyColor = (diff: string) => {
    const normalized: Difficulty = isValidDifficulty(diff) ? diff : migrateDifficulty(diff)
    const color = DIFFICULTY_COLORS[normalized]
    return color ? `tag ${color}` : 'tag'
  }

  // Phase 6 Task 27.5: 预览-确认操作
  const handleCommit = async () => {
    if (!onCommitPreview) return
    setCommitting(true)
    try { await onCommitPreview() } finally { setCommitting(false) }
  }
  const handleDiscard = async () => {
    if (!onDiscardPreview) return
    setDiscarding(true)
    try { await onDiscardPreview() } finally { setDiscarding(false) }
  }

  // Phase 6 Task 31.5 + spec 第 7.5 节: 质量评分徽章（0-100 评分体系）
  // >= 80 高质量（pass）/ 60-80 待复核（warn）/ < 60 已失败（error，任务会 FAILED）
  const renderQualityBadge = (score?: number) => {
    if (score === undefined || score === null) return null
    const isHigh = score >= 80
    const isFailed = score < 60
    const colorClass = isFailed ? 'tag-error' : isHigh ? 'tag-success' : 'tag-warning'
    const label = isFailed ? '已失败' : isHigh ? '高质量' : '待复核'
    return (
      <span className={`tag text-xs ${colorClass}`} title={`质量评分: ${score}/100（5 维度各 0-20）`}>
        <ShieldCheck className="w-3 h-3 inline mr-0.5" />
        {label} ({score}/100)
      </span>
    )
  }

  // spec 第 7.5 节: 相似度评分徽章（0-1）
  // > 0.95 视为重复题（任务会 FAILED）/ > 0.8 warn 提示人工复核 / <= 0.8 不展示
  const renderSimilarityBadge = (score?: number) => {
    if (score === undefined || score === null) return null
    if (score <= 0.8) return null
    const isFailed = score > 0.95
    const colorClass = isFailed ? 'tag-error' : 'tag-warning'
    const label = isFailed ? '重复题' : '相似度提示'
    return (
      <span className={`tag text-xs ${colorClass}`} title={`题目相似度: ${(score * 100).toFixed(1)}%（>0.95 视为重复题）`}>
        <GitCompare className="w-3 h-3 inline mr-0.5" />
        {label} ({(score * 100).toFixed(1)}%)
      </span>
    )
  }

  // Phase 6 Task 34.3: 强度评分 chip
  const renderStrengthChip = (score?: number) => {
    if (score === undefined || score === null) return null
    const colorClass = score >= 85 ? 'tag-success' : score >= 60 ? '' : 'tag-warning'
    return (
      <span className={`tag text-xs ${colorClass}`} title={`测试数据强度: ${score}/100`}>
        <Gauge className="w-3 h-3 inline mr-0.5" />
        强度 {score}
      </span>
    )
  }

  // Phase 6 Task 30.6: 诊断建议卡片
  const renderDiagnosisCard = () => {
    if (!result.diagnosis) return null
    const { failureType, suggestedFix, analysis, similarFailureCount } = result.diagnosis
    return (
      <div className="bg-info/5 border border-info/20 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <Stethoscope className="w-4 h-4 text-info" />
          <p className="text-sm font-medium text-info">AI 诊断建议</p>
          {failureType && (
            <span className="tag tag-info text-xs ml-auto">{failureType}</span>
          )}
        </div>
        {suggestedFix && (
          <p className="text-xs text-foreground leading-relaxed">
            <span className="font-medium">修复建议：</span>{suggestedFix}
          </p>
        )}
        {analysis && (
          <p className="text-xs text-muted-foreground leading-relaxed">{analysis}</p>
        )}
        {similarFailureCount !== undefined && similarFailureCount > 0 && (
          <p className="text-xs text-warning">
            近 7 天同类 prompt 失败 {similarFailureCount} 次，建议检查 prompt 模板
          </p>
        )}
      </div>
    )
  }

  // Phase 6 Task 27.5: 预览-确认操作栏
  // 三种状态：
  // 1. taskStatus === 'DISCARDED' → 显示"已丢弃"状态条（无按钮）
  // 2. result.isPreview === false 且 committedProblemIds 存在 → 显示"已入库"状态条（无按钮）
  // 3. result.isPreview === true → 显示入库/丢弃/重新生成按钮
  // 其他情况（非预览模式）不渲染
  const renderPreviewActions = () => {
    // 已丢弃
    if (taskStatus === 'DISCARDED') {
      return (
        <div className="bg-muted border border-border rounded-lg p-3">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
            <Trash2 className="w-4 h-4" />
            已丢弃 — 该预览题目未入库
          </p>
        </div>
      )
    }
    // 已入库（result.committedProblemIds 由后端 commitPreviewedProblem 写入）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const committedIds = (result as any).committedProblemIds as string[] | undefined
    if (!result.isPreview && committedIds && committedIds.length > 0) {
      return (
        <div className="bg-secondary/5 border border-secondary/20 rounded-lg p-3">
          <p className="text-sm font-medium text-secondary flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" />
            已入库 — 共 {committedIds.length} 题
          </p>
        </div>
      )
    }
    // 仍是预览状态 → 显示按钮
    if (!result.isPreview) return null
    return (
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
        <p className="text-sm font-medium text-primary flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4" />
          预览模式 — 请确认入库或丢弃
        </p>
        <div className="flex flex-wrap gap-2">
          {onCommitPreview && (
            <button
              onClick={handleCommit}
              disabled={committing}
              className="btn btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              入库
            </button>
          )}
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="btn btn-secondary text-sm flex items-center gap-1.5"
            >
              <RotateCw className="w-4 h-4" />
              重新生成
            </button>
          )}
          {onDiscardPreview && (
            <button
              onClick={handleDiscard}
              disabled={discarding}
              className="btn btn-ghost text-sm flex items-center gap-1.5 text-error disabled:opacity-50"
            >
              {discarding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              丢弃
            </button>
          )}
        </div>
      </div>
    )
  }

  if (mode === 'generate') {
    // Phase 6 Task 27: 预览模式下从 previewProblems 读取，否则从 problems 读取
    // 后端 previewProblems 使用 camelCase + solution 对象；problems（旧版）使用 snake_case
    // 使用 any 类型因为后端两种存储结构字段名不同，需运行时适配
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawProblem: any = result.problems?.[0] || result.previewProblems?.[0]
    if (!rawProblem) {
      return (
        <div className={`space-y-3 ${className}`}>
          {renderDiagnosisCard()}
          <div className="text-center py-8 text-muted-foreground text-sm">
            暂无可展示的生成结果
          </div>
        </div>
      )
    }

    // 字段适配：兼容两种存储格式
    // - previewProblems（队列写入）：camelCase + stdCode + solution{content, code, codeLanguage}
    // - problems（旧版/直接生成）：snake_case + solution_cpp + solution_article
    // spec 第 2.1/6.6/6.7 节：C++ 标程是唯一权威，不再读取 / 不再展示 solution_python
    const isPreviewFormat = !!result.previewProblems?.[0]
    const testCaseList: Array<{ input: string; output: string; score?: number }> =
      (rawProblem.testCases as any) || (rawProblem.test_cases as any) || []
    const timeLimit = (rawProblem.timeLimit as number) ?? rawProblem.time_limit
    const memoryLimit = (rawProblem.memoryLimit as number) ?? rawProblem.memory_limit
    // 标程：优先 previewProblems 的 stdCode/stdLang，其次 problems 的 solution_cpp
    const solutionCpp =
      (isPreviewFormat && rawProblem.stdLang === 'cpp' ? rawProblem.stdCode : null) ||
      rawProblem.solution_cpp ||
      null
    // 题解 markdown：优先 previewProblems 的 solution.content，其次 problems 的 solution_article
    const solutionArticle =
      (isPreviewFormat ? rawProblem.solution?.content : null) || rawProblem.solution_article || null

    // spec 第 7.4/7.5 节：综合质量评分（0-100）+ 相似度评分（0-1）
    // 后端 parametric.ts 在 qualityResult 计算后回填到 previewProblems[i]
    const problemQualityScore: number | undefined =
      typeof rawProblem.qualityScore === 'number' ? rawProblem.qualityScore : undefined
    const problemSimilarityScore: number | undefined =
      typeof rawProblem.similarityScore === 'number' ? rawProblem.similarityScore : undefined
    // 顶层 result.qualityScore 仍保留作为兼容兜底（旧版数据可能存在）
    const displayQualityScore: number | undefined =
      problemQualityScore ?? result.qualityScore
    const displaySimilarityScore: number | undefined =
      problemSimilarityScore ?? result.similarityScore

    // 将 AI 生成题目适配为 ProblemFullInfo 格式，复用 ProblemDetailCard
    const difficulty: Difficulty = rawProblem.difficulty
      ? (isValidDifficulty(rawProblem.difficulty) ? rawProblem.difficulty : migrateDifficulty(rawProblem.difficulty))
      : '入门'
    const problemForCard: ProblemFullInfo = {
      id: rawProblem.id || '',
      problemNumber: rawProblem.problemNumber || null,
      title: rawProblem.title || '(未命名)',
      difficulty,
      tags: rawProblem.tags || [],
      description: rawProblem.description,
      input: rawProblem.input,
      output: rawProblem.output,
      samples: rawProblem.samples || [],
      hint: rawProblem.hint,
      timeLimit,
      memoryLimit,
      isAiGenerated: true,
      testCases: testCaseList.map((tc, idx) => ({
        input: tc.input,
        output: tc.output,
        orderIndex: idx + 1,
        isSample: false,
        // 后端 ensureTotalScoreIs100 已归一化总分 100，保留实际分数
        score: typeof tc.score === 'number' ? tc.score : Math.floor(100 / testCaseList.length),
      })),
    }

    return (
      <div className={`space-y-3 ${className}`}>
        {/* Phase 6 Task 27.5: 预览-确认操作栏 */}
        {renderPreviewActions()}

        {/* 顶部：题目名称 + 复制 + 评分徽章 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">题目名称</p>
            <h3 className="text-lg font-bold text-foreground">{rawProblem.title || '(未命名)'}</h3>
          </div>
          <button
            onClick={() => rawProblem.title && handleCopy(rawProblem.title)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="复制标题"
          >
            {copied ? <CheckCircle className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {/* Phase 6 评分徽章（不与 ProblemDetailCard 内的难度/标签重复） */}
        {(displayQualityScore !== undefined || displaySimilarityScore !== undefined) && (
          <div className="flex items-center gap-2 flex-wrap">
            {renderQualityBadge(displayQualityScore)}
            {renderSimilarityBadge(displaySimilarityScore)}
          </div>
        )}

        {/* 复用题库题目详情卡片：题目信息 + 测试点（默认折叠） + 题解 + C++ 标程 */}
        <ProblemDetailCard
          problem={problemForCard}
          showTestCases={true}
          solutionCpp={solutionCpp || undefined}
          solutionArticle={solutionArticle || undefined}
        />

        {/* 思考过程 */}
        {result.thought && (
          <AiThinkingTrace thinking={result.thought} />
        )}

        {/* 质量自检 */}
        {result.qualityIssues && result.qualityIssues.length > 0 && (
          <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
            <p className="text-sm font-medium text-warning flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              质量自检发现 {result.qualityIssues.length} 个提示
            </p>
            <ul className="text-xs text-warning/80 mt-2 space-y-1">
              {result.qualityIssues.map((q, i) => (
                <li key={i}>• 题目 #{q.problemIndex + 1}：{q.reason}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Phase 6 Task 30.6: 诊断建议卡片 */}
        {renderDiagnosisCard()}

        {/* 在题库中查看（非预览模式才显示） */}
        {!result.isPreview && (
          <div className="pt-3 border-t border-border flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (onViewInLibrary) {
                  onViewInLibrary()
                } else {
                  window.open('/admin/problems', '_blank')
                }
              }}
              className="btn btn-primary text-sm flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              在题库中查看
            </button>
          </div>
        )}
      </div>
    )
  }

  if (mode === 'test_data') {
    const testCases = result.testCases || result.problems?.[0]?.test_cases || []
    if (testCases.length === 0) {
      return (
        <div className={`space-y-3 ${className}`}>
          {renderDiagnosisCard()}
          <div className="text-center py-8 text-muted-foreground text-sm">
            暂无生成的测试数据
          </div>
        </div>
      )
    }
    return (
      <div className={`space-y-3 ${className}`}>
        {result.thought && <AiThinkingTrace thinking={result.thought} />}
        {/* Phase 6 Task 34.3: 强度评分 chip */}
        {renderStrengthChip(result.strengthScore)}
        <TestCasesList testCases={testCases} />
        {/* Phase 6 Task 30.6: 诊断建议卡片 */}
        {renderDiagnosisCard()}
      </div>
    )
  }

  if (mode === 'analyze') {
    const analysis = result.analysis
    if (!analysis) {
      return (
        <div className={`space-y-3 ${className}`}>
          {renderDiagnosisCard()}
          <div className="text-center py-8 text-muted-foreground text-sm">
            暂无分析结果
          </div>
        </div>
      )
    }
    return (
      <div className={`space-y-3 ${className}`}>
        {result.thought && <AiThinkingTrace thinking={result.thought} />}

        {analysis.suggestedTags && analysis.suggestedTags.length > 0 && (
          <AnalysisCard icon={<Tag className="w-4 h-4 text-primary" />} title="建议标签">
            <div className="flex flex-wrap gap-1.5">
              {analysis.suggestedTags.map((t, i) => (
                <span key={i} className="tag tag-primary text-xs">{t}</span>
              ))}
            </div>
          </AnalysisCard>
        )}

        {analysis.suggestedDifficulty && (
          <AnalysisCard icon={<Target className="w-4 h-4 text-primary" />} title="建议难度">
            <span className={getDifficultyColor(analysis.suggestedDifficulty)}>
              {analysis.suggestedDifficulty}
            </span>
          </AnalysisCard>
        )}

        {analysis.qualityIssues && analysis.qualityIssues.length > 0 && (
          <AnalysisCard icon={<AlertCircle className="w-4 h-4 text-warning" />} title="质量问题">
            <ul className="text-xs text-foreground space-y-1 list-disc list-inside">
              {analysis.qualityIssues.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </AnalysisCard>
        )}

        {analysis.testCaseGaps && analysis.testCaseGaps.length > 0 && (
          <AnalysisCard icon={<ListChecks className="w-4 h-4 text-warning" />} title="测试维度缺口">
            <ul className="text-xs text-foreground space-y-1 list-disc list-inside">
              {analysis.testCaseGaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </AnalysisCard>
        )}

        {analysis.suggestedHints && analysis.suggestedHints.length > 0 && (
          <AnalysisCard icon={<Lightbulb className="w-4 h-4 text-primary" />} title="建议提示">
            <ul className="text-xs text-foreground space-y-1 list-disc list-inside">
              {analysis.suggestedHints.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </AnalysisCard>
        )}

        {/* Phase 6 Task 30.6: 诊断建议卡片 */}
        {renderDiagnosisCard()}
      </div>
    )
  }

  // mode === 'suggest_metadata'
  const metadata = result.metadata
  if (!metadata) {
    return (
      <div className={`space-y-3 ${className}`}>
        {/* Phase 6 Task 30.6: 诊断建议卡片 */}
        {renderDiagnosisCard()}
        <div className="text-center py-8 text-muted-foreground text-sm">
          暂无元数据建议
        </div>
      </div>
    )
  }
  return (
    <div className={`space-y-3 ${className}`}>
      {result.thought && <AiThinkingTrace thinking={result.thought} />}
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-primary" />
          AI 元数据建议
        </h3>

        {metadata.tags && metadata.tags.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">建议标签</p>
            <div className="flex flex-wrap gap-1.5">
              {metadata.tags.map((t, i) => (
                <span key={i} className="tag text-xs">{t}</span>
              ))}
            </div>
          </div>
        )}

        {metadata.difficulty && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">建议难度</p>
            <span className={getDifficultyColor(metadata.difficulty)}>{metadata.difficulty}</span>
          </div>
        )}

        {metadata.hint && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">建议提示</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{metadata.hint}</p>
          </div>
        )}

        {(metadata.timeLimit || metadata.memoryLimit) && (
          <div className="grid grid-cols-2 gap-3">
            {metadata.timeLimit && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">建议时间限制</p>
                <p className="text-sm text-foreground">{metadata.timeLimit} ms</p>
              </div>
            )}
            {metadata.memoryLimit && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">建议内存限制</p>
                <p className="text-sm text-foreground">{metadata.memoryLimit} MB</p>
              </div>
            )}
          </div>
        )}

        {onAdoptMetadata && (
          <button
            type="button"
            onClick={() => onAdoptMetadata(metadata)}
            className="btn btn-primary w-full text-sm flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            采纳建议
          </button>
        )}
      </div>

      {/* Phase 6 Task 30.6: 诊断建议卡片 */}
      {renderDiagnosisCard()}
    </div>
  )
}

/**
 * 测试点列表子组件
 */
function TestCasesList({ testCases }: { testCases: Array<{ input: string; output: string }> }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">测试点（{testCases.length}）</p>
      <div className="space-y-2">
        {testCases.map((tc, idx) => (
          <div key={idx} className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-muted">
            <div>
              <p className="text-xs text-muted-foreground mb-1">#{idx + 1} 输入</p>
              <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">
                {tc.input?.slice(0, 200)}
                {tc.input && tc.input.length > 200 ? '...' : ''}
              </pre>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">输出</p>
              <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">
                {tc.output?.slice(0, 200)}
                {tc.output && tc.output.length > 200 ? '...' : ''}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 分析卡片子组件
 */
function AnalysisCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
      </div>
      {children}
    </div>
  )
}

export default AiResultPanel
