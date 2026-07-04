'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import {
 Loader2, FileText, Check, CheckCircle, AlertCircle, AlertTriangle,
 XCircle, Copy, RefreshCw, Settings, Cpu, History, X, ChevronDown, ChevronUp,
 Wand2, Target, Lightbulb, Brain, Plus,
 ChevronRight
} from 'lucide-react'
import Link from 'next/link'
import { DIFFICULTIES, DIFFICULTY_COLORS } from '@/lib/constants'
import { TOPICS } from '@/lib/ai/prompts/core/types'

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

/**
 * 并发生成：每个任务独立追踪状态
 * 业务决策（2026-06）：单次 AI 调用固定 1 道题，但用户可同时提交多个任务
 */
interface JobState {
 logId: string
 status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
 startedAt: number
 intervalId?: ReturnType<typeof setInterval>
 // 仅在 COMPLETED 后填充
 result?: GenerationResult
 thought?: string | null
 qualityIssues?: Array<{ problemIndex: number; reason: string; details?: string[] }>
 // 仅在 FAILED 后填充
 error?: string
 // 重试用：保存原始 params 以便 retry 重用
 retryFromLogId?: string
}

const LAST_MODEL_KEY = 'ai-last-model-id'

/**
 * 主题分组（仅用于 UI 排版，方便从 ~50 个主题里快速找到目标）
 * 实际可选值仍以 TOPICS 全集为准；分组不影响 prompt 与后端传参
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
 { label: '高级/特殊', topics: ['位运算', '构造', '随机化', '莫队', '分块', 'CDQ 分治', 'K-D Tree', '李超树'] }
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

function getAdditionalPlaceholder(): string {
 return '例如：以校园生活为背景融入剧情、以三国历史为线索加入角色与故事、加入"外卖配送"生活场景...（AI 会把这些背景故事或元素自然地融入题目描述，但不影响算法核心）'
}

/** 当前工作流步骤（1 配置 2 生成；只要有 active 任务就算第 2 步） */
function getWorkflowStep(hasActiveJobs: boolean): 1 | 2 {
 return hasActiveJobs ? 2 : 1
}

