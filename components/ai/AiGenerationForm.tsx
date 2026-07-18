'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Loader2, FileText, AlertCircle,
  Lightbulb, Target, Plus, X, Wand2, ChevronRight, RefreshCw,
} from 'lucide-react'
import { DIFFICULTIES } from '@/lib/constants'
import { TOPICS } from '@/lib/ai/prompts/core/types'
import { DIFFICULTY_PROFILES, type Difficulty } from '@/lib/ai/prompts/core/quality-gates'

/**
 * 主题分组（仅用于 UI 排版，方便从 ~50 个主题里快速找到目标）
 * 实际可选值仍以 TOPICS 全集为准；分组不影响 prompt 与后端传参
 *
 * 与原 ai-generation/page.tsx 内联定义保持一致，UI 复用。
 */
const TOPIC_GROUPS: Array<{ label: string; topics: readonly string[] }> = [
  { label: '基础语法', topics: ['变量与类型', '输入输出', '运算符与表达式', 'if 判断', '循环', '数组基础', '字符串基础', '函数', '结构体', '递归入门', 'switch'] },
  { label: '基础', topics: ['枚举', '模拟', '递推', '前缀和', '差分', '离散化', '倍增'] },
  { label: '排序/查找', topics: ['排序', '二分查找', '二分答案', '三分', '分治'] },
  { label: '动态规划', topics: ['动态规划', '背包', '区间 DP', '树形 DP', '状压 DP', '数位 DP', '概率 DP', 'DP 优化'] },
  { label: '贪心', topics: ['贪心'] },
  { label: '图论', topics: ['图论', '最短路', '最小生成树', '拓扑排序', '二分图', '强连通分量', '网络流', '树上问题'] },
  { label: '搜索', topics: ['DFS/BFS', '搜索剪枝', '启发式搜索', 'A*', 'IDA*'] },
  { label: '字符串', topics: ['字符串', '字符串哈希', 'KMP', 'Trie', 'AC 自动机', '后缀数组', '后缀自动机', 'Manacher'] },
  { label: '数据结构', topics: ['数据结构', '栈', '队列', '链表', '堆/优先队列', '单调栈', '单调队列', '并查集', '线段树', '树状数组', '平衡树', '可持久化', '树链剖分'] },
  { label: '数学', topics: ['数论', '组合数学', '概率期望', '博弈论', '矩阵乘法', '生成函数', '多项式', '线性代数'] },
  { label: '计算几何', topics: ['计算几何', '扫描线'] },
  { label: '高级/特殊', topics: ['位运算', '构造', '随机化', '莫队', '分块', 'CDQ 分治', 'K-D Tree', '李超树'] },
]

/**
 * 基于难度档位生成提示文字（复用 DIFFICULTY_PROFILES）
 */
function getDifficultyHint(d: string): string {
  const profile = DIFFICULTY_PROFILES[d as Difficulty]
  if (!profile) return '请按此档位对应的算法难度生成。'
  const [tMin, tMax] = profile.timeLimitRange
  const [mMin, mMax] = profile.memoryLimitRange
  return `${profile.description}。典型算法：${profile.algorithmExamples.join('、')}。时间 ${tMin}-${tMax}ms，内存 ${mMin}-${mMax}MB。`
}

function getAdditionalPlaceholder(): string {
  return '例如：以校园生活为背景融入剧情、以三国历史为线索加入角色与故事、加入"外卖配送"生活场景...（AI 会把这些背景故事或元素自然地融入题目描述，但不影响算法核心）'
}

const LAST_MODEL_KEY = 'ai-last-model-id'
const DEBOUNCE_MS = 1500

/** 表单提交参数（与后端 /api/admin/ai/generate POST body 对齐） */
export interface AiGenerationSubmitParams {
  mode: 'parametric'
  type: 'programming'
  difficulty: string
  topic: string[]
  additionalInfo?: string
  modelId: string
}

