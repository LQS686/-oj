'use client'

import { AlertTriangle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { AI_DISABLED_TITLE, AI_DISABLED_REASON } from '@/lib/ai/feature-flag'

interface AiDisabledNoticeProps {
  /** 是否显示返回按钮（默认 true） */
  showBackButton?: boolean
  /** 返回路径（默认 /admin） */
  backHref?: string
  /** 返回按钮文案（默认"返回管理后台"） */
  backLabel?: string
}

/**
 * AI 功能下架统一提示组件
 *
 * 所有 AI 页面在 AI_FEATURE_DISABLED 为 true 时渲染此组件替代原内容。
 * 入口层（菜单 / 卡片 / 按钮）使用 AiDisabledBadge 显示"功能异常"标记。
 */
export function AiDisabledNotice({
  showBackButton = true,
  backHref = '/admin',
  backLabel = '返回管理后台',
}: AiDisabledNoticeProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-error" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-3">{AI_DISABLED_TITLE}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          {AI_DISABLED_REASON}
        </p>
        {showBackButton && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors text-sm font-medium text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            {backLabel}
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * AI 功能异常徽章（用于入口层标记）
 *
 * 在菜单项 / 卡片 / 按钮旁显示"功能异常"小徽章，提示用户该功能暂不可用。
 */
export function AiDisabledBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-error/10 text-error border border-error/20">
      功能异常
    </span>
  )
}