export default function AIGenerationPage() {
 const [error, setError] = useState('')
 const [copied, setCopied] = useState(false)

 const [models, setModels] = useState<AIModel[]>([])
 const [selectedModelId, setSelectedModelId] = useState('')
 const [loadingModels, setLoadingModels] = useState(true)

 // 题目主题（多选），覆盖 TOPICS 全集；多选时 AI 会把多个主题融合到一道题里
 const [topics, setTopics] = useState<string[]>([])
 // 手动输入主题的输入框
 const [topicInput, setTopicInput] = useState('')
 const [difficulty, setDifficulty] = useState('普及')
 // 业务决策（2026-06）：单次生成固定 1 道题，count 选择器已移除
 // 附加要求：背景故事 / 元素（不影响算法核心）
 const [additionalInfo, setAdditionalInfo] = useState('')

 // 并发生成：每个任务独立追踪（Map: logId -> JobState）
 const [activeJobs, setActiveJobs] = useState<Map<string, JobState>>(new Map())

 const [logs, setLogs] = useState<LogStatus[]>([])
 const [showHistory, setShowHistory] = useState(false)
 const [selectedLog, setSelectedLog] = useState<LogStatus | null>(null)
 const [retryingLogId, setRetryingLogId] = useState<string | null>(null)

 // 每秒更新一次时间戳，驱动"生成中 · Ns"重新渲染
 const [now, setNow] = useState(Date.now())

 // 提交任务计数器（用于显示 N 个进行中）
 const submittingRef = useRef(false)

 // 防误触：单次点击后冷却 DEBOUNCE_MS 毫秒，期间按钮禁用，避免双击/连击浪费 AI 资源
 const DEBOUNCE_MS = 1500
 const cooldownUntilRef = useRef(0)
 const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
 const [cooldown, setCooldown] = useState(0)

 /** 启动冷却倒计时（点击提交后立即调用） */
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

 useEffect(() => { fetchModels(); fetchLogs() }, [])

 // 卸载时清理冷却计时器
 useEffect(() => {
 return () => {
 if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
 }
 }, [])

 // 有任务在跑时，每秒推进 now 以刷新"生成中 · Ns"计时
 useEffect(() => {
 if (activeJobs.size === 0) return
 const id = setInterval(() => setNow(Date.now()), 1000)
 return () => clearInterval(id)
 }, [activeJobs.size])

 const fetchModels = async () => {
 try {
 const response = await fetchWithAuth(`/api/admin/ai/models?_t=${Date.now()}`)
 const data = await response.json()
 if (data.success) {
 const rawList = Array.isArray(data.data?.items)
 ? data.data.items
 : Array.isArray(data.data)
 ? data.data
 : []
 const activeModels = rawList.filter((m: AIModel) => m.isActive)
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
 // 服务端已解开双层包装 → data.data 直接是数组
 const items = Array.isArray(data.data) ? data.data : []
 if (data.success) setLogs(items)
 else setLogs([])
 } catch (error) {
 logger.error('获取生成记录失败', error)
 setLogs([])
 }
 }

 const pollLogStatus = useCallback(async (logId: string) => {
 try {
 const response = await fetchWithAuth(`/api/admin/ai/generate?logId=${logId}`)
 const data = await response.json()
 if (!data.success || !data.data) return
 const log: LogStatus = data.data
 const job = activeJobsRef.current.get(logId)
 if (!job) return // 已被取消

 if (log.status === 'COMPLETED') {
 if (job.intervalId) clearInterval(job.intervalId)
 let result: GenerationResult | undefined
 let thought: string | null = null
 let qualityIssues: JobState['qualityIssues'] = []
 if (log.result?.problems?.[0]) {
 const p = log.result.problems[0]
 result = {
 title: p.title || '',
 description: p.description || '',
 difficulty: p.difficulty || difficulty,
 tags: p.tags || [],
 inputFormat: p.input || '',
 outputFormat: p.output || '',
 samples: p.samples || [],
 hints: p.hint ? [p.hint] : [],
 testCases: p.test_cases || []
 }
 } else if (log.result?.testCases) {
 result = {
 title: '测试数据生成完成',
 description: `已生成 ${log.result.testCases.length} 组测试数据`,
 difficulty,
 tags: [],
 inputFormat: '',
 outputFormat: '',
 samples: [],
 hints: [],
 testCases: log.result.testCases
 }
 }
 if (log.result?.thought) thought = log.result.thought
 qualityIssues = log.result?.qualityIssues || []
 setActiveJobs(prev => {
 const m = new Map(prev)
 const existing = m.get(logId)
 if (!existing) return m
 m.set(logId, { ...existing, status: 'COMPLETED', result, thought, qualityIssues, intervalId: undefined })
 return m
 })
 fetchLogs()
 } else if (log.status === 'FAILED') {
 if (job.intervalId) clearInterval(job.intervalId)
 setActiveJobs(prev => {
 const m = new Map(prev)
 const existing = m.get(logId)
 if (!existing) return m
 m.set(logId, { ...existing, status: 'FAILED', error: log.error || '生成失败', intervalId: undefined })
 return m
 })
 fetchLogs()
 }
 } catch (err) {
 logger.error('轮询状态失败', err)
 }
 }, [difficulty])

 // 用 ref 持有 activeJobs 引用，避免 pollLogStatus 因 activeJobs 变化重新创建
 // （重新创建会导致 setInterval 回调拿到旧引用，从而清不掉 interval）
 const activeJobsRef = useRef(activeJobs)
 useEffect(() => { activeJobsRef.current = activeJobs }, [activeJobs])

 // 组件卸载时清理所有 interval
 useEffect(() => {
 return () => {
 activeJobsRef.current.forEach((j: JobState) => {
 if (j.intervalId) clearInterval(j.intervalId)
 })
 }
 }, [])

 // 页面不可见时暂停所有轮询，可见时恢复（避免后台标签页持续消耗 API 限流配额）
 useEffect(() => {
 const onVisibilityChange = () => {
 const visible = document.visibilityState === 'visible'
 activeJobsRef.current.forEach((j: JobState) => {
 if (j.status !== 'PROCESSING') return
 if (visible) {
 // 恢复轮询（若已存在 intervalId 不重复启动）
 if (j.intervalId) return
 const intervalId = setInterval(() => pollLogStatus(j.logId), 2000)
 setActiveJobs(prev => {
 const m = new Map(prev)
 const existing = m.get(j.logId)
 if (existing) m.set(j.logId, { ...existing, intervalId })
 return m
 })
 } else {
 // 暂停轮询
 if (j.intervalId) {
 clearInterval(j.intervalId)
 setActiveJobs(prev => {
 const m = new Map(prev)
 const existing = m.get(j.logId)
 if (existing) m.set(j.logId, { ...existing, intervalId: undefined })
 return m
 })
 }
 }
 })
 }
 document.addEventListener('visibilitychange', onVisibilityChange)
 return () => document.removeEventListener('visibilitychange', onVisibilityChange)
 }, [pollLogStatus])

 // 业务决策（2026-06）：恢复 PROCESSING 状态的孤儿日志，自动加入 activeJobs 继续轮询
 // （用户切走页面再切回时，会自动接管仍在运行的后台任务）
 useEffect(() => {
 if (logs.length === 0) return
 const STUCK_TIMEOUT_MS = 10 * 60 * 1000
 const now = Date.now()
 for (const l of logs) {
 if (l.status !== 'PENDING' && l.status !== 'PROCESSING') continue
 const age = now - new Date(l.createdAt).getTime()
 if (age >= STUCK_TIMEOUT_MS) {
 logger.warn('[ai-generation] 检测到僵尸日志，已超时', { logId: l.id, ageMinutes: Math.round(age / 60000) })
 continue
 }
 if (!activeJobsRef.current.has(l.id)) {
 const intervalId = setInterval(() => pollLogStatus(l.id), 2000)
 setActiveJobs(prev => {
 const m = new Map(prev)
 m.set(l.id, {
 logId: l.id,
 status: 'PROCESSING',
 startedAt: new Date(l.createdAt).getTime(),
 intervalId
 })
 return m
 })
 }
 }
 }, [logs, pollLogStatus])

 // 启动新任务：提交 + 加入 activeJobs + 启动独立 setInterval
 const startJob = async (body: Record<string, any>, retryFromLogId?: string) => {
 // 防误触冷却：上次点击未到 DEBOUNCE_MS 毫秒，丢弃本次请求（避免双击/连击浪费 AI 资源）
 if (Date.now() < cooldownUntilRef.current) return
 if (submittingRef.current) return
 submittingRef.current = true
 triggerCooldown() // 立即开始冷却，无论后续请求成功或失败
 setError('')
 try {
 const response = await fetchWithAuth('/api/admin/ai/generate', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(body)
 })
 const data = await response.json()
 if (data.success) {
 const logId: string = data.data.logId
 const intervalId = setInterval(() => pollLogStatus(logId), 2000)
 const newJob: JobState = {
 logId,
 status: 'PROCESSING',
 startedAt: Date.now(),
 intervalId,
 retryFromLogId
 }
 setActiveJobs(prev => {
 const m = new Map(prev)
 m.set(logId, newJob)
 return m
 })
 fetchLogs()
 } else {
 setError(data.error || '生成失败')
 }
 } catch {
 setError('网络错误')
 } finally {
 submittingRef.current = false
 }
 }

 // 取消单个任务：清 interval + 从 activeJobs 移除
 const cancelJob = (logId: string) => {
 const job = activeJobsRef.current.get(logId)
 if (!job) return
 if (!confirm('确定要取消此任务？\n\n后端任务可能仍在运行（无法强制终止），但 UI 不再等待。')) return
 if (job.intervalId) clearInterval(job.intervalId)
 setActiveJobs(prev => {
 const m = new Map(prev)
 m.delete(logId)
 return m
 })
 }

 // 移除已完成/已失败任务（仅 UI 清理）
 const dismissJob = (logId: string) => {
 setActiveJobs(prev => {
 const m = new Map(prev)
 m.delete(logId)
 return m
 })
 }

 // 主题多选：点击 chip 切换选中状态
 const toggleTopic = (t: string) => {
 setTopics(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
 }

 // 手动添加主题：去空格、跳过空、跳过重复
 // 输入可以是 TOPICS 全集里的标准名，也可以是自定义词（如"三维 DP"）
 const addCustomTopic = (raw: string) => {
 const t = raw.trim()
 if (!t) return
 setTopics(prev => prev.includes(t) ? prev : [...prev, t])
 }

 // 移除主题（用于"已选"行的 × 按钮）
 const removeTopic = (t: string) => {
 setTopics(prev => prev.filter(x => x !== t))
 }

 // 主入口：开始生成（每次点击 = 1 个独立任务，可与已有任务并发）
 const handleGenerate = async () => {
 if (topics.length === 0) { setError('请至少选择 1 个题目主题'); return }
 if (!selectedModelId) { setError('请选择 AI 模型'); return }
 localStorage.setItem(LAST_MODEL_KEY, selectedModelId)
 await startJob({
 mode: 'parametric',
 type: 'programming',
 difficulty,
 topic: topics,
 // 业务决策（2026-06）：count 已硬编码为 1，前端不再传
 additionalInfo: additionalInfo.trim() || undefined,
 modelId: selectedModelId
 })
 }

 const handleCopy = (text: string) => {
 navigator.clipboard.writeText(text)
 setCopied(true)
 setTimeout(() => setCopied(false), 2000)
 }

 const handleSelectLog = (log: LogStatus) => {
 // 业务决策（2026-06）：选中历史日志时，仅打开 modal 展示；不复制到 activeJobs（避免与正在运行的任务混淆）
 setSelectedLog(log)
 }

 const handleRetryLog = async (log: LogStatus, e: React.MouseEvent) => {
 e.stopPropagation()
 if (retryingLogId) return
 const topicLabel = (log.params?.topic && log.params.topic.length > 0)
 ? log.params.topic.join('、')
 : (log.params?.title || '未知')
 if (!confirm(`确定要重试该失败记录吗？\n\n主题：${topicLabel}\n错误：${log.error || '(无)'}\n\n重试时会自动降低温度以提高稳定性。`)) return
 setRetryingLogId(log.id)
 try {
 // 业务决策（2026-06）：重试也走 startJob，加入 activeJobs 与其它任务并发
 await startJob({ retryFromLogId: log.id, reduceTemperature: true }, log.id)
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
 case 'PENDING': return <span className="px-2 py-0.5 rounded text-xs bg-accent/10 text-accent">等待中</span>
 case 'PROCESSING':return <span className="px-2 py-0.5 rounded text-xs bg-info/10 text-info flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />处理中</span>
 case 'COMPLETED': return <span className="px-2 py-0.5 rounded text-xs bg-secondary/10 text-secondary">已完成</span>
 case 'FAILED': return <span className="px-2 py-0.5 rounded text-xs bg-error/5 text-error">失败</span>
 default: return <span className="px-2 py-0.5 rounded text-xs bg-muted0/20 text-muted-foreground">{status}</span>
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
 const currentStep = getWorkflowStep(activeJobs.size > 0)

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
 <p className="text-sm text-muted-foreground mt-1">
 使用 AI 自动生成题目内容，生成完成后直接发布到公开题库
 <span className="mx-1.5">·</span>
 可多次点击「开始生成」并发生成多个独立任务，互不阻塞
 </p>
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
 { step: 2, label: 'AI 生成', icon: Wand2, desc: '完成后自动发布到公开题库' }
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
 isCompleted ? 'bg-secondary' : 'bg-muted'
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
 : 'bg-muted hover:bg-muted/60'
 }`}
 >
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 {getStatusBadge(log.status, log.createdAt)}
 <span className="text-sm text-foreground">
 {(log.params?.topic && log.params.topic.length > 0)
 ? log.params.topic.join('、')
 : (log.params?.title || '未知主题')}
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
 {selectedModel.name}
 </span>
 {selectedModel.name !== selectedModel.model && (
 <code className="tag text-xs font-mono">{selectedModel.model}</code>
 )}
 <span className={`tag text-xs ${selectedModel.type === 'thinking' ? 'tag-warning' : 'tag-info'}`}>
 {selectedModel.type === 'thinking' ? '🧠 思考模型' : '⚡ 生成模型'}
 </span>
 <span className="tag text-xs">📏 {selectedModel.maxTokens}</span>
 <span className="tag text-xs">🌡️ T={selectedModel.temperature}</span>
 {selectedModel.provider?.name && (
 <span className="tag text-xs">{selectedModel.provider.name}</span>
 )}
 </div>
 )}
 </div>

 {/* 主题选择（多选，覆盖 TOPICS 全集 + 手动输入） */}
 <div>
 <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
 <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
 题目主题 <span className="text-error">*</span>
 <span className="text-xs text-muted-foreground font-normal ml-1">
 （可多选 · 已选 {topics.length} / {TOPICS.length}）
 </span>
 </label>

 {/* 手动输入：可输入 TOPICS 全集里的标准名快速选中，也可输入自定义词 */}
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

 {/* 已选主题（预设 + 自定义），可点 × 移除 */}
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

 <div className="rounded-lg border border-border bg-card/50 p-3 max-h-64 overflow-y-auto custom-scrollbar space-y-2.5">
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

 {/* 数量 */}
 {/* 单题模式提示（业务决策 2026-06） */}
 <div className="rounded-lg border border-dashed border-border bg-muted px-3 py-2">
 <p className="text-xs text-muted-foreground">
 <span className="font-medium text-foreground">单次生成一道题</span>
 <span className="mx-1.5">·</span>
 <span>可多次点击「开始生成」并发生成多个独立任务，互不阻塞</span>
 </p>
 </div>

 {/* 附加要求：背景故事 / 元素（不影响算法核心） */}
 <div>
 <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
 <FileText className="w-3.5 h-3.5 text-muted-foreground" />
 附加要求 <span className="text-xs text-muted-foreground font-normal">（可选 · 背景故事 / 元素）</span>
 </label>
 <textarea
 value={additionalInfo}
 onChange={(e) => setAdditionalInfo(e.target.value)}
 placeholder={getAdditionalPlaceholder()}
 className="input min-h-[80px] resize-y"
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
 onClick={handleGenerate}
 disabled={submittingRef.current || topics.length === 0 || !selectedModelId || cooldown > 0}
 className="btn btn-primary w-full flex items-center justify-center gap-2 relative overflow-hidden group"
 >
 {/* 流光效果 */}
 <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
 {cooldown > 0 ? (
 <><Loader2 className="w-5 h-5 animate-spin" />请稍候（{cooldown}s）</>
 ) : activeJobs.size > 0 ? (
 <><Wand2 className="w-5 h-5" />再生成一道（{activeJobs.size} 个进行中）</>
 ) : (
 <><Wand2 className="w-5 h-5" />开始生成</>
 )}
 </button>
 </div>
 </div>

 {/* ---------- 右：结果卡（并发多任务） ---------- */}
 <div className="lg:col-span-3 card-static p-6 min-h-[600px] flex flex-col">
 <div className="flex items-center justify-between mb-5">
 <div>
 <h2 className="text-base font-semibold text-foreground">生成结果</h2>
 {activeJobs.size > 0 && (
 <p className="text-xs text-muted-foreground mt-0.5">
 {activeJobs.size} 个任务进行中
 </p>
 )}
 </div>
 </div>

 {/* 空状态：所有任务都已 dismiss */}
 {activeJobs.size === 0 && (
 <div className="flex-1 flex items-center justify-center">
 <div className="text-center max-w-md">
 <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
 <Brain className="w-8 h-8 text-primary-light" />
 </div>
 <h3 className="text-lg font-semibold text-foreground mb-2">等待 AI 创作</h3>
 <p className="text-sm text-muted-foreground mb-1">在左侧填写参数后点击"开始生成"</p>
 <p className="text-xs text-muted-foreground">单次生成一道题 · 可同时提交多个独立任务</p>
 </div>
 </div>
 )}

 {/* 多任务卡片堆叠 */}
 {activeJobs.size > 0 && (
 <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-1">
 {Array.from(activeJobs.values()).map(job => {
 const log = logs.find(l => l.id === job.logId)
 const elapsed = Math.floor((now - job.startedAt) / 1000)
 return (
 <div key={job.logId} className="border border-border rounded-xl overflow-hidden bg-card">
 {/* 卡片头：状态徽章 + 操作 */}
 <div className="px-4 py-2.5 border-b border-border bg-muted flex items-center justify-between">
 <div className="flex items-center gap-2">
 {job.status === 'PROCESSING' && (
 <>
 <Loader2 className="w-4 h-4 text-primary animate-spin" />
 <span className="text-sm font-medium text-foreground">生成中 · {elapsed}s</span>
 </>
 )}
 {job.status === 'COMPLETED' && (
 <>
 <CheckCircle className="w-4 h-4 text-secondary" />
 <span className="text-sm font-medium text-secondary">已生成并发布到公开题库</span>
 </>
 )}
 {job.status === 'FAILED' && (
 <>
 <XCircle className="w-4 h-4 text-error" />
 <span className="text-sm font-medium text-error">生成失败</span>
 </>
 )}
 </div>
 <div className="flex items-center gap-1">
 {job.status === 'PROCESSING' && (
 <button
 onClick={() => cancelJob(job.logId)}
 className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
 title="取消此任务"
 >
 <X className="w-4 h-4" />
 </button>
 )}
 {(job.status === 'COMPLETED' || job.status === 'FAILED') && (
 <button
 onClick={() => dismissJob(job.logId)}
 className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
 title="关闭此卡片"
 >
 <X className="w-4 h-4" />
 </button>
 )}
 </div>
 </div>

 {/* 卡片体：按状态分 */}
 <div className="p-4">
 {job.status === 'PROCESSING' && (
 <div className="space-y-2">
 <p className="text-sm text-foreground">
 {(log?.params?.topic && log.params.topic.length > 0) && (
 <span className="text-muted-foreground">主题：</span>
 )}
 {(log?.params?.topic && log.params.topic.length > 0)
 ? log.params.topic.join('、')
 : '（主题：未显示）'}
 </p>
 <p className="text-xs text-muted-foreground">
 使用 {selectedModel?.name || 'AI 模型'} · 思考中
 </p>
 <p className="text-xs text-muted-foreground">
 可继续点击"开始生成"提交新任务，本任务互不阻塞
 </p>
 </div>
 )}

 {job.status === 'COMPLETED' && job.result && (
 <div className="space-y-3">
 {/* 标题 + 复制 */}
 <div className="flex items-start justify-between gap-3">
 <div className="flex-1">
 <p className="text-xs text-muted-foreground mb-1">题目名称</p>
 <h3 className="text-lg font-bold text-foreground">{job.result.title}</h3>
 </div>
 <button
 onClick={() => handleCopy(job.result!.title)}
 className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
 title="复制标题"
 >
 {copied ? <CheckCircle className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
 </button>
 </div>
 {/* 难度 + 标签 */}
 <div className="flex items-center gap-2 flex-wrap">
 <span className={`tag ${getDifficultyColor(job.result.difficulty)}`}>
 {job.result.difficulty}
 </span>
 {job.result.tags.map((tag, idx) => (
 <span key={idx} className="tag">{tag}</span>
 ))}
 </div>
 {/* 描述（折叠） */}
 <details className="bg-muted rounded-lg p-3">
 <summary className="text-sm text-foreground cursor-pointer">题目描述</summary>
 <p className="text-xs text-muted-foreground mt-2 leading-relaxed whitespace-pre-wrap">
 {job.result.description.slice(0, 600)}{job.result.description.length > 600 ? '...' : ''}
 </p>
 </details>
 {/* 样例 */}
 {job.result.samples && job.result.samples.length > 0 && (
 <div>
 <p className="text-xs text-muted-foreground mb-2">样例（{job.result.samples.length}）</p>
 <div className="space-y-2">
 {job.result.samples.slice(0, 2).map((sample, idx) => (
 <div key={idx} className="grid grid-cols-2 gap-2">
 <div className="bg-muted rounded-lg p-2">
 <p className="text-xs text-muted-foreground mb-1">输入</p>
 <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">
 {sample.input?.slice(0, 200)}{sample.input?.length > 200 ? '...' : ''}
 </pre>
 </div>
 <div className="bg-muted rounded-lg p-2">
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
 {/* 思考过程 */}
 {job.thought && (
 <details className="bg-muted rounded-lg p-3">
 <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
 AI 思考过程
 </summary>
 <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap leading-relaxed">
 {job.thought.slice(0, 800)}{job.thought.length > 800 ? '...' : ''}
 </p>
 </details>
 )}
 {/* 质量自检 */}
 {job.qualityIssues && job.qualityIssues.length > 0 && (
 <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
 <p className="text-sm font-medium text-warning flex items-center gap-1.5">
 <AlertTriangle className="w-4 h-4" />
 质量自检发现 {job.qualityIssues.length} 个提示
 </p>
 <ul className="text-xs text-warning/80 mt-2 space-y-1">
 {job.qualityIssues.map((q, i) => (
 <li key={i}>• 题目 #{q.problemIndex + 1}：{q.reason}</li>
 ))}
 </ul>
 </div>
 )}
 {/* 在题库中查看 */}
 <div className="pt-3 border-t border-border flex flex-wrap gap-2">
 <button
 onClick={() => window.open('/admin/problems', '_blank')}
 className="btn btn-primary text-sm flex items-center gap-1.5"
 >
 <FileText className="w-4 h-4" />
 在题库中查看
 </button>
 </div>
 </div>
 )}

 {job.status === 'FAILED' && (
 <div className="space-y-2">
 <p className="text-sm text-error">{job.error || '生成失败'}</p>
 <button
 onClick={() => {
 const origLog = logs.find(l => l.id === job.retryFromLogId)
 if (origLog) handleRetryLog(origLog, { stopPropagation: () => {} } as React.MouseEvent)
 }}
 className="btn btn-ghost text-sm flex items-center gap-1.5"
 >
 <RefreshCw className="w-4 h-4" />
 重试
 </button>
 </div>
 )}
 </div>
 </div>
 )
 })}
 </div>
 )}
 </div>
 </div>

 {/* ============ 使用流程 ============ */}
 <div className="card-static p-6">
 <h2 className="text-base font-semibold text-foreground mb-4">使用流程</h2>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 {[
 { num: 1, icon: Settings, title: '选择模型', desc: '选择已配置的 AI 模型' },
 { num: 2, icon: Lightbulb, title: '输入主题', desc: '描述题目类型与要求' },
 { num: 3, icon: Wand2, title: '后台生成', desc: '完成后自动发布到公开题库' }
 ].map(({ num, icon: Icon, title, desc }) => (
 <div key={num} className="flex items-start gap-3 p-3 rounded-lg bg-muted">
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
