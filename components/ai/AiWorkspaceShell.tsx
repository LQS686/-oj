'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Cpu, Loader2, Settings, Sparkles, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { AiModelPicker } from './AiModelPicker'
import { AiCapabilitiesNav } from './AiCapabilitiesNav'
import { AiWorkspaceSidebar } from './AiWorkspaceSidebar'
import { TestDataGenerationForm } from './TestDataGenerationForm'
import { AiGenerationForm, type AiGenerationSubmitParams } from './AiGenerationForm'
import { AnalyzeForm } from './AnalyzeForm'
import { SuggestMetadataForm } from './SuggestMetadataForm'
import { SimilarProblemForm } from './SimilarProblemForm'
import type { AiCapability, AiTask } from '@/types/ai'

interface AiWorkspaceShellProps {
  /** 默认激活的 Tab id（默认 'generate'） */
  defaultTab?: string
  /** 默认关联的题目 ID（用于 test_data / analyze / suggest_metadata 等 Tab 预填） */
  defaultProblemId?: string
  /** 自定义内容（Phase 4 由路由壳传入实际表单 / 结果面板；不传则渲染默认占位） */
  children?: ReactNode
  /** 自定义 className */
  className?: string
}

const LAST_MODEL_KEY = 'ai-last-model-id'

/**
 * Tab id → AI 任务 mode 映射
 * 用于按当前激活的 Tab 拉取对应 mode 的任务历史
 * （右侧侧栏只显示当前功能的任务记录）
 */
const TAB_TO_MODE: Record<string, string> = {
  generate: 'parametric',
  test_data: 'test_data',
  analyze: 'analyze',
  suggest_metadata: 'suggest_metadata',
  similar: 'similar',
}

/**
 * AI 工作区容器组件
 *
 * 布局：
 * - 顶部：AiModelPicker（统一模型选择，所有 Tab 共享）
 * - 顶部：AiCapabilitiesNav（横向能力 Tab）
 * - 主体：children（由 Phase 4 路由壳传入对应的表单 / 结果面板）
 * - 右下角：AiTaskList（浮动任务列表，每 5s 轮询当前用户最近 10 条任务）
 *
 * URL query 参数同步：
 * - ?tab=xxx 切换激活 Tab
 * - ?problemId=xxx 预填关联题目（供 test_data / analyze 等 Tab 使用）
 * - 支持深链接（直接打开 ?tab=test_data&problemId=xxx 自动激活）
 *
 * 数据拉取：
 * - capabilities：拉取 /api/admin/ai/capabilities 一次性获取能力清单
 * - tasks：拉取 /api/admin/ai/generate（当前用户最近 10 条）每 5s 轮询
 */
