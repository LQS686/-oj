'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { Sparkles, Send, Loader2, FileText, CheckCircle, AlertCircle, Copy, RefreshCw, Settings, Cpu, Clock, Hash, History, X, ChevronDown, ChevronUp } from 'lucide-react'
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
}

interface LogStatus {
  id: string
  status: string
  result?: any
  error?: string
  tokensUsed?: number
  createdAt: string
  params?: any
}

const LAST_MODEL_KEY = 'ai-last-model-id'

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
  
  const [pollingLogId, setPollingLogId] = useState<string | null>(null)
  const [thought, setThought] = useState<string | null>(null)
  
  const [logs, setLogs] = useState<LogStatus[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [selectedLog, setSelectedLog] = useState<LogStatus | null>(null)

  useEffect(() => {
    fetchModels()
    fetchLogs()
  }, [])

  useEffect(() => {
    if (pollingLogId) {
      const interval = setInterval(() => pollLogStatus(pollingLogId), 2000)
      return () => clearInterval(interval)
    }
  }, [pollingLogId])

  useEffect(() => {
    if (logs.length > 0) {
      const pendingLog = logs.find(l => l.status === 'PENDING' || l.status === 'PROCESSING')
      if (pendingLog && !pollingLogId) {
        setPollingLogId(pendingLog.id)
        setLoading(true)
      }
    }
  }, [logs])

  const fetchModels = async () => {
    try {
      const response = await fetchWithAuth('/api/admin/ai/models')
      const data = await response.json()
      if (data.success) {
        const activeModels = data.data.filter((m: AIModel) => m.isActive)
        setModels(activeModels)
        
        const lastModelId = localStorage.getItem(LAST_MODEL_KEY)
        if (lastModelId && activeModels.some((m: AIModel) => m.id === lastModelId)) {
          setSelectedModelId(lastModelId)
        } else if (activeModels.length > 0) {
          setSelectedModelId(activeModels[0].id)
        }
      }
    } catch (error) {
      console.error('获取模型列表失败:', error)
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
      console.error('获取生成记录失败:', error)
    }
  }

  const pollLogStatus = async (logId: string) => {
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
              difficulty: difficulty,
              tags: [],
              inputFormat: '',
              outputFormat: '',
              samples: [],
              hints: [],
              testCases: log.result.testCases
            })
          }
          
          if (log.result?.thought) {
            setThought(log.result.thought)
          }
        } else if (log.status === 'FAILED') {
          setPollingLogId(null)
          setLoading(false)
          fetchLogs()
          setError(log.error || '生成失败')
        }
      }
    } catch (err) {
      console.error('轮询状态失败:', err)
    }
  }

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
    } catch (err) {
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
          testCases: p.test_cases || []
        })
      }
      if (log.result.thought) {
        setThought(log.result.thought)
      }
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
                      models.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name} ({model.provider?.name || '未知服务商'}) - {model.type === 'thinking' ? '思考模型' : '生成模型'}
                        </option>
                      ))
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
                  <p className="text-xs text-muted-foreground mt-1">
                    模型ID: {selectedModel.model} | 类型: {selectedModel.type === 'thinking' ? '思考模型' : '生成模型'} | 最大Tokens: {selectedModel.maxTokens}
                  </p>
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
                  placeholder="例如：需要包含图论算法、数据范围在10^5以内..."
                  className="input min-h-[80px]"
                />
              </div>

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
