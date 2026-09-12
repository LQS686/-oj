import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { getStatusConfig } from '@/lib/status'

/**
 * 判题结论徽标 —— 全站唯一实现。
 *
 * 文案与配色都来自 lib/status.ts（中文文案 + globals.css 的 .status-* 语义色），
 * 因此同一结论在任何页面都是同一个词、同一个颜色。
 * 禁止在页面里再写一份 status → 文案/颜色 的映射表。
 */
const ICONS: Record<string, LucideIcon> = {
  'check-circle-2': CheckCircle2,
  'x-circle': XCircle,
  timer: Clock,
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  'loader-2': Loader2,
}

export interface SubmissionStatusBadgeProps {
  status: string
  /** 追加类名（尺寸 / 间距等） */
  className?: string
  /** 是否显示前面小图标，默认显示 */
  showIcon?: boolean
}

export function SubmissionStatusBadge({
  status,
  className = '',
  showIcon = true,
}: SubmissionStatusBadgeProps) {
  const { text, className: tone, icon } = getStatusConfig(status)
  const Icon = ICONS[icon] ?? AlertCircle
  const spinning = icon === 'loader-2'

  return (
    <span className={`status-tag ${tone} ${className}`.trim()} title={text}>
      {showIcon ? (
        <Icon
          className={`w-3 h-3 shrink-0 ${spinning ? 'animate-icon-spin' : ''}`}
          aria-hidden="true"
        />
      ) : null}
      {text}
    </span>
  )
}

export default SubmissionStatusBadge
