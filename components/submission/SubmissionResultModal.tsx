'use client'

import { useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  Trophy,
  X,
  Eye,
  RotateCcw,
  Timer,
  Database,
} from 'lucide-react'
import Confetti from './Confetti'
import { formatTime, formatMemory } from '@/lib/utils'

export interface TestResultItem {
  testId?: string
  status: string
  time: number
  memory: number
  message?: string | null
}

export interface SubmissionResultData {
  submissionId: string
  status: string
  score: number
  time: number
  memory: number
  passedTests: number
  totalTests: number
  message?: string | null
  testResults?: TestResultItem[]
}

export interface JudgeProgressData {
  currentTest: number
  totalTests: number
}

interface SubmissionResultModalProps {
  isOpen: boolean
  onClose: () => void
  /** 是否处于评测中（Pending/Judging/Running） */
  isJudging: boolean
  /** 评测进度（评测中时展示） */
  judgeProgress?: JudgeProgressData | null
  /** 评测结果（评测完成后展示） */
  result?: SubmissionResultData | null
  /** 「继续提交」回调：关闭弹窗并聚焦代码框 */
  onContinueSubmit?: () => void
  /** 「查看详情」回调：跳转至提交详情页 */
  onViewDetail?: (submissionId: string) => void
}

interface StatusMeta {
  text: string
  description: string
  icon: 'check' | 'x' | 'clock' | 'alert' | 'alert-triangle' | 'trophy'
  color: string
  bg: string
  border: string
  textCls: string
}

function getStatusMeta(status: string): StatusMeta {
  switch (status) {
    case 'AC':
    case 'Accepted':
      return {
        text: '通过',
        description: '所有测试点均通过，干得漂亮！',
        icon: 'trophy',
        color: 'text-secondary-light',
        bg: 'bg-secondary/10',
        border: 'border-secondary/40',
        textCls: 'text-secondary-light',
      }
    case 'PC':
    case 'Partly Correct':
      return {
        text: '部分正确',
        description: '部分测试点未通过，继续加油！',
        icon: 'check',
        color: 'text-primary-light',
        bg: 'bg-primary/10',
        border: 'border-primary/30',
        textCls: 'text-primary-light',
      }
    case 'WA':
    case 'Wrong Answer':
      return {
        text: '答案错误',
        description: '程序输出与期望不符',
        icon: 'x',
        color: 'text-error',
        bg: 'bg-error/10',
        border: 'border-error/30',
        textCls: 'text-error',
      }
    case 'TLE':
    case 'Time Limit Exceeded':
      return {
        text: '超时',
        description: '程序运行时间超出限制',
        icon: 'clock',
        color: 'text-accent',
        bg: 'bg-accent/10',
        border: 'border-accent/30',
        textCls: 'text-accent',
      }
    case 'MLE':
    case 'Memory Limit Exceeded':
      return {
        text: '超内存',
        description: '程序内存使用超出限制',
        icon: 'alert',
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/30',
        textCls: 'text-purple-400',
      }
    case 'RE':
    case 'Runtime Error':
      return {
        text: '运行错误',
        description: '程序运行时崩溃（如除零、数组越界）',
        icon: 'alert',
        color: 'text-error',
        bg: 'bg-error/10',
        border: 'border-error/30',
        textCls: 'text-error',
      }
    case 'CE':
    case 'Compile Error':
      return {
        text: '编译错误',
        description: '代码无法通过编译，请检查语法',
        icon: 'alert-triangle',
        color: 'text-accent',
        bg: 'bg-accent/10',
        border: 'border-accent/30',
        textCls: 'text-accent',
      }
    case 'PE':
    case 'Presentation Error':
      return {
        text: '格式错误',
        description: '输出格式与期望略有差异',
        icon: 'alert-triangle',
        color: 'text-accent',
        bg: 'bg-accent/10',
        border: 'border-accent/30',
        textCls: 'text-accent',
      }
    case 'OLE':
    case 'Output Limit Exceeded':
      return {
        text: '输出超限',
        description: '程序输出内容超出限制',
        icon: 'alert-triangle',
        color: 'text-accent',
        bg: 'bg-accent/10',
        border: 'border-accent/30',
        textCls: 'text-accent',
      }
    case 'CSP':
      return {
        text: '无法启动',
        description: '评测器无法启动程序',
        icon: 'x',
        color: 'text-error',
        bg: 'bg-error/10',
        border: 'border-error/30',
        textCls: 'text-error',
      }
    case 'SE':
    case 'System Error':
      return {
        text: '系统错误',
        description: '评测系统内部错误，请稍后重试',
        icon: 'alert',
        color: 'text-muted-foreground',
        bg: 'bg-muted',
        border: 'border-border',
        textCls: 'text-muted-foreground',
      }
    default:
      return {
        text: status,
        description: '',
        icon: 'alert',
        color: 'text-muted-foreground',
        bg: 'bg-muted',
        border: 'border-border',
        textCls: 'text-muted-foreground',
      }
  }
}

