'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { Sparkles, Loader2, FileText, CheckCircle, AlertCircle, Copy, RefreshCw, Settings, Cpu, History, X, ChevronDown, ChevronUp } from 'lucide-react'
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
  provider?: {
    name: string
    slug: string
  }
}

interface GenerationResult {
  title: string
  description: string
  difficulty: string
  tags: string[]
  inputFormat: string
  outputFormat: string
  samples: Array<{
    input: string
    output: string
    explanation?: string
  }>
  hints: string[]
  testCases?: Array<{
    input: string
    output: string
  }>
  // AI 生成的标程（拆分流程的第二步需要喂给 test_data 模式）
  solutionCpp?: string
  solutionPython?: string
  // 推荐的时间/内存限制
  timeLimit?: number
  memoryLimit?: number
}

interface LogResult {
  problems?: Array<{
    title?: string
    description?: string
    difficulty?: string
    tags?: string[]
    input?: string
    output?: string
    samples?: Array<{
      input: string
      output: string
      explanation?: string
    }>
    hint?: string
    test_cases?: Array<{
      input: string
      output: string
    }>
    solution_cpp?: string
    solution_python?: string
    time_limit?: number
    memory_limit?: number
  }>
  testCases?: Array<{
    input: string
    output: string
  }>
  thought?: string
  qualityIssues?: Array<{ problemIndex: number; reason: string; details?: string[] }>
}

interface LogParams {
  topic?: string[]
  title?: string
}

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

/** 根据 difficulty 返回该档位算法典型 + 时空约束说明（用于前端折叠区） */
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

/** 附加要求占位文案：根据 difficulty 给出符合该档位的示例 */
function getAdditionalPlaceholder(d: string): string {
  if (['入门', '普及-'].includes(d)) {
    return '例如：单源最短路径、DP 入门、二分查找基础...'
  }
  if (['普及', '普及+'].includes(d)) {
    return '例如：图论（BFS/DFS）、区间 DP、并查集、单调栈...'
  }
  if (['提高', '提高+'].includes(d)) {
    return '例如：树链剖分、莫队、FFT、SAM、生成函数...'
  }
  return '例如：李超树、动态 DP、K-D Tree、计算几何、博弈论...'
}

