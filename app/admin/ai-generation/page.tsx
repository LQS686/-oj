'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import {
  Loader2, FileText, Check, CheckCircle, AlertCircle, AlertTriangle,
  XCircle, Copy, RefreshCw, Settings, Cpu, History, X, ChevronDown, ChevronUp,
  Wand2, Rocket, Target, Lightbulb, Brain,
  Hash, ChevronRight
} from 'lucide-react'
import Link from 'next/link'
import { DIFFICULTIES, DIFFICULTY_COLORS } from '@/lib/constants'

interface AIModel {
  id: string
  name: string
  model: string
  providerId: string
  type: string
  maxTokens: number
  temperature: number
  isActive: boolean
  provider?: { name: string; slug: string }
}

interface GenerationResult {
  title: string
  description: string
  difficulty: string
  tags: string[]
  inputFormat: string
  outputFormat: string
  samples: Array<{ input: string; output: string; explanation?: string }>
  hints: string[]
  testCases?: Array<{ input: string; output: string }>
}

interface LogResult {
  problems?: Array<{
    title?: string
    description?: string
    difficulty?: string
    tags?: string[]
    input?: string
    output?: string
    samples?: Array<{ input: string; output: string; explanation?: string }>
    hint?: string
    test_cases?: Array<{ input: string; output: string }>
  }>
  testCases?: Array<{ input: string; output: string }>
  thought?: string
  qualityIssues?: Array<{ problemIndex: number; reason: string; details?: string[] }>
}

interface LogParams { topic?: string[]; title?: string }
interface LogStatus {
  id: string
  status: string
  result?: LogResult
  error?: string
  tokensUsed?: number
  createdAt: string
  params?: LogParams
}

const LAST_MODEL_KEY = 'ai-last-model-id'

/** 快速主题 chip（点击填入主题输入框） */
const QUICK_TOPICS = [
  { label: '动态规划', icon: '🧠' },
  { label: '图论',     icon: '🕸️' },
  { label: '最短路',   icon: '🛣️' },
  { label: '二分',     icon: '🎯' },
  { label: '字符串',   icon: '📝' },
  { label: '贪心',     icon: '💰' },
  { label: 'DFS/BFS',  icon: '🌲' },
  { label: '数据结构', icon: '🗂️' }
]

function getDifficultyHint(d: string): string {
  const map: Record<string, string> = {
    '入门': '基础语法与简单逻辑：变量、循环、数组遍历、字符串基础。时间 1000-1500ms，内存 64-128MB。',
    '普及-': '简单算法：桶排序、二分、前缀和、简单递推。时间 1000-2000ms，内存 128-256MB。',
    '普及': '标准算法：DP、BFS/DFS、贪心、基础图论。时间 1000-2500ms，内存 128-256MB。',
    '普及+': '复杂 DP、图论、数据结构：区间 DP、状压 DP、LCA、并查集、单调栈、线段树。时间 1500-3000ms，内存 256-512MB。',
    '提高': '高级算法：树链剖分、莫队、FFT、SAM、网络流、点分治。时间 1500-3000ms，内存 256-512MB。',
    '提高+': '省选级别：后缀自动机、LCT、生成函数、多项式、数论分块、杜教筛、线性基。时间 2000-4000ms，内存 256-512MB。',
    '省选': '省选难度：李超树、动态 DP、K-D Tree、矩阵树定理、圆方树、字符串哈希、随机化。时间 2000-5000ms，内存 512-1024MB。',
    'NOI': 'NOI 级别：计算几何、线性规划、博弈论、启发式搜索、分块、随机化算法。时间 3000-8000ms，内存 512-1024MB。'
  }
  return map[d] || '请按此档位对应的算法难度生成。'
}

function getAdditionalPlaceholder(d: string): string {
  if (['入门', '普及-'].includes(d)) return '例如：单源最短路径、DP 入门、二分查找基础...'
  if (['普及', '普及+'].includes(d)) return '例如：图论（BFS/DFS）、区间 DP、并查集、单调栈...'
  if (['提高', '提高+'].includes(d)) return '例如：树链剖分、莫队、FFT、SAM、生成函数...'
  return '例如：李超树、动态 DP、K-D Tree、计算几何、博弈论...'
}

