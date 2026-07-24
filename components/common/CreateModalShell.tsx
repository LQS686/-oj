'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * 创建模态窗统一框架
 *
 * - 内置 ESC 关闭、body 滚动锁定、header（图标 + 标题 + 关闭按钮）
 * - 经 portal 挂到 document.body，避免被 PageTransition 等祖先层叠上下文压到 Navbar 下
 * - `variant="user"`（默认）：遮罩从顶部导航栏下方开始（`top-14`）
 * - `variant="admin"`：遮罩 `inset-0` 覆盖全屏
 */

export type CreateModalShellVariant = 'user' | 'admin'

export interface CreateModalShellProps {
  open: boolean
  onClose: () => void
  title: string
  icon: LucideIcon
  /** aria-labelledby 指向的 id，需保证唯一 */
  labelledById: string
  /** 默认 'user'；admin 后台传 'admin' */
  variant?: CreateModalShellVariant
  children: React.ReactNode
}

const OVERLAY_CLASS: Record<CreateModalShellVariant, string> = {
  user: 'fixed top-14 left-0 right-0 bottom-0',
  admin: 'fixed inset-0',
}

const CONTAINER_MAX_H: Record<CreateModalShellVariant, string> = {
  user: 'max-h-[calc(100dvh-3.5rem-2rem)]',
  admin: 'max-h-[calc(100dvh-2rem)]',
}

export default function CreateModalShell({
  open,
  onClose,
  title,
  icon: Icon,
  labelledById,
  variant = 'user',
  children,
}: CreateModalShellProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`${OVERLAY_CLASS[variant]} flex items-center justify-center overflow-hidden bg-black/60 p-4 sm:p-6`}
      style={{ zIndex: 'var(--z-overlay)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`card-static rounded-xl w-full max-w-2xl ${CONTAINER_MAX_H[variant]} flex flex-col shadow-xl border border-border overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2
            id={labelledById}
            className="text-lg font-semibold text-foreground flex items-center gap-2"
          >
            <Icon className="w-5 h-5 text-primary-light" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
