'use client'

import { useMemo } from 'react'
import { Loader2, Activity, History, ChevronRight, Inbox } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { AiTask } from '@/types/ai'
import { formatRelativeTime } from '@/lib/utils'
import { AiTaskHistoryPanel } from './AiTaskHistoryPanel'

interface AiWorkspaceSidebarProps {
  /** 任务列表（当前功能 mode 的全部历史，由 AiWorkspaceShell 通过 props 传入） */
  tasks: AiTask[]
  /** 是否正在加载 */
  loading?: boolean
  /** 拉取任务详情回调 */
  onFetchDetail?: (taskId: string) => Promise<AiTask | null>
  /** 重试任务回调 */
  onRetry?: (taskId: string) => void | Promise<void>
  /** 入库预览题目回调 */
  onCommitPreview?: (taskId: string) => void | Promise<void>
  /** 丢弃预览题目回调 */
  onDiscardPreview?: (taskId: string) => void | Promise<void>
  /** 外部传入的初始选中任务 ID（浮动按钮点击跳转时使用） */
  initialSelectedId?: string | null
  /** 结果版本号：入库/丢弃后递增，触发 AiTaskHistoryPanel 清除 detailCache 强制重新拉取 */
  resultVersion?: number
  /** 选中状态变化回调（父组件用于动态调整左右栏宽度） */
  onSelectedChange?: (selectedId: string | null) => void
  /** 点击进行中任务卡片回调（与历史记录点击行为一致：定位到详情） */
  onActiveTaskClick?: (task: AiTask) => void
  /** 自定义 className */
  className?: string
}

/**
 * AI 工作区右侧侧边栏
 *
 * 布局：
 * - 顶部置顶区块：当前进行中任务（PENDING/PROCESSING）
 *   - 每个任务以紧凑卡片展示，含状态徽章 + 标题 + 相对时间
 *   - 空状态时显示"暂无进行中任务"
 * - 下方历史记录列表：复用 AiTaskHistoryPanel
 *   - 支持点击展开详情视图
 *   - 详情视图通过 onSelectedChange 回调通知父组件扩展侧栏宽度
 *
 * 与 AiWorkspaceShell 的协作：
 * - 父组件根据 onSelectedChange 回调动态调整侧栏宽度
 *   - null（列表视图）：侧栏窄宽度
 *   - string（详情视图）：侧栏宽宽度
 */
export function AiWorkspaceSidebar({
  tasks,
  loading = false,
  onFetchDetail,
  onRetry,
  onCommitPreview,
  onDiscardPreview,
  initialSelectedId,
  resultVersion,
  onSelectedChange,
  onActiveTaskClick,
  className = '',
}: AiWorkspaceSidebarProps) {
  // 按状态分组：进行中任务置顶
  const { activeTasks, recentTasks } = useMemo(() => {
    const active: AiTask[] = []
    const recent: AiTask[] = []
    for (const t of tasks) {
      if (t.status === 'PENDING' || t.status === 'PROCESSING') {
        active.push(t)
      } else {
        recent.push(t)
      }
    }
    // 进行中任务按创建时间倒序（最新提交的在前）
    active.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    // 历史记录按创建时间倒序
    recent.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return { activeTasks: active, recentTasks: recent }
  }, [tasks])

  return (
    <div
      className={`flex flex-col ${className}`}
      // 点击交互元素（按钮、链接、输入框等）时不冒泡到父容器（aside），
      // 避免触发外层"点击记录区域展开到详情视图"的行为。
      // 点击空白区域（标题、分隔线、卡片间隙等）则正常冒泡，由父容器处理展开。
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (target.closest('button, a, input, select, textarea, [role="button"]')) {
          e.stopPropagation()
        }
      }}
    >
      {/* 顶部置顶区块：进行中任务 */}
      <div className="flex-shrink-0 mb-3">
        <div className="flex items-center gap-2 px-1 pb-2">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-xs font-semibold text-foreground">当前任务</h3>
          {activeTasks.length > 0 && (
            <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
              {activeTasks.length}
            </span>
          )}
        </div>

        {loading && activeTasks.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            加载中...
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground rounded-lg border border-dashed border-border bg-muted/20">
            <Inbox className="w-5 h-5 mx-auto mb-1 opacity-40" />
            暂无进行中任务
          </div>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence mode="popLayout">
              {activeTasks.map(task => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  <ActiveTaskChip
                    task={task}
                    onClick={onActiveTaskClick ? () => onActiveTaskClick(task) : undefined}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 分隔线 */}
      <div className="h-px bg-border flex-shrink-0 mb-3" />

      {/* 历史记录区 */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2 px-1 pb-2">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="text-xs font-semibold text-foreground">历史记录</h3>
          {recentTasks.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              共 {recentTasks.length} 条
            </span>
          )}
        </div>

        <AiTaskHistoryPanel
          tasks={tasks}
          loading={loading}
          onFetchDetail={onFetchDetail}
          onRetry={onRetry}
          onCommitPreview={onCommitPreview}
          onDiscardPreview={onDiscardPreview}
          initialSelectedId={initialSelectedId}
          resultVersion={resultVersion}
          onSelectedChange={onSelectedChange}
        />
      </div>
    </div>
  )
}

/* ---------- 进行中任务紧凑卡片 ---------- */

interface ActiveTaskChipProps {
  task: AiTask
  onClick?: () => void
}

function ActiveTaskChip({ task, onClick }: ActiveTaskChipProps) {
  const isProcessing = task.status === 'PROCESSING'
  const title = (() => {
    const t = task.params?.title
    if (t) return t
    const topic = task.params?.topic
    if (topic && topic.length > 0) return topic.join('、')
    return modeLabel(task.mode)
  })()

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border bg-card px-3 py-2 transition-colors ${
        isProcessing
          ? 'border-info/40 hover:border-info/60 hover:bg-info/5'
          : 'border-accent/40 hover:border-accent/60 hover:bg-accent/5'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-2">
        {isProcessing ? (
          <Loader2 className="w-3.5 h-3.5 text-info animate-spin flex-shrink-0" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
        )}
        <span className="text-xs font-medium text-foreground truncate flex-1">{title}</span>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{isProcessing ? '正在生成...' : '等待中'}</span>
        <span>{formatRelativeTime(task.createdAt)}</span>
      </div>
    </button>
  )
}

function modeLabel(mode?: string): string {
  switch (mode) {
    case 'parametric':
      return '智能出题'
    case 'test_data':
      return '测试数据生成'
    case 'test_data_incremental':
      return '测试数据增量补充'
    case 'analyze':
      return '题目分析'
    case 'suggest_metadata':
      return '元数据建议'
    case 'similar':
      return '相似题生成'
    case 'diagnose':
      return '失败诊断'
    default:
      return 'AI 任务'
  }
}

export default AiWorkspaceSidebar