/** 当前工作流步骤（1 配置 2 生成 3 发布） */
function getWorkflowStep(loading: boolean, result: GenerationResult | null, publishing: number | null): 1 | 2 | 3 {
  if (publishing !== null) return 3
  if (loading) return 2
  if (result) return 3
  return 1
}

export default function AIGenerationPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [copied, setCopied] = useState(false)

  const [models, setModels] = useState<AIModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [loadingModels, setLoadingModels] = useState(true)

  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('普及')
  const [count, setCount] = useState(1)
  const [additionalInfo, setAdditionalInfo] = useState('')

  const [pollingLogId, setPollingLogId] = useState<string | null>(null)
  const [thought, setThought] = useState<string | null>(null)

  const [logs, setLogs] = useState<LogStatus[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [selectedLog, setSelectedLog] = useState<LogStatus | null>(null)
  const [qualityIssues, setQualityIssues] = useState<Array<{ problemIndex: number; reason: string; details?: string[] }>>([])
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null)

  const [publishing, setPublishing] = useState<number | null>(null)
  const [publishStep, setPublishStep] = useState<number>(0)
  const [publishResult, setPublishResult] = useState<{
    problemId?: string
    attempts: number
    success: true | 'partial' | false
    warning?: string
    error?: string
    judgeResult?: { status: string; passed: number; total: number; message?: string }
  } | null>(null)

  useEffect(() => { fetchModels(); fetchLogs() }, [])

  useEffect(() => {
    if (logs.length > 0) {
      const STUCK_TIMEOUT_MS = 10 * 60 * 1000
      const now = Date.now()
      const pendingLog = logs.find(l => {
        if (l.status !== 'PENDING' && l.status !== 'PROCESSING') return false
        const age = now - new Date(l.createdAt).getTime()
        return age < STUCK_TIMEOUT_MS
      })
      const stuckLog = logs.find(l => {
        if (l.status !== 'PENDING' && l.status !== 'PROCESSING') return false
        const age = now - new Date(l.createdAt).getTime()
        return age >= STUCK_TIMEOUT_MS
      })
      if (stuckLog) {
        logger.warn('[ai-generation] 检测到僵尸日志，已超时', { logId: stuckLog.id, ageMinutes: Math.round((now - new Date(stuckLog.createdAt).getTime()) / 60000) })
      }
      if (pendingLog && !pollingLogId) {
        setPollingLogId(pendingLog.id)
        setLoading(true)
      }
    }
  }, [logs, pollingLogId])

  const fetchModels = async () => {
    try {
      const response = await fetchWithAuth(`/api/admin/ai/models?_t=${Date.now()}`)
      const data = await response.json()
      if (data.success) {
        const activeModels = data.data.filter((m: AIModel) => m.isActive)
        setModels(activeModels)
        const lastModelId = localStorage.getItem(LAST_MODEL_KEY)
        if (lastModelId && activeModels.some((m: AIModel) => m.id === lastModelId)) {
          setSelectedModelId(lastModelId)
        } else if (activeModels.length > 0) {
          setSelectedModelId(activeModels[0].id)
        } else {
          localStorage.removeItem(LAST_MODEL_KEY)
          setSelectedModelId('')
        }
      }
    } catch (error) {
      logger.error('获取模型列表失败', error)
    } finally {
      setLoadingModels(false)
    }
  }

  const fetchLogs = async () => {
    try {
      const response = await fetchWithAuth('/api/admin/ai/generate')
      const data = await response.json()
      if (data.success) setLogs(data.data || [])
    } catch (error) {
      logger.error('获取生成记录失败', error)
    }
  }

  const pollLogStatus = useCallback(async (logId: string) => {
    try {
      const response = await fetchWithAuth(`/api/admin/ai/generate?logId=${logId}`)
      const data = await response.json()
      if (data.success && data.data) {
        const log: LogStatus = data.data
        if (log.status === 'COMPLETED') {
          setPollingLogId(null)
          setLoading(false)
          fetchLogs()
          if (log.result?.problems?.[0]) {
            const p = log.result.problems[0]
            setResult({
              title: p.title || '',
              description: p.description || '',
              difficulty: p.difficulty || difficulty,
              tags: p.tags || [],
              inputFormat: p.input || '',
              outputFormat: p.output || '',
              samples: p.samples || [],
              hints: p.hint ? [p.hint] : [],
              testCases: p.test_cases || []
            })
          } else if (log.result?.testCases) {
            setResult({
              title: '测试数据生成完成',
              description: `已生成 ${log.result.testCases.length} 组测试数据`,
              difficulty,
              tags: [],
              inputFormat: '',
              outputFormat: '',
              samples: [],
              hints: [],
              testCases: log.result.testCases
            })
          }
          if (log.result?.thought) setThought(log.result.thought)
          setQualityIssues(log.result?.qualityIssues || [])
        } else if (log.status === 'FAILED') {
          setPollingLogId(null)
          setLoading(false)
          fetchLogs()
          setError(log.error || '生成失败')
        }
      }
    } catch (err) {
      logger.error('轮询状态失败', err)
    }
  }, [difficulty])

  useEffect(() => {
    if (pollingLogId) {
      const interval = setInterval(() => pollLogStatus(pollingLogId), 2000)
      return () => clearInterval(interval)
    }
  }, [pollingLogId, pollLogStatus])

  const handleCancelPolling = () => {
    if (!pollingLogId) return
    if (!confirm('确定要取消当前等待吗？\n\n后端任务可能仍在运行（无法强制终止），但 UI 不再等待。')) return
    setPollingLogId(null)
    setLoading(false)
    setError('已取消轮询。如需继续，可手动到"生成记录"中找到该日志点"重试"')
  }

  const handleGenerate = async () => {
    if (!topic.trim()) { setError('请输入题目主题'); return }
    if (!selectedModelId) { setError('请选择 AI 模型'); return }
    setLoading(true)
    setError('')
    setResult(null)
    setThought(null)
    setPublishResult(null)
    localStorage.setItem(LAST_MODEL_KEY, selectedModelId)
    try {
      const response = await fetchWithAuth('/api/admin/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'parametric',
          type: 'programming',
          difficulty,
          topic: [topic.trim()],
          count: Math.min(count, 3),
          additionalInfo: additionalInfo.trim() || undefined,
          modelId: selectedModelId
        })
      })
      const data = await response.json()
      if (data.success) {
        setPollingLogId(data.data.logId)
        fetchLogs()
      } else {
        setLoading(false)
        setError(data.error || '生成失败')
      }
    } catch {
      setLoading(false)
      setError('网络错误')
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveAndPublish = async () => {
    if (!result) return
    if (!selectedModelId) { setError('请先选择 AI 模型'); return }
    setPublishing(0)
    setPublishStep(1)
    setError('')
    setPublishResult(null)
    try {
      setPublishStep(2)
      await new Promise(r => setTimeout(r, 1500))
      setPublishStep(3)
      await new Promise(r => setTimeout(r, 1500))
      const response = await fetchWithAuth('/api/admin/ai/save-and-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problems: [result],
          logId: pollingLogId,
          modelId: selectedModelId
        })
      })
      const data = await response.json()
      if (data.success && data.data?.results?.[0]) {
        const r = data.data.results[0]
        if (r.attempts > 0) {
          setPublishStep(4)
          await new Promise(r => setTimeout(r, 1000))
          setPublishStep(5)
          await new Promise(r => setTimeout(r, 1000))
        }
        setPublishStep(6)
        setPublishResult({
          problemId: r.problemId,
          attempts: r.attempts,
          success: r.success,
          warning: r.warning,
          error: r.error,
          judgeResult: r.judgeResult
        })
      } else {
        setError(data.error || '自动发布失败')
        setPublishResult({ attempts: 0, success: false, error: data.error || '自动发布失败' })
      }
    } catch (err) {
      logger.error('自动发布失败', err)
      setError('网络错误')
      setPublishResult({ attempts: 0, success: false, error: '网络错误' })
    } finally {
      setPublishing(null)
    }
  }

  const handleSaveAsDraft = async () => {
    if (!result) return
    setError('')
    try {
      const response = await fetchWithAuth('/api/admin/ai/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problems: [result], logId: pollingLogId })
      })
      const data = await response.json()
      if (data.success) setError('已保存为草稿（未公开）')
      else setError(data.error || '保存草稿失败')
    } catch {
      setError('网络错误')
    }
  }

  const handleSelectLog = async (log: LogStatus) => {
    setSelectedLog(log)
    if (log.status === 'COMPLETED' && log.result) {
      if (log.result.problems?.[0]) {
        const p = log.result.problems[0]
        setResult({
          title: p.title || '',
          description: p.description || '',
          difficulty: p.difficulty || '入门',
          tags: p.tags || [],
          inputFormat: p.input || '',
          outputFormat: p.output || '',
          samples: p.samples || [],
          hints: p.hint ? [p.hint] : [],
          testCases: p.test_cases || []
        })
      }
      if (log.result.thought) setThought(log.result.thought)
      setQualityIssues(log.result.qualityIssues || [])
    }
  }

  const handleRetryLog = async (log: LogStatus, e: React.MouseEvent) => {
    e.stopPropagation()
    if (retryingLogId) return
    if (!confirm(`确定要重试该失败记录吗？\n\n主题：${log.params?.topic?.[0] || log.params?.title || '未知'}\n错误：${log.error || '(无)'}\n\n重试时会自动降低温度以提高稳定性。`)) return
    setRetryingLogId(log.id)
    try {
      const response = await fetchWithAuth('/api/admin/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retryFromLogId: log.id, reduceTemperature: true })
      })
      const data = await response.json()
      if (data.success) {
        await fetchLogs()
        if (data.data?.logId) {
          setPollingLogId(data.data.logId)
          setLoading(true)
          setError('')
          setResult(null)
        }
      } else {
        alert(`重试失败：${data.error || '未知错误'}`)
      }
    } catch (err) {
      logger.error('重试请求失败', err)
      alert('重试请求失败，请查看控制台')
    } finally {
      setRetryingLogId(null)
    }
  }

  const STUCK_TIMEOUT_MS = 10 * 60 * 1000
  const getStatusBadge = (status: string, createdAt?: string) => {
    if ((status === 'PENDING' || status === 'PROCESSING') && createdAt) {
      const age = Date.now() - new Date(createdAt).getTime()
      if (age > STUCK_TIMEOUT_MS) {
        return <span className="px-2 py-0.5 rounded text-xs bg-error/10 text-error flex items-center gap-1">⏱️ 超时</span>
      }
    }
    switch (status) {
      case 'PENDING':   return <span className="px-2 py-0.5 rounded text-xs bg-accent/10 text-accent">等待中</span>
      case 'PROCESSING':return <span className="px-2 py-0.5 rounded text-xs bg-info/10 text-info flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />处理中</span>
      case 'COMPLETED': return <span className="px-2 py-0.5 rounded text-xs bg-secondary/10 text-secondary">已完成</span>
      case 'FAILED':    return <span className="px-2 py-0.5 rounded text-xs bg-error/5 text-error">失败</span>
      default:          return <span className="px-2 py-0.5 rounded text-xs bg-muted/500/20 text-muted-foreground">{status}</span>
    }
  }

  const getDifficultyColor = (diff: string) => {
    const color = DIFFICULTY_COLORS[diff]
    if (color) {
      const [textColor, bgColor] = color.split(' ')
      return `tag ${bgColor.replace('/10', '/20')} ${textColor}`
    }
    return 'tag'
  }

  const selectedModel = models.find(m => m.id === selectedModelId)
  const currentStep = getWorkflowStep(loading, result, publishing)

  if (loadingModels) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-muted-foreground">加载模型配置...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {models.length === 0 && (
          <div className="card p-4 border-warning/15 bg-warning/5">
            <div className="flex items-center gap-3">
              <Cpu className="w-5 h-5 text-warning" />
              <div className="flex-1">
                <p className="text-warning font-medium">尚未配置 AI 模型</p>
                <p className="text-sm text-muted-foreground">请先配置 AI 服务商和模型才能使用出题功能</p>
              </div>
              <Link href="/admin/ai-models" className="btn btn-primary flex items-center gap-2">
                <Settings className="w-4 h-4" />
                前往配置
              </Link>
            </div>
          </div>
        )}

        {/* ============ 页面标题（与其他 admin 页一致） ============ */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI 智能出题</h1>
            <p className="text-sm text-muted-foreground mt-1">使用 AI 自动生成题目内容，验证通过后自动发布到题库</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="btn btn-ghost flex items-center gap-2 text-sm"
            >
              <History className="w-4 h-4" />
              生成记录
              {logs.length > 0 && <span className="text-xs text-muted-foreground">({logs.length})</span>}
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button
              onClick={() => fetchLogs()}
              className="btn btn-ghost text-xs flex items-center gap-1"
              title="手动刷新生成记录"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ============ 工作流步骤条 ============ */}
        <div className="card-static p-4">
          <div className="flex items-center justify-between">
            {[
              { step: 1, label: '配置参数', icon: Settings, desc: '模型 / 主题 / 难度' },
              { step: 2, label: 'AI 生成', icon: Wand2,    desc: '后台运行可切换页面' },
              { step: 3, label: '自动发布', icon: Rocket,  desc: '验证通过即公开' }
            ].map(({ step, label, icon: Icon, desc }, idx, arr) => {
              const isActive = currentStep === step
              const isCompleted = currentStep > step
              return (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-primary text-white'
                        : isCompleted
                          ? 'bg-secondary text-white'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                    </div>
                    <div className="hidden sm:block">
                      <div className={`text-sm font-medium ${isActive || isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {label}
                      </div>
                      <div className="text-xs text-muted-foreground">{desc}</div>
                    </div>
                  </div>
                  {idx < arr.length - 1 && (
                    <div className={`flex-1 mx-3 h-0.5 rounded-full transition-colors ${
                      isCompleted ? 'bg-secondary' : 'bg-muted/40'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {showHistory && (
          <div className="card p-4 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-foreground flex items-center gap-2">
                <History className="w-4 h-4" />
                最近生成记录
                {logs.length > 0 && <span className="text-xs text-muted-foreground">（共 {logs.length} 条）</span>}
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 rounded hover:bg-white/10 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {logs.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>暂无生成记录</p>
                <p className="text-xs mt-1">点击"开始生成"后，记录会显示在这里</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {logs.map(log => (
                  <div
                    key={log.id}
                    onClick={() => handleSelectLog(log)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedLog?.id === log.id
                        ? 'bg-primary/20 border border-primary/30'
                        : 'bg-muted/40 hover:bg-muted/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusBadge(log.status, log.createdAt)}
                        <span className="text-sm text-foreground">
                          {log.params?.topic?.[0] || log.params?.title || '未知主题'}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    {log.error && <p className="text-xs text-error mt-1">{log.error}</p>}
                    {log.tokensUsed && <p className="text-xs text-muted-foreground mt-1">消耗 {log.tokensUsed} tokens</p>}
                    {(log.status === 'FAILED' || (log.status === 'PENDING' || log.status === 'PROCESSING') && Date.now() - new Date(log.createdAt).getTime() > STUCK_TIMEOUT_MS) && (
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={(e) => handleRetryLog(log, e)}
                          disabled={retryingLogId !== null}
                          className="btn btn-ghost text-xs flex items-center gap-1 px-2 py-1 disabled:opacity-50"
                          title="重试该失败记录（自动降低温度提高稳定性）"
                        >
                          {retryingLogId === log.id ? (
                            <><Loader2 className="w-3 h-3 animate-spin" />重试中...</>
                          ) : (
                            <><RefreshCw className="w-3 h-3" />重试（降温度）</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ 主体两栏 ============ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ---------- 左：配置卡 ---------- */}
          <div className="lg:col-span-2 card-static p-6">
            <h2 className="text-base font-semibold text-foreground mb-5">配置参数</h2>

            <div className="space-y-5">
              {/* AI 模型选择 */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
                  <Cpu className="w-3.5 h-3.5 text-primary" />
                  AI 模型 <span className="text-error">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="input flex-1"
                    disabled={models.length === 0}
                  >
                    {models.length === 0 ? (
                      <option value="">暂无可用模型</option>
                    ) : (
                      models.map(model => {
                        const caps: string[] = []
                        if (model.type === 'thinking') caps.push('🧠 思考')
                        caps.push(`📏 ${model.maxTokens}`)
                        caps.push(`🌡️ T=${model.temperature}`)
                        return (
                          <option key={model.id} value={model.id}>
                            {model.name} ({model.provider?.name || '未知'}) · {caps.join(' · ')}
                          </option>
                        )
                      })
                    )}
                  </select>
                  <Link
                    href="/admin/ai-models"
                    className="btn btn-ghost flex items-center gap-1 px-3"
                    title="管理模型"
                  >
                    <Settings className="w-4 h-4" />
                  </Link>
                </div>
                {selectedModel && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="tag tag-primary text-xs">
                      {selectedModel.model}
                    </span>
                    <span className={`tag text-xs ${selectedModel.type === 'thinking' ? 'tag-warning' : 'tag-info'}`}>
                      {selectedModel.type === 'thinking' ? '🧠 思考模型' : '⚡ 生成模型'}
                    </span>
                    <span className="tag text-xs">📏 {selectedModel.maxTokens}</span>
                  </div>
                )}
              </div>

              {/* 主题输入 */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
                  <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
                  题目主题 <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例如：动态规划、最短路径、二分查找..."
                  className="input"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_TOPICS.map(t => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => setTopic(t.label)}
                      className="px-2.5 py-1 rounded text-xs border border-border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span className="mr-1">{t.icon}</span>{t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 难度选择 */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
                  <Target className="w-3.5 h-3.5 text-muted-foreground" />
                  目标难度
                </label>
                <div className="grid grid-cols-4 gap-2">
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
                            : 'bg-muted/30 hover:bg-muted border-border text-muted-foreground hover:text-foreground'
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
                  <div className="mt-2 p-2 rounded bg-muted/40 text-muted-foreground">
                    {getDifficultyHint(difficulty)}
                  </div>
                </details>
              </div>

              {/* 数量 */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
                  <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                  生成数量
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n)}
                      className={`p-2.5 rounded-lg text-sm transition-colors border ${
                        count === n
                          ? 'bg-primary text-white border-primary'
                          : 'bg-muted/30 hover:bg-muted border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {n} 道
                    </button>
                  ))}
                </div>
              </div>

              {/* 附加要求 */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  附加要求 <span className="text-xs text-muted-foreground font-normal">（可选）</span>
                </label>
                <textarea
                  value={additionalInfo}
                  onChange={(e) => setAdditionalInfo(e.target.value)}
                  placeholder={getAdditionalPlaceholder(difficulty)}
                  className="input min-h-[80px] resize-y"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm animate-fade-in">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={loading || !topic.trim() || !selectedModelId}
                className="btn btn-primary w-full flex items-center justify-center gap-2 relative overflow-hidden group"
              >
                {/* 流光效果 */}
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />生成中...</>
                ) : (
                  <><Wand2 className="w-5 h-5" />开始生成</>
                )}
              </button>
            </div>
          </div>

          {/* ---------- 右：结果卡 ---------- */}
          <div className="lg:col-span-3 card-static p-6 min-h-[600px] flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-foreground">生成结果</h2>
              {result && (
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  className="btn btn-ghost text-sm flex items-center gap-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  重新生成
                </button>
              )}
            </div>

            {/* 空状态 */}
            {!result && !loading && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Brain className="w-8 h-8 text-primary-light" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">等待 AI 创作</h3>
                  <p className="text-sm text-muted-foreground mb-1">在左侧填写参数后点击"开始生成"</p>
                  <p className="text-xs text-muted-foreground">AI 将为您生成完整的题目内容</p>
                </div>
              </div>
            )}

            {/* 加载态 */}
            {loading && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
                  <p className="text-foreground font-medium">AI 正在生成题目...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    使用 {selectedModel?.name || 'AI 模型'} · 思考中
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">您可以切换到其他页面，生成会在后台继续</p>
                  <button
                    onClick={handleCancelPolling}
                    className="btn btn-ghost text-xs mt-4 text-muted-foreground"
                  >
                    卡住了？取消轮询
                  </button>
                </div>
              </div>
            )}

            {/* 结果展示 */}
            {result && !loading && (
              <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-1">
                {/* 标题 + 复制 */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">题目名称</p>
                      <h3 className="text-xl font-bold text-foreground">{result.title}</h3>
                    </div>
                    <button
                      onClick={() => handleCopy(result.title)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="复制标题"
                    >
                      {copied ? <CheckCircle className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* 难度 + 标签 */}
                  <div className="flex items-center gap-2 flex-wrap mt-3">
                    <span className={`tag ${getDifficultyColor(result.difficulty)}`}>
                      {result.difficulty}
                    </span>
                    {result.tags.map((tag, idx) => (
                      <span key={idx} className="tag">{tag}</span>
                    ))}
                  </div>
                </div>

                {/* 题目描述 */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">题目描述</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">
                    {result.description}
                  </p>
                </div>

                {/* 样例 */}
                {result.samples && result.samples.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">样例（{result.samples.length}）</p>
                    <div className="space-y-2">
                      {result.samples.slice(0, 2).map((sample, idx) => (
                        <div key={idx} className="grid grid-cols-2 gap-2">
                          <div className="bg-muted/40 rounded-lg p-2">
                            <p className="text-xs text-muted-foreground mb-1">输入</p>
                            <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">
                              {sample.input?.slice(0, 200)}{sample.input?.length > 200 ? '...' : ''}
                            </pre>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2">
                            <p className="text-xs text-muted-foreground mb-1">输出</p>
                            <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">
                              {sample.output?.slice(0, 200)}{sample.output?.length > 200 ? '...' : ''}
                            </pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {thought && (
                  <details className="bg-muted/40 rounded-lg p-3">
                    <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                      AI 思考过程
                    </summary>
                    <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed">
                      {thought.slice(0, 800)}{thought.length > 800 ? '...' : ''}
                    </p>
                  </details>
                )}

                {qualityIssues.length > 0 && (
                  <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
                    <p className="text-sm font-medium text-warning flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      质量自检发现 {qualityIssues.length} 个提示
                    </p>
                    <ul className="text-xs text-warning/80 mt-2 space-y-1">
                      {qualityIssues.map((q, i) => (
                        <li key={i}>• 题目 #{q.problemIndex + 1}：{q.reason}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-warning/60 mt-2">提示：仍可继续导入到题库</p>
                  </div>
                )}

                {/* 发布按钮 + 进度 */}
                <div className="pt-4 border-t border-border space-y-3">
                  <button
                    onClick={handleSaveAndPublish}
                    disabled={publishing !== null || !result || !selectedModelId}
                    className="btn btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {publishing !== null ? (
                      <><Loader2 className="w-5 h-5 animate-spin" />发布中...</>
                    ) : (
                      <><Rocket className="w-5 h-5" />创建并自动发布</>
                    )}
                  </button>

                  {/* 发布进度 - 时间线样式 */}
                  {publishing !== null && (
                    <div className="bg-muted/40 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-sm font-medium text-foreground">正在自动发布...</span>
                      </div>
                      <div className="space-y-2">
                        {[
                          { step: 1, label: '保存题目到数据库' },
                          { step: 2, label: '编译标程' },
                          { step: 3, label: '运行测试数据' },
                          { step: 4, label: 'AI 修正标程（如果需要）' },
                          { step: 5, label: '重新验证' },
                          { step: 6, label: '公开到题库' }
                        ].map(({ step, label }) => {
                          const done = publishStep > step
                          const active = publishStep === step
                          return (
                            <div key={step} className="flex items-center gap-2 text-sm">
                              {done ? (
                                <Check className="w-4 h-4 text-secondary" />
                              ) : active ? (
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-muted" />
                              )}
                              <span className={publishStep >= step ? 'text-foreground' : 'text-muted-foreground'}>
                                {label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* 发布结果 - 4 种状态 */}
                  {publishResult !== null && (
                    <div className={`rounded-lg p-4 space-y-3 ${
                      publishResult.success === true && publishResult.attempts === 0
                        ? 'bg-secondary/10 border border-secondary/30'
                        : publishResult.success === true && publishResult.attempts > 0
                          ? 'bg-warning/10 border border-warning/30'
                          : publishResult.success === 'partial'
                            ? 'bg-accent/10 border border-accent/30'
                            : 'bg-error/10 border border-error/30'
                    }`}>
                      <div className="flex items-center gap-2">
                        {publishResult.success === true && publishResult.attempts === 0 && (
                          <>
                            <CheckCircle className="w-5 h-5 text-secondary" />
                            <span className="text-sm font-medium text-secondary">已自动公开到题库（首次验证通过）</span>
                          </>
                        )}
                        {publishResult.success === true && publishResult.attempts > 0 && (
                          <>
                            <CheckCircle className="w-5 h-5 text-warning" />
                            <span className="text-sm font-medium text-warning">已自动公开（AI 修正 {publishResult.attempts} 次后通过）</span>
                          </>
                        )}
                        {publishResult.success === 'partial' && (
                          <>
                            <AlertTriangle className="w-5 h-5 text-accent" />
                            <span className="text-sm font-medium text-accent">已自动入库，但标程未通过验证</span>
                          </>
                        )}
                        {publishResult.success === false && (
                          <>
                            <XCircle className="w-5 h-5 text-error" />
                            <span className="text-sm font-medium text-error">自动发布失败</span>
                          </>
                        )}
                      </div>

                      {publishResult.judgeResult && (
                        <p className="text-xs text-muted-foreground">
                          评测状态：<span className="text-foreground">{publishResult.judgeResult.status}</span>
                          {' · '}通过 {publishResult.judgeResult.passed} / {publishResult.judgeResult.total}
                          {publishResult.judgeResult.message && ` · ${publishResult.judgeResult.message}`}
                        </p>
                      )}

                      {publishResult.success === 'partial' && (
                        <p className="text-xs text-accent/80">题目已公开，但标程未经验证，请在题解中手动添加正确代码</p>
                      )}
                      {publishResult.error && <p className="text-xs text-error/80">错误：{publishResult.error}</p>}

                      <div className="flex flex-wrap gap-2">
                        {publishResult.success === true && publishResult.problemId && (
                          <>
                            <button
                              onClick={() => window.open(`/problem/${publishResult.problemId}`, '_blank')}
                              className="btn btn-primary text-sm flex items-center gap-1.5"
                            >
                              <FileText className="w-4 h-4" />
                              查看题目
                            </button>
                            <button
                              onClick={() => window.open(`/problem/${publishResult.problemId}#solutions`, '_blank')}
                              className="btn btn-ghost text-sm"
                            >
                              查看题解
                            </button>
                          </>
                        )}
                        {publishResult.success === 'partial' && publishResult.problemId && (
                          <button
                            onClick={() => window.open(`/problem/${publishResult.problemId}`, '_blank')}
                            className="btn btn-primary text-sm flex items-center gap-1.5"
                          >
                            <FileText className="w-4 h-4" />
                            查看题目
                          </button>
                        )}
                        {publishResult.success === false && (
                          <button
                            onClick={handleSaveAsDraft}
                            className="btn btn-ghost text-sm flex items-center gap-1.5"
                          >
                            <FileText className="w-4 h-4" />
                            保留为草稿
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============ 使用流程 ============ */}
        <div className="card-static p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">使用流程</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { num: 1, icon: Settings,  title: '选择模型', desc: '选择已配置的 AI 模型' },
              { num: 2, icon: Lightbulb, title: '输入主题', desc: '描述题目类型与要求' },
              { num: 3, icon: Wand2,     title: '后台运行', desc: '可切换页面继续生成' },
              { num: 4, icon: Rocket,    title: '自动发布', desc: '验证通过即公开' }
            ].map(({ num, icon: Icon, title, desc }) => (
              <div key={num} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
