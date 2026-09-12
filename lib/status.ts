import { DIFFICULTY_COLORS, isValidDifficulty } from '@/lib/constants'

/**
 * 判题结论的展示层单一来源（文案 + 配色）。
 *
 * 规矩：
 *   1. 文案一律中文，且与 `lib/constants/submission-status.ts` 的取值一一对应。
 *   2. 配色由 `app/globals.css` 的 `.status-*` 类提供，**同一结论在任何页面都同色**。
 *   3. 通过 / 部分正确 / 答案错误 / 运行错误 / 超时 / 超内存 / 编译错误
 *      必须互相可区分，不得共用颜色（历史上它们曾被统一渲染成琥珀色而失去语义）。
 *
 * 因此：任何页面展示判题结论，都应走这里（或共享的 SubmissionStatusBadge 组件），
 * 不要在各页面里另写一份 switch/映射表。
 */
export interface StatusConfig {
  /** lucide 图标名（由调用方映射为组件） */
  icon: string
  /** 语义徽标类，定义见 globals.css 的 .status-* */
  className: string
  /** 图标容器底色 */
  iconBg: string
  /** 中文文案 */
  text: string
  /** 纯文字场景的文本色 */
  color: string
}

const DEFAULT_STATUS_CONFIG: StatusConfig = {
  icon: 'alert-circle',
  className: 'status-se',
  iconBg: 'bg-muted',
  text: '未知',
  color: 'text-muted-foreground',
}

/** 键为 SubmissionStatus 的取值 */
const STATUS_CONFIGS: Record<string, StatusConfig> = {
  AC: {
    icon: 'check-circle-2',
    className: 'status-ac',
    iconBg: 'bg-[var(--difficulty-easy-bg)]',
    text: '通过',
    color: 'text-[var(--difficulty-easy)]',
  },
  PC: {
    icon: 'alert-circle',
    className: 'status-pc',
    iconBg: 'bg-[var(--difficulty-medium-easy-bg)]',
    text: '部分正确',
    color: 'text-[var(--difficulty-medium-easy)]',
  },
  WA: {
    icon: 'x-circle',
    className: 'status-wa',
    iconBg: 'bg-[var(--difficulty-hard-bg)]',
    text: '答案错误',
    color: 'text-[var(--difficulty-hard)]',
  },
  RE: {
    icon: 'x-circle',
    className: 'status-re',
    iconBg: 'bg-[var(--difficulty-medium-hard-bg)]',
    text: '运行错误',
    color: 'text-[var(--difficulty-medium-hard)]',
  },
  TLE: {
    icon: 'timer',
    className: 'status-tle',
    iconBg: 'bg-[var(--difficulty-medium-bg)]',
    text: '超时',
    color: 'text-[var(--difficulty-medium)]',
  },
  MLE: {
    icon: 'alert-circle',
    className: 'status-mle',
    iconBg: 'bg-[var(--difficulty-expert-bg)]',
    text: '超内存',
    color: 'text-[var(--difficulty-expert)]',
  },
  CE: {
    icon: 'alert-circle',
    className: 'status-ce',
    iconBg: 'bg-muted',
    text: '编译错误',
    color: 'text-muted-foreground',
  },
  PE: {
    icon: 'alert-triangle',
    className: 'status-pe',
    iconBg: 'bg-[var(--difficulty-medium-bg)]',
    text: '格式错误',
    color: 'text-[var(--difficulty-medium)]',
  },
  OLE: {
    icon: 'alert-triangle',
    className: 'status-ole',
    iconBg: 'bg-[var(--difficulty-medium-bg)]',
    text: '输出超限',
    color: 'text-[var(--difficulty-medium)]',
  },
  CSP: {
    icon: 'x-circle',
    className: 'status-csp',
    iconBg: 'bg-[var(--difficulty-hard-bg)]',
    text: '无法启动',
    color: 'text-[var(--difficulty-hard)]',
  },
  SE: {
    icon: 'alert-circle',
    className: 'status-se',
    iconBg: 'bg-muted',
    text: '系统错误',
    color: 'text-muted-foreground',
  },
  PENDING: {
    icon: 'loader-2',
    className: 'status-pending',
    iconBg: 'bg-primary-50',
    text: '等待评测',
    color: 'text-primary',
  },
  JUDGING: {
    icon: 'loader-2',
    className: 'status-pending',
    iconBg: 'bg-primary-50',
    text: '评测中',
    color: 'text-primary',
  },
  RUNNING: {
    icon: 'loader-2',
    className: 'status-pending',
    iconBg: 'bg-primary-50',
    text: '运行中',
    color: 'text-primary',
  },
  removed: {
    icon: 'alert-circle',
    className: 'status-removed',
    iconBg: 'bg-muted',
    text: '已移除',
    color: 'text-muted-foreground',
  },
}

export function getStatusConfig(status: string): StatusConfig {
  const config = STATUS_CONFIGS[status]
  if (config) return config
  return {
    ...DEFAULT_STATUS_CONFIG,
    text: status || DEFAULT_STATUS_CONFIG.text,
  }
}

export function getStatusText(status: string): string {
  return getStatusConfig(status).text
}

export function getStatusColor(status: string): string {
  return getStatusConfig(status).color
}

export function getDifficultyClass(difficulty: string): string {
  if (isValidDifficulty(difficulty)) {
    return DIFFICULTY_COLORS[difficulty]
  }
  return DIFFICULTY_COLORS['入门']
}
