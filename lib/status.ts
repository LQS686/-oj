import { DIFFICULTY_COLORS, isValidDifficulty } from '@/lib/constants'

export interface StatusConfig {
  icon: string
  className: string
  iconBg: string
  text: string
  color: string
}

const DEFAULT_STATUS_CONFIG: StatusConfig = {
  icon: 'alert-circle',
  className: 'bg-muted text-muted-foreground',
  iconBg: 'bg-muted',
  text: 'Unknown',
  color: 'text-muted-foreground',
}

/** 仅按规范短码建表 */
const STATUS_CONFIGS: Record<string, StatusConfig> = {
  AC: {
    icon: 'check-circle-2',
    className: 'status-ac',
    iconBg: 'bg-[var(--difficulty-easy-bg)]',
    text: 'Accepted',
    color: 'text-[var(--difficulty-easy)]',
  },
  WA: {
    icon: 'x-circle',
    className: 'status-wa',
    iconBg: 'bg-[var(--difficulty-hard-bg)]',
    text: 'Wrong Answer',
    color: 'text-[var(--difficulty-hard)]',
  },
  TLE: {
    icon: 'timer',
    className: 'status-tle',
    iconBg: 'bg-[var(--difficulty-medium-bg)]',
    text: 'Time Limit Exceeded',
    color: 'text-[var(--difficulty-medium)]',
  },
  MLE: {
    icon: 'alert-circle',
    className: 'status-mle',
    iconBg: 'bg-[var(--difficulty-expert-bg)]',
    text: 'Memory Limit Exceeded',
    color: 'text-[var(--difficulty-expert)]',
  },
  RE: {
    icon: 'x-circle',
    className: 'status-re',
    iconBg: 'bg-[var(--difficulty-hard-bg)]',
    text: 'Runtime Error',
    color: 'text-[var(--difficulty-hard)]',
  },
  CE: {
    icon: 'alert-circle',
    className: 'status-ce',
    iconBg: 'bg-[var(--difficulty-expert-bg)]',
    text: 'Compile Error',
    color: 'text-[var(--difficulty-expert)]',
  },
  SE: {
    icon: 'alert-circle',
    className: 'bg-muted text-muted-foreground',
    iconBg: 'bg-muted',
    text: 'System Error',
    color: 'text-muted-foreground',
  },
  PENDING: {
    icon: 'loader-2',
    className: 'status-pending',
    iconBg: 'bg-primary-50',
    text: 'Pending',
    color: 'text-primary',
  },
  JUDGING: {
    icon: 'loader-2',
    className: 'status-pending',
    iconBg: 'bg-primary-50',
    text: 'Judging',
    color: 'text-primary',
  },
  RUNNING: {
    icon: 'loader-2',
    className: 'status-pending',
    iconBg: 'bg-primary-50',
    text: 'Running',
    color: 'text-primary',
  },
  PE: {
    icon: 'alert-triangle',
    className: 'status-pe',
    iconBg: 'bg-amber-50',
    text: 'Presentation Error',
    color: 'text-amber-600',
  },
  OLE: {
    icon: 'alert-triangle',
    className: 'status-ole',
    iconBg: 'bg-amber-50',
    text: 'Output Limit Exceeded',
    color: 'text-amber-600',
  },
  PC: {
    icon: 'alert-circle',
    className: 'status-pc',
    iconBg: 'bg-primary-50',
    text: 'Partly Correct',
    color: 'text-primary',
  },
  CSP: {
    icon: 'x-circle',
    className: 'status-csp',
    iconBg: 'bg-[var(--difficulty-hard-bg)]',
    text: 'Cannot Start Program',
    color: 'text-[var(--difficulty-hard)]',
  },
  removed: {
    icon: 'alert-circle',
    className: 'bg-muted text-muted-foreground',
    iconBg: 'bg-muted',
    text: 'Removed',
    color: 'text-muted-foreground',
  },
}

export function getStatusConfig(status: string): StatusConfig {
  const config = STATUS_CONFIGS[status]
  if (config) return config
  return {
    ...DEFAULT_STATUS_CONFIG,
    text: status || 'Unknown',
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