export default function AIGenerationPage() {
  const router = useRouter()
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
  const [skipTestCases, setSkipTestCases] = useState(true) // 默认：拆分生成，描述与测试数据分两步
  
  const [pollingLogId, setPollingLogId] = useState<string | null>(null)
  const [thought, setThought] = useState<string | null>(null)

  const [logs, setLogs] = useState<LogStatus[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [selectedLog, setSelectedLog] = useState<LogStatus | null>(null)
  const [qualityIssues, setQualityIssues] = useState<Array<{ problemIndex: number; reason: string; details?: string[] }>>([])
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null)

  useEffect(() => {
    fetchModels()
    fetchLogs()
  }, [])

  useEffect(() => {
    if (logs.length > 0) {
      const pendingLog = logs.find(l => l.status === 'PENDING' || l.status === 'PROCESSING')
      if (pendingLog && !pollingLogId) {
        setPollingLogId(pendingLog.id)
        setLoading(true)
      }
    }
  }, [logs, pollingLogId])

  const fetchModels = async () => {
    try {
      // 加 _t 戳避免 Next.js/浏览器 fetch 缓存导致看不到清理后的最新数据
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
          // 数据库干净时清掉残留的 localStorage 偏好，避免下次又"记住"已删除的 id
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
      if (data.success) {
        setLogs(data.data || [])
      }
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
              testCases: p.test_cases || [],
              // 拆分流程：保存标程代码，第二步 test_data 模式要用
              solutionCpp: p.solution_cpp,
              solutionPython: p.solution_python,
              timeLimit: p.time_limit,
              memoryLimit: p.memory_limit
            })
          } else if (log.result?.testCases) {
            // test_data 模式：合并到已有的 result（保留题目描述），若无已有 result 则单独立
            const newTestCases = log.result.testCases
            setResult(prev => prev ? {
              ...prev,
              testCases: newTestCases
            } : {
              title: '测试数据生成完成',
              description: `已生成 ${newTestCases.length} 组测试数据`,
              difficulty: difficulty,
              tags: [],
              inputFormat: '',
              outputFormat: '',
              samples: [],
              hints: [],
              testCases: newTestCases
            })
          }

          if (log.result?.thought) {
            setThought(log.result.thought)
          }

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

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('请输入题目主题')
      return
    }

    if (!selectedModelId) {
      setError('请选择 AI 模型')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)
    setThought(null)

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
          modelId: selectedModelId,
          // 拆分生成：第一阶段不生成测试数据（用户可在结果卡片上"补全测试数据"）
          skipTestCases
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

  /**
   * 第二步：为已生成的题目描述补全测试数据
   * 复用 test_data 模式（用 description / input / output 喂给 AI 生成 15 组）
   * 标程：优先用第一阶段 AI 生成的 solution_cpp（或 solution_python），让 test_data 模式走 hasSolution=true 路径
   */
  const handleGenerateTestCases = async () => {
    if (!result) return
    if (!selectedModelId) {
      setError('请先选择 AI 模型')
      return
    }
    setLoading(true)
    setError('')
    setThought(null)

    // 选一个最合适的标程：优先 C++（性能稳定），其次 Python
    // 都没有时，test_data 模式走 hasSolution=false 路径（output 必须是真实结果）
    const solutionCode = result.solutionCpp || result.solutionPython || ''
    const solutionLanguage = result.solutionCpp ? 'cpp' : (result.solutionPython ? 'python' : undefined)

    try {
      const response = await fetchWithAuth('/api/admin/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'test_data',
          title: result.title,
          description: result.description,
          inputDescription: result.inputFormat,
          outputDescription: result.outputFormat,
          count: 15,
          modelId: selectedModelId,
          // 后端标程改为可选；只在有标程时才传
          ...(solutionCode ? { solutionCode, solutionLanguage } : {})
        })
      })
      const data = await response.json()
      if (data.success) {
        setPollingLogId(data.data.logId)
        fetchLogs()
      } else {
        setLoading(false)
        setError(data.error || '生成测试数据失败')
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

  const handleCreateProblem = () => {
    if (!result) return
    const encoded = encodeURIComponent(JSON.stringify(result))
    router.push(`/admin/problems/create?ai=${encoded}`)
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
          testCases: p.test_cases || [],
          solutionCpp: p.solution_cpp,
          solutionPython: p.solution_python,
          timeLimit: p.time_limit,
          memoryLimit: p.memory_limit
        })
      }
      if (log.result.thought) {
        setThought(log.result.thought)
      }
      setQualityIssues(log.result.qualityIssues || [])
    }
  }

  /**
   * 重试失败日志：
   *   - 后端会基于原参数重新创建一条 PENDING 日志，加入队列
   *   - generator 内部：_retry=true 标志 + 解析失败时温度梯度（0.2 → 0.0）重试 1-2 次
   *   - 重试时默认 reduceTemperature=true，让模型输出更稳定
   */
  const handleRetryLog = async (log: LogStatus, e: React.MouseEvent) => {
    e.stopPropagation() // 防止冒泡触发 handleSelectLog
    if (retryingLogId) return
    if (!confirm(`确定要重试该失败记录吗？\n\n主题：${log.params?.topic?.[0] || log.params?.title || '未知'}\n错误：${log.error || '(无)'}\n\n重试时会自动降低温度以提高稳定性。`)) {
      return
    }
    setRetryingLogId(log.id)
    try {
      const response = await fetchWithAuth('/api/admin/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retryFromLogId: log.id,
          reduceTemperature: true
        })
      })
      const data = await response.json()
      if (data.success) {
        // 立即刷新日志列表，新的 PENDING 日志会出现
        await fetchLogs()
        // 启动轮询等结果
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2 py-0.5 rounded text-xs bg-accent/10 text-accent">等待中</span>
      case 'PROCESSING':
        return <span className="px-2 py-0.5 rounded text-xs bg-info/10 text-info flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />处理中</span>
      case 'COMPLETED':
        return <span className="px-2 py-0.5 rounded text-xs bg-secondary/10 text-secondary">已完成</span>
      case 'FAILED':
        return <span className="px-2 py-0.5 rounded text-xs bg-error/5 text-error">失败</span>
      default:
        return <span className="px-2 py-0.5 rounded text-xs bg-muted/500/20 text-muted-foreground">{status}</span>
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
              <Link
                href="/admin/ai-models"
                className="btn btn-primary flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                前往配置
              </Link>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)' }}>
              <Sparkles className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">AI 智能出题</h1>
              <p className="text-sm text-muted-foreground">使用 AI 自动生成题目内容</p>
            </div>
          </div>
          
          {logs.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="btn btn-ghost flex items-center gap-2"
            >
              <History className="w-4 h-4" />
              生成记录
              {logs.filter(l => l.status === 'PENDING' || l.status === 'PROCESSING').length > 0 && (
                <span className="w-2 h-2 rounded-full bg-secondary/100 animate-pulse"></span>
              )}
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>

        {showHistory && logs.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-foreground">最近生成记录</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 rounded hover:bg-white/10 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
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
                      {getStatusBadge(log.status)}
                      <span className="text-sm text-foreground">
                        {log.params?.topic?.[0] || log.params?.title || '未知主题'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  {log.error && (
                    <p className="text-xs text-error mt-1">{log.error}</p>
                  )}
                  {log.tokensUsed && (
                    <p className="text-xs text-muted-foreground mt-1">消耗 {log.tokensUsed} tokens</p>
                  )}
                  {/* 失败日志：加重试按钮（带降温度） */}
                  {log.status === 'FAILED' && (
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={(e) => handleRetryLog(log, e)}
                        disabled={retryingLogId !== null}
                        className="btn btn-ghost text-xs flex items-center gap-1 px-2 py-1 disabled:opacity-50"
                        title="重试该失败记录（自动降低温度提高稳定性）"
                      >
                        {retryingLogId === log.id ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            重试中...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3" />
                            重试（降温度）
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h2 className="text-lg font-bold text-foreground mb-4">生成设置</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
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
                        // 能力标签：支持思考 / maxTokens / 温度
                        const caps: string[] = []
                        if (model.type === 'thinking') caps.push('🧠 思考')
                        caps.push(`📏 ${model.maxTokens}`)
                        caps.push(`🌡️ T=${model.temperature}`)
                        return (
                          <option key={model.id} value={model.id}>
                            {model.name} ({model.provider?.name || '未知服务商'}) - {model.type === 'thinking' ? '思考模型' : '生成模型'} · {caps.join(' · ')}
                          </option>
                        )
                      })
                    )}
                  </select>
                  <Link
                    href="/admin/ai-models"
                    className="btn btn-ghost flex items-center gap-1"
                    title="管理模型"
                  >
                    <Settings className="w-4 h-4" />
                  </Link>
                </div>
                {selectedModel && (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      模型ID: {selectedModel.model} | 类型: {selectedModel.type === 'thinking' ? '思考模型' : '生成模型'} | 最大Tokens: {selectedModel.maxTokens}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  题目主题 <span className="text-error">*</span>
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例如：动态规划、最短路径、二分查找..."
                  className="input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    目标难度
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="input"
                  >
                    {DIFFICULTIES.map(diff => (
                      <option key={diff} value={diff}>{diff}</option>
                    ))}
                  </select>
                  {/* 难度说明折叠区：悬停可见当前档位算法典型与时空约束 */}
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      💡 难度说明（{difficulty}）
                    </summary>
                    <div className="mt-2 p-2 rounded bg-muted/40 text-muted-foreground">
                      {getDifficultyHint(difficulty)}
                    </div>
                  </details>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    生成数量
                  </label>
                  <select
                    value={count}
                    onChange={(e) => setCount(parseInt(e.target.value))}
                    className="input"
                  >
                    <option value={1}>1 道</option>
                    <option value={2}>2 道</option>
                    <option value={3}>3 道</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  附加要求 (可选)
                </label>
                <textarea
                  value={additionalInfo}
                  onChange={(e) => setAdditionalInfo(e.target.value)}
                  placeholder={getAdditionalPlaceholder(difficulty)}
                  className="input min-h-[80px]"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={skipTestCases}
                  onChange={(e) => setSkipTestCases(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-foreground">仅生成题目描述（测试数据稍后单独生成）</span>
              </label>
              <p className="text-xs text-muted-foreground -mt-3 ml-6">
                推荐开启：分两步生成，单次 prompt 体积小、JSON 解析更稳；可在结果卡片上点击"补全测试数据"继续。
              </p>

              {error && (
                <div className="flex items-center gap-2 text-error text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={loading || !topic.trim() || !selectedModelId}
                className="btn btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    开始生成
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">生成结果</h2>
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

            {!result && !loading && (
              <div className="text-center py-12 text-muted-foreground">
                <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>输入主题并点击"开始生成"</p>
                <p className="text-sm mt-2">AI 将为您生成完整的题目内容</p>
              </div>
            )}

            {loading && (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
                <p className="text-muted-foreground">AI 正在生成题目...</p>
                <p className="text-sm text-muted-foreground mt-2">您可以切换到其他页面，生成会在后台继续</p>
              </div>
            )}

            {result && !loading && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-muted-foreground">题目名称</span>
                    <button
                      onClick={() => handleCopy(result.title)}
                      className="text-xs text-primary-light hover:text-foreground"
                    >
                      {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-foreground font-medium">{result.title}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`tag ${getDifficultyColor(result.difficulty)}`}>
                    {result.difficulty}
                  </span>
                  {result.tags.map((tag, idx) => (
                    <span key={idx} className="tag">{tag}</span>
                  ))}
                </div>

                <div>
                  <span className="text-sm text-muted-foreground">题目描述</span>
                  <p className="text-foreground mt-1 text-sm line-clamp-4">{result.description}</p>
                </div>

                {result.samples && result.samples.length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">样例</span>
                    <div className="mt-2 space-y-2">
                      {result.samples.slice(0, 2).map((sample, idx) => (
                        <div key={idx} className="grid grid-cols-2 gap-2">
                          <div className="bg-muted/40 rounded-lg p-2">
                            <p className="text-xs text-muted-foreground mb-1">输入</p>
                            <pre className="text-xs text-foreground whitespace-pre-wrap overflow-hidden">{sample.input?.slice(0, 100)}{sample.input?.length > 100 ? '...' : ''}</pre>
                          </div>
                          <div className="bg-muted/40 rounded-lg p-2">
                            <p className="text-xs text-muted-foreground mb-1">输出</p>
                            <pre className="text-xs text-foreground whitespace-pre-wrap overflow-hidden">{sample.output?.slice(0, 100)}{sample.output?.length > 100 ? '...' : ''}</pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {thought && (
                  <details className="bg-muted/40 rounded-lg p-3">
                    <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                      思考过程
                    </summary>
                    <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{thought.slice(0, 500)}...</p>
                  </details>
                )}

                {/* 测试数据补全：未生成时提示 + 一键补全按钮（仅题目描述已生成但 testCases 为空时显示） */}
                {(!result.testCases || result.testCases.length === 0) && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-sm text-blue-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      题目描述已生成，尚未生成测试数据
                    </p>
                    <button
                      onClick={handleGenerateTestCases}
                      disabled={loading}
                      className="btn btn-primary text-sm mt-2 flex items-center gap-1.5"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          补全测试数据（15 组）
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* 质量自检问题（黄色 chip 提示，不阻塞导入） */}
                {qualityIssues.length > 0 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <p className="text-sm font-medium text-yellow-300 flex items-center gap-1.5">
                      ⚠️ 质量自检发现 {qualityIssues.length} 个提示
                    </p>
                    <ul className="text-xs text-yellow-200/80 mt-2 space-y-1">
                      {qualityIssues.map((q, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-yellow-400">•</span>
                          <span>题目 #{q.problemIndex + 1}：{q.reason}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-yellow-200/60 mt-2">提示：仍可继续导入到题库，如需更严格的结果请重新生成。</p>
                  </div>
                )}

                <div className="pt-4 border-t border-border">
                  <button
                    onClick={handleCreateProblem}
                    className="btn btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    创建此题目
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-bold text-foreground mb-4">使用说明</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted/40">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/20 mb-3">
                <span className="text-primary-light font-bold">1</span>
              </div>
              <h3 className="text-foreground font-medium mb-1">选择模型</h3>
              <p className="text-sm text-muted-foreground">选择要使用的 AI 模型</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/20 mb-3">
                <span className="text-primary-light font-bold">2</span>
              </div>
              <h3 className="text-foreground font-medium mb-1">输入主题</h3>
              <p className="text-sm text-muted-foreground">描述题目类型和要求</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/20 mb-3">
                <span className="text-primary-light font-bold">3</span>
              </div>
              <h3 className="text-foreground font-medium mb-1">后台运行</h3>
              <p className="text-sm text-muted-foreground">可切换页面，生成继续</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/40">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/20 mb-3">
                <span className="text-primary-light font-bold">4</span>
              </div>
              <h3 className="text-foreground font-medium mb-1">审核发布</h3>
              <p className="text-sm text-muted-foreground">检查后创建题目</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