interface AiGenerationFormProps {
  /** 默认模型 ID（父组件 AiWorkspaceShell 顶部模型选择器同步而来） */
  defaultModelId?: string
  /** 提交回调（父组件负责实际入队请求） */
  onSubmit: (params: AiGenerationSubmitParams) => Promise<void>
  /** 是否正在提交（用于禁用按钮） */
  submitting?: boolean
  /** 当前进行中的任务数（用于按钮文案 "再生成一道（N 个进行中）"） */
  activeJobCount?: number
  /** 重试按钮回调（可选；不传则不显示重试按钮） */
  onRetry?: () => void
  /** 是否正在重试 */
  retrying?: boolean
  /** 自定义 className */
  className?: string
}

/**
 * AI 出题表单（主题多选 + 难度 + 类型 + 附加要求 + 提交按钮 + 重试按钮）
 *
 * 从 ai-generation/page.tsx 提取，保留原有交互：
 * - 主题多选（覆盖 TOPICS 全集 + 手动输入自定义词）
 * - 难度选择（8 档 + 难度说明折叠）
 * - 附加要求（背景故事 / 元素，可选）
 * - 提交按钮（带 1.5s 防误触冷却）
 * - 重试按钮（可选）
 *
 * 模型选择器复用 AiWorkspaceShell 顶部统一的 AiModelPicker（由父组件透传 defaultModelId）；
 * 本组件不再单独渲染模型选择 UI，避免重复请求 /api/admin/ai/models 和与顶部选择不同步的问题。
 */