export function AiWorkspaceShell({
  defaultTab = 'generate',
  defaultProblemId,
  children,
  className = '',
}: AiWorkspaceShellProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [capabilities, setCapabilities] = useState<AiCapability[]>([])
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(true)

  const [activeTab, setActiveTab] = useState<string>(searchParams.get('tab') || defaultTab)
  const [problemId, setProblemId] = useState<string>(
    searchParams.get('problemId') || defaultProblemId || ''
  )
  const [modelId, setModelId] = useState<string>('')

  const [tasks, setTasks] = useState<AiTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 右栏侧栏选中任务 ID（提交 / 重试 / 历史卡片点击时设置）
  // 提交成功后自动选中新建任务 → 右栏侧栏切换为详情视图，无需在工作区底部重复展示任务状态
  const [historySelectedId, setHistorySelectedId] = useState<string | null>(null)
  // 入库 / 丢弃后递增的版本号，传给 AiWorkspaceSidebar 用于清除 detailCache 强制重拉
  const [resultVersion, setResultVersion] = useState(0)

  // 右侧侧栏状态：'collapsed'（折叠）/ 'list'（列表视图）/ 'detail'（详情视图）
  // - 默认 'list'：侧栏以窄宽度显示历史记录列表
  // - 用户点击历史记录 → 'detail'：侧栏扩展为宽宽度
  // - 用户返回列表 → 'list'：侧栏收窄
  // - 用户点击折叠按钮 → 'collapsed'：侧栏完全隐藏，工作区占满
  const [sidebarMode, setSidebarMode] = useState<'collapsed' | 'list' | 'detail'>('list')

  // 出题表单提交中状态
  const [submittingGenerate, setSubmittingGenerate] = useState(false)

  /* ---------- generate Tab：提交 ----------
   * 提交后只刷新任务列表，进行中任务会出现在右栏顶部，不自动展开详情。
   */
  const handleSubmitGenerate = async (params: AiGenerationSubmitParams) => {
    setSubmittingGenerate(true)
    try {
      const res = await fetchWithCookie('/api/admin/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      const data = await res.json()
      if (data.success) {
        // 提交成功后立即刷新任务列表（启动列表轮询追踪新任务状态）
        fetchTasks()
      } else {
        throw new Error(data.error || '入队失败')
      }
    } finally {
      setSubmittingGenerate(false)
    }
  }

  /* ---------- 预览-确认操作（generate / similar 共用） ----------
   * 入库 / 丢弃后：
   * 1. toast 提示结果
   * 2. 刷新任务列表（列表卡片的状态徽章会更新）
   * 3. 递增 resultVersion → AiWorkspaceSidebar 内部清除该 taskId 的 detailCache，
   *    下次进入详情会重新拉取，确保 isPreview/committedAt 已是后端最新状态
   */
  const handleCommitPreview = async (logId: string) => {
    const res = await fetchWithCookie('/api/admin/ai/problems/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!data.success) {
      throw new Error(data.error || '入库失败')
    }
    toast.success(`入库成功（${data.data?.problemIds?.length || 0} 题）`)
    setResultVersion(v => v + 1)
    fetchTasks()
  }
  const handleDiscardPreview = async (logId: string) => {
    const res = await fetchWithCookie('/api/admin/ai/problems/discard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!data.success) {
      throw new Error(data.error || '丢弃失败')
    }
    toast.success('已丢弃预览题目')
    setResultVersion(v => v + 1)
    fetchTasks()
  }

  /* ---------- 能力清单（一次性拉取，不依赖 activeTab，避免切换时重复请求） ---------- */
  const fetchCapabilities = useCallback(async () => {
    try {
      setCapabilitiesLoading(true)
      const res = await fetchWithCookie('/api/admin/ai/capabilities')
      const data = await res.json()
      if (data.success) {
        const caps: AiCapability[] = Array.isArray(data.data) ? data.data : []
        setCapabilities(caps)
      }
    } catch (err) {
      logger.error('获取 AI 能力清单失败', err)
    } finally {
      setCapabilitiesLoading(false)
    }
  }, [])

  /* ---------- 能力清单加载后：校验当前 activeTab 是否合法 ---------- */
  useEffect(() => {
    if (capabilities.length > 0 && !capabilities.some(c => c.id === activeTab)) {
      setActiveTab(defaultTab)
    }
  }, [capabilities, activeTab, defaultTab])

  /* ---------- 用户任务列表（按当前 Tab 的 mode 过滤，轮询） ----------
   * 每个 Tab 对应一个 mode：
   *   generate          → parametric
   *   test_data         → test_data
   *   analyze           → analyze
   *   suggest_metadata  → suggest_metadata
   *   similar           → similar
   * 切换 Tab 时按对应 mode 拉取历史，侧栏显示的就是当前功能的完整历史记录。
   */
  const activeMode = TAB_TO_MODE[activeTab] || 'parametric'
  const fetchTasks = useCallback(async () => {
    try {
      setTasksLoading(true)
      // 按当前 Tab 对应的 mode 过滤，返回该功能的全部历史记录
      const res = await fetchWithCookie(`/api/admin/ai/generate?mode=${activeMode}`)
      const data = await res.json()
      if (data.success) {
        const items: AiTask[] = Array.isArray(data.data) ? data.data : []
        setTasks(items)
      } else {
        setTasks([])
      }
    } catch (err) {
      logger.error('获取 AI 任务列表失败', err)
      setTasks([])
    } finally {
      setTasksLoading(false)
    }
  }, [activeMode])

  /* ---------- 初始化：模型偏好 + 能力清单 + 任务列表（仅执行一次） ---------- */
  useEffect(() => {
    // 从 localStorage 读取上次的模型偏好
    try {
      const lastModelId = localStorage.getItem(LAST_MODEL_KEY)
      if (lastModelId) setModelId(lastModelId)
    } catch {
      // localStorage 不可用时静默忽略
    }

    fetchCapabilities()
    fetchTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- 任务列表轮询：仅当有活跃任务（PENDING/PROCESSING）时才启动，避免空轮询 ---------- */
  const hasActiveJob = tasks.some(t => t.status === 'PENDING' || t.status === 'PROCESSING')
  useEffect(() => {
    const start = () => {
      if (pollingRef.current) return
      pollingRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchTasks()
        }
      }, 5000)
    }
    const stop = () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchTasks()
        if (hasActiveJob) start()
        else stop()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible' && hasActiveJob) {
      start()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [fetchTasks, hasActiveJob])

  /* ---------- Tab 切换：同步 URL query + 重置侧栏 + 重新拉取该 mode 的任务 ---------- */
  const handleTabChange = (id: string) => {
    setActiveTab(id)
    // 重置侧栏选中状态：切换到新功能时回到列表视图
    setHistorySelectedId(null)
    setSidebarMode('list')
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', id)
    // problemId 仅在 test_data / analyze 等 Tab 下保留
    if (!['test_data', 'analyze', 'suggest_metadata'].includes(id)) {
      params.delete('problemId')
    }
    router.replace(`/admin/ai?${params.toString()}`, { scroll: false })
  }

  /* ---------- activeMode 变化时重新拉取对应 mode 的任务 ---------- */
  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  /* ---------- problemId 变化时同步 URL query ---------- */
  useEffect(() => {
    if (!problemId) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('problemId', problemId)
    router.replace(`/admin/ai?${params.toString()}`, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId])

  /* ---------- 模型选择：持久化到 localStorage ---------- */
  const handleModelChange = (id: string) => {
    setModelId(id)
    try {
      localStorage.setItem(LAST_MODEL_KEY, id)
    } catch {
      // localStorage 不可用时静默忽略
    }
  }

  /* ---------- 侧栏任务卡片点击：定位到该任务详情并展开侧栏 ---------- */
  const handleTaskClick = (task: AiTask) => {
    setHistorySelectedId(task.id)
    // 确保侧栏展开（即使之前是 collapsed 状态）
    if (sidebarMode === 'collapsed') {
      setSidebarMode('list')
    }
  }

  /* ---------- 侧栏选中状态变化：动态调整宽度 ---------- */
  const handleSidebarSelectedChange = (selectedId: string | null) => {
    if (selectedId) {
      setSidebarMode('detail')
    } else {
      setSidebarMode('list')
    }
  }

  /* ---------- 侧栏折叠/展开切换 ---------- */
  const toggleSidebar = () => {
    setSidebarMode(prev => (prev === 'collapsed' ? 'list' : 'collapsed'))
  }

  /* ---------- 按 activeTab 渲染对应表单 ----------
   * 任务状态与结果展示统一由右栏 AiWorkspaceSidebar 负责，
   * 工作区只渲染输入表单，避免重复展示 + 同一 logId 双重轮询。
   * 提交成功后 selectTaskInSidebar() 自动展开右栏并选中新建任务。
   */
  const renderTabContent = () => {
    switch (activeTab) {
      case 'generate':
        return (
          <AiGenerationForm
            defaultModelId={modelId || undefined}
            onSubmit={handleSubmitGenerate}
            submitting={submittingGenerate}
          />
        )

      case 'test_data':
        return (
          <TestDataGenerationForm
            problemId={problemId || undefined}
            modelId={modelId || undefined}
            onEnqueued={() => fetchTasks()}
          />
        )

      case 'analyze':
        // AnalyzeForm 自管理完整流程：题号搜索 → 提交 → 轮询 → 可编辑建议 + 一键入库
        return (
          <AnalyzeForm defaultProblemId={problemId || undefined} />
        )

      case 'suggest_metadata':
        // SuggestMetadataForm 自管理完整流程：题面输入 → 提交 → 轮询 → 可编辑建议 + 一键入库
        return (
          <SuggestMetadataForm />
        )

      case 'similar':
        return (
          <SimilarProblemForm
            defaultProblemId={problemId || undefined}
            onEnqueued={() => fetchTasks()}
          />
        )

      default:
        // monitor 等带 href 的 Tab 由 AiCapabilitiesNav 跳转，不会进入这里
        return (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>请选择上方的 AI 能力 Tab 开始</p>
            {problemId && (
              <p className="mt-1 text-xs">
                当前关联题目 ID：<code className="font-mono">{problemId}</code>
              </p>
            )}
          </div>
        )
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 顶部：模型选择器 + 侧栏控制（页面标题由顶部 AdminLayout 统一渲染） */}
      <div className="card-static p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-[260px] flex-1 max-w-md">
            <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
              <Cpu className="w-3.5 h-3.5" />
              模型
            </label>
            <div className="flex-1">
              <AiModelPicker value={modelId} onChange={handleModelChange} />
            </div>
            <Link
              href="/admin/ai-models"
              className="btn btn-ghost flex items-center gap-1 px-3"
              title="管理模型"
            >
              <Settings className="w-4 h-4" />
            </Link>
            {/* 侧栏折叠/展开按钮 */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="btn btn-ghost flex items-center gap-1 px-3"
              title={sidebarMode === 'collapsed' ? '展开侧栏' : '折叠侧栏'}
              aria-label={sidebarMode === 'collapsed' ? '展开侧栏' : '折叠侧栏'}
            >
              {sidebarMode === 'collapsed' ? (
                <PanelRightOpen className="w-4 h-4" />
              ) : (
                <PanelRightClose className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 能力 Tab 导航 */}
      <div className="card-static px-4 pt-2">
        {capabilitiesLoading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            加载能力清单...
          </div>
        ) : (
          <AiCapabilitiesNav
            active={activeTab}
            onChange={handleTabChange}
            capabilities={capabilities}
          />
        )}
      </div>

      {/* 主体内容区：左右两栏布局，宽度动态变化，高度独立管理 */}
      <div className="flex gap-4 items-start">
        {/* 左栏：工作区（表单 + 结果查看器）— 默认为主要焦点，宽度动态变化
            高度由内容决定，独立于右侧侧栏 */}
        <motion.div
          layout
          className="card-static p-6 min-h-[600px] flex-1 min-w-0"
          transition={{ duration: 0.3, ease: 'easeOut' }}
          onClick={() => {
            if (sidebarMode === 'detail') {
              setSidebarMode('list')
            }
          }}
        >
          {children || (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {renderTabContent()}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>

        {/* 右栏：侧边栏（当前任务 + 历史记录）— 宽度三档变化 */}
        <AnimatePresence initial={false}>
          {sidebarMode !== 'collapsed' && (
            <motion.aside
              key="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{
                width: sidebarMode === 'detail' ? 720 : 360,
                opacity: 1,
              }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex-shrink-0"
              onClick={() => {
                // 点击记录区域任意位置 → 展开记录区到详情视图（宽宽度），工作区自动收窄
                // （点击交互元素如分页按钮时由子组件 stopPropagation 阻止冒泡，避免误触发）
                if (sidebarMode === 'list') {
                  setSidebarMode('detail')
                }
              }}
            >
              {/* 侧栏高度由内容决定，独立于左栏工作区，根据内容自然展开 */}
              <div className="card-static p-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    <AiWorkspaceSidebar
                      tasks={tasks}
                      loading={tasksLoading}
                      initialSelectedId={historySelectedId}
                      resultVersion={resultVersion}
                      onSelectedChange={handleSidebarSelectedChange}
                      onActiveTaskClick={handleTaskClick}
                      onFetchDetail={async (taskId) => {
                        // 详情按需拉取：调用单条 GET /api/admin/ai/generate?logId=xxx
                        try {
                          const res = await fetchWithCookie(`/api/admin/ai/generate?logId=${taskId}`)
                          const data = await res.json()
                          if (data.success && data.data) {
                            return data.data as AiTask
                          }
                        } catch (err) {
                          logger.error('获取任务详情失败', err)
                        }
                        return null
                      }}
                      onRetry={async (taskId) => {
                        const res = await fetchWithCookie('/api/admin/ai/generate', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ retryFromLogId: taskId }),
                        })
                        const data = await res.json()
                        if (data.success) {
                          // 重试入队后刷新列表
                          fetchTasks()
                        } else {
                          throw new Error(data.error || '重试失败')
                        }
                      }}
                      onCommitPreview={async (taskId) => {
                        try {
                          await handleCommitPreview(taskId)
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : '入库失败')
                        }
                      }}
                      onDiscardPreview={async (taskId) => {
                        try {
                          await handleDiscardPreview(taskId)
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : '丢弃失败')
                        }
                      }}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default AiWorkspaceShell
