'use client'

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import type { AiCapability } from '@/types/ai'

interface AiCapabilitiesNavProps {
  /** 当前激活的 Tab id */
  active: string
  /** Tab 切换回调 */
  onChange: (id: string) => void
  /** 能力清单（由父组件 AiWorkspaceShell 拉取 /api/admin/ai/capabilities 后传入，保持纯组件） */
  capabilities: AiCapability[]
  /** 自定义 className */
  className?: string
}

/**
 * AI 能力导航 Tab
 *
 * 动画效果：
 * - 激活态下划线使用 framer-motion layoutId，切换时在 Tab 之间平滑滑动
 * - Tab 按钮 hover 时轻微上浮 + 背景色淡入
 * - 激活态文字颜色平滑过渡
 */
export function AiCapabilitiesNav({
  active,
  onChange,
  capabilities,
  className = '',
}: AiCapabilitiesNavProps) {
  if (capabilities.length === 0) {
    return null
  }

  return (
    <nav
      className={`flex items-center gap-1 border-b border-border flex-wrap ${className}`}
      aria-label="AI 能力导航"
    >
      {capabilities.map(cap => {
        const isActive = active === cap.id

        const baseClass = `relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
          isActive
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground'
        } ${!cap.available ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`

        // 激活下划线（共享 layoutId，切换时平滑滑动）
        const underline = isActive ? (
          <motion.span
            layoutId="active-tab-underline"
            className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full"
            initial={false}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          />
        ) : null

        // 含 href 的能力（如监控页）渲染为 Link
        if (cap.href) {
          return (
            <Link
              key={cap.id}
              href={cap.href}
              className={baseClass}
              aria-current={isActive ? 'page' : undefined}
            >
              {cap.label}
              {underline}
            </Link>
          )
        }

        // 不可用的能力，渲染为禁用按钮
        if (!cap.available) {
          return (
            <span
              key={cap.id}
              className={`${baseClass} inline-flex items-center gap-1`}
              title="该能力当前不可用"
            >
              <AlertCircle className="w-3 h-3" />
              {cap.label}
            </span>
          )
        }

        return (
          <button
            key={cap.id}
            type="button"
            onClick={() => onChange(cap.id)}
            className={baseClass}
            aria-current={isActive ? 'page' : undefined}
          >
            {cap.label}
            {underline}
          </button>
        )
      })}
    </nav>
  )
}

export default AiCapabilitiesNav