export function AiGenerationForm({
  defaultModelId,
  onSubmit,
  submitting = false,
  activeJobCount = 0,
  onRetry,
  retrying = false,
  className = '',
}: AiGenerationFormProps) {
  const [error, setError] = useState('')

  const [topics, setTopics] = useState<string[]>([])
  const [topicInput, setTopicInput] = useState('')
  const [difficulty, setDifficulty] = useState('普及')
  const [additionalInfo, setAdditionalInfo] = useState('')

  // 防误触冷却
  const cooldownUntilRef = useRef(0)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [cooldown, setCooldown] = useState(0)

  // 提交时把当前模型 ID 同步到 localStorage（与顶部 AiModelPicker 持久化保持一致）
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    }
  }, [])

  const triggerCooldown = () => {
    cooldownUntilRef.current = Date.now() + DEBOUNCE_MS
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntilRef.current - Date.now()) / 1000))
      setCooldown(remaining)
      if (remaining <= 0 && cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current)
        cooldownTimerRef.current = null
      }
    }
    tick()
    cooldownTimerRef.current = setInterval(tick, 250)
  }

  const toggleTopic = (t: string) => {
    setTopics(prev => {
      if (prev.includes(t)) return prev.filter(x => x !== t)
      return [...prev, t]
    })
  }

  const addCustomTopic = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    setTopics(prev => {
      if (prev.includes(t)) return prev
      return [...prev, t]
    })
  }

  const removeTopic = (t: string) => {
    setTopics(prev => prev.filter(x => x !== t))
  }

  const handleSubmit = async () => {
    if (Date.now() < cooldownUntilRef.current) return
    if (topics.length === 0) {
      setError('请至少选择 1 个题目主题')
      return
    }
    if (!defaultModelId) {
      setError('请先在顶部选择 AI 模型')
      return
    }
    setError('')
    try {
      localStorage.setItem(LAST_MODEL_KEY, defaultModelId)
    } catch {
      // localStorage 不可用时静默忽略
    }
    triggerCooldown()
    try {
      await onSubmit({
        mode: 'parametric',
        type: 'programming',
        difficulty,
        topic: topics,
        additionalInfo: additionalInfo.trim() || undefined,
        modelId: defaultModelId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败')
    }
  }

  return (
    <div className={`space-y-5 ${className}`}>
      {/* 主题选择（多选，覆盖 TOPICS 全集 + 手动输入） */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
          <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
          题目主题 <span className="text-error">*</span>
          <span className="text-xs text-muted-foreground font-normal ml-1">
            （可多选 · 已选 {topics.length} / {TOPICS.length}）
          </span>
        </label>

        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomTopic(topicInput)
                setTopicInput('')
              }
            }}
            placeholder="输入主题后回车添加（标准名或自定义词均可）"
            className="input flex-1"
          />
          <button
            type="button"
            onClick={() => {
              addCustomTopic(topicInput)
              setTopicInput('')
            }}
            disabled={!topicInput.trim()}
            className="btn btn-secondary px-3 flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            添加
          </button>
        </div>

        {topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 p-2 rounded-lg border border-dashed border-border bg-muted">
            {topics.map(t => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary text-white"
              >
                {t}
                {TOPICS.includes(t as any) && (
                  <span className="text-[10px] opacity-70">预设</span>
                )}
                <button
                  type="button"
                  onClick={() => removeTopic(t)}
                  className="hover:bg-white/20 rounded-full p-0.5 -mr-1"
                  title="移除"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-border bg-card/50 p-3 space-y-2.5">
          {TOPIC_GROUPS.map(group => (
            <div key={group.label} className="flex items-start gap-2">
              <span className="text-xs font-medium text-muted-foreground w-16 flex-shrink-0 pt-1">
                {group.label}
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {group.topics.map(t => {
                  const active = topics.includes(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTopic(t)}
                      className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                        active
                          ? 'bg-primary text-white border-primary'
                          : 'bg-muted hover:bg-muted border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 难度选择 */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
          <Target className="w-3.5 h-3.5 text-muted-foreground" />
          目标难度
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DIFFICULTIES.map(d => {
            const active = difficulty === d
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`p-2.5 rounded-lg text-center text-sm transition-colors border ${
                  active
                    ? 'bg-primary text-white border-primary'
                    : 'bg-muted hover:bg-muted border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {d}
              </button>
            )
          })}
        </div>
        <details className="mt-2 text-xs group">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1 list-none">
            <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
            难度说明（{difficulty}）
          </summary>
          <div className="mt-2 p-2 rounded bg-muted text-muted-foreground">
            {getDifficultyHint(difficulty)}
          </div>
        </details>
      </div>

      {/* 多选主题提示：多选即综合题 */}
      {topics.length > 1 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <p className="text-xs text-primary flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" />
            已选 {topics.length} 个主题，将生成一道融合多知识点的综合题目
          </p>
        </div>
      )}

      {/* 附加要求：背景故事 / 元素（不影响算法核心） */}
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          附加要求 <span className="text-xs text-muted-foreground font-normal">（可选 · 背景故事 / 元素）</span>
        </label>
        <textarea
          value={additionalInfo}
          onChange={(e) => {
            setAdditionalInfo(e.target.value)
            // auto-resize：根据内容自动调整高度，彻底避免出现滚动条
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
          }}
          placeholder={getAdditionalPlaceholder()}
          className="input min-h-[80px] resize-none overflow-hidden"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          AI 会把这些背景故事或元素自然地融入题目描述，但不会改变核心算法与数据范围
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm animate-fade-in">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || topics.length === 0 || !defaultModelId || cooldown > 0}
        className="btn btn-primary w-full flex items-center justify-center gap-2 relative overflow-hidden group"
      >
        <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        {cooldown > 0 ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            请稍候（{cooldown}s）
          </>
        ) : activeJobCount > 0 ? (
          <>
            <Wand2 className="w-5 h-5" />
            再生成一道（{activeJobCount} 个进行中）
          </>
        ) : (
          <>
            <Wand2 className="w-5 h-5" />
            开始生成
          </>
        )}
      </button>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="btn btn-ghost w-full text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
          title="重试上次失败任务（自动降低温度提高稳定性）"
        >
          {retrying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              重试中...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              重试上次失败任务
            </>
          )}
        </button>
      )}
    </div>
  )
}

export default AiGenerationForm