function StatusIcon({ meta }: { meta: StatusMeta }) {
  const cls = `w-16 h-16 ${meta.color}`
  switch (meta.icon) {
    case 'trophy':
      return <Trophy className={cls} />
    case 'check':
      return <CheckCircle2 className={cls} />
    case 'x':
      return <XCircle className={cls} />
    case 'clock':
      return <Clock className={cls} />
    case 'alert-triangle':
      return <AlertTriangle className={cls} />
    case 'alert':
      return <AlertCircle className={cls} />
    default:
      return <AlertCircle className={cls} />
  }
}

function MetricCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string
  value: string
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-4 border transition-all ${
        highlight
          ? 'bg-secondary/5 border-secondary/30'
          : 'bg-muted/40 border-border'
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-xl font-bold font-mono ${highlight ? 'text-secondary-light' : 'text-foreground'}`}>
        {value}
      </div>
    </motion.div>
  )
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const panelVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 28 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 8,
    transition: { duration: 0.15, ease: 'easeIn' as const },
  },
}

export default function SubmissionResultModal({
  isOpen,
  onClose,
  isJudging,
  judgeProgress,
  result,
  onContinueSubmit,
  onViewDetail,
}: SubmissionResultModalProps) {
  const status = result?.status || ''
  const meta = useMemo(() => (status ? getStatusMeta(status) : null), [status])
  const isAC = status === 'AC' || status === 'Accepted'
  const isCE = status === 'CE' || status === 'Compile Error'
  const isFinal = !!result && !isJudging

  // ESC 关闭（仅评测完成后）
  useEffect(() => {
    if (!isOpen || isJudging) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, isJudging, onClose])

  // 锁定 body 滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleOverlayClick = () => {
    if (!isJudging) onClose()
  }

  const handleContinue = () => {
    onClose()
    onContinueSubmit?.()
  }

  const handleViewDetail = () => {
    if (result?.submissionId) {
      onViewDetail?.(result.submissionId)
    }
    onClose()
  }

  const progressPercent =
    result && result.totalTests > 0
      ? (result.passedTests / result.totalTests) * 100
      : 0

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.2 }}
          style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(6px)' }}
          onClick={handleOverlayClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="submission-result-title"
        >
          {isAC && !isJudging && result?.submissionId && (
            <Confetti trigger={result.submissionId} />
          )}

          <motion.div
            className="card-static rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden shadow-2xl"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部状态区 */}
            <div className={`relative px-6 pt-8 pb-6 text-center border-b ${meta ? `${meta.bg} ${meta.border}` : 'bg-muted border-border'}`}>
              {!isJudging && meta && (
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute top-3 right-3 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                  aria-label="关闭"
                >
                  <X className="w-5 h-5" />
                </button>
              )}

              {isJudging ? (
                <div>
                  <motion.div
                    className="relative w-16 h-16 mx-auto mb-4"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                    <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent" />
                  </motion.div>
                  <h2 id="submission-result-title" className="text-xl font-bold text-foreground mb-1">
                    正在评测中...
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {judgeProgress
                      ? `已评测 ${judgeProgress.currentTest} / ${judgeProgress.totalTests} 个测试点`
                      : '等待评测结果'}
                  </p>
                  {judgeProgress && judgeProgress.totalTests > 0 && (
                    <div className="mt-4 w-full max-w-xs mx-auto">
                      <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-primary-light rounded-full"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.min((judgeProgress.currentTest / judgeProgress.totalTests) * 100, 100)}%`,
                          }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : meta ? (
                <div>
                  <motion.div
                    className="flex justify-center mb-3"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <StatusIcon meta={meta} />
                  </motion.div>
                  <h2 id="submission-result-title" className={`text-2xl font-bold mb-1 ${meta.textCls}`}>
                    {isAC ? '恭喜通过！' : meta.text}
                  </h2>
                  {meta.description && (
                    <p className="text-sm text-muted-foreground">{meta.description}</p>
                  )}
                </div>
              ) : null}
            </div>

            {/* 内容区 */}
            <div className="px-6 py-5 overflow-y-auto custom-scrollbar max-h-[calc(90vh-220px)]">
              {/* 评测进度条（PC 状态或评测完成有测试点时） */}
              {isFinal && result && result.totalTests > 0 && !isAC && (
                <div className="mb-5">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">测试点通过情况</span>
                    <span className="font-semibold text-foreground">
                      {result.passedTests} / {result.totalTests}
                    </span>
                  </div>
                  <div className="relative w-full h-2.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={`absolute top-0 left-0 h-full rounded-full ${
                        progressPercent === 100
                          ? 'bg-gradient-to-r from-secondary to-secondary-light'
                          : progressPercent > 0
                          ? 'bg-gradient-to-r from-accent to-accent-light'
                          : 'bg-gradient-to-r from-error to-red-400'
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              )}

              {/* 三项关键指标（CE 不展示用时内存） */}
              {isFinal && result && (
                <div className={`grid gap-3 ${isCE ? 'grid-cols-1' : 'grid-cols-3'} mb-5`}>
                  <MetricCard
                    label="得分"
                    value={`${result.score}`}
                    icon={<Trophy className="w-3.5 h-3.5" />}
                    highlight={isAC}
                  />
                  {!isCE && (
                    <MetricCard
                      label="用时"
                      value={formatTime(result.time)}
                      icon={<Timer className="w-3.5 h-3.5" />}
                      highlight={isAC}
                    />
                  )}
                  {!isCE && (
                    <MetricCard
                      label="内存"
                      value={formatMemory(result.memory)}
                      icon={<Database className="w-3.5 h-3.5" />}
                      highlight={isAC}
                    />
                  )}
                </div>
              )}

              {/* 评测信息 / 错误信息 */}
              {isFinal && result?.message && (
                <motion.div
                  className="mb-5"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-accent" />
                    <h4 className="text-sm font-semibold text-foreground">
                      {isCE ? '编译错误信息' : '评测信息'}
                    </h4>
                  </div>
                  <pre
                    className={`text-xs whitespace-pre-wrap rounded-lg p-3 border max-h-48 overflow-y-auto custom-scrollbar font-mono ${
                      isCE
                        ? 'bg-accent/5 border-accent/20 text-accent'
                        : 'bg-error/5 border-error/20 text-error'
                    }`}
                  >
                    {result.message}
                  </pre>
                </motion.div>
              )}
            </div>

            {/* 底部操作区 */}
            <div className="px-6 py-4 border-t border-border bg-muted/30 flex flex-wrap items-center justify-end gap-2">
              {isJudging ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost cursor-pointer"
                >
                  后台等待
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-ghost cursor-pointer"
                  >
                    关闭
                  </button>
                  {onContinueSubmit && (
                    <button
                      type="button"
                      onClick={handleContinue}
                      className="btn btn-ghost cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4" />
                      继续提交
                    </button>
                  )}
                  {onViewDetail && result?.submissionId && (
                    <button
                      type="button"
                      onClick={handleViewDetail}
                      className="btn btn-primary cursor-pointer flex items-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" />
                      查看详情
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
