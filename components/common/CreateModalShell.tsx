'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * 创建模态窗统一框架
 *
 * - 遮罩从顶部导航栏下方开始（`top-14`），避免与 `Navbar`（`h-14` fixed top-0 z-[100]）重叠
 * - 容器统一 `max-w-2xl`，`max-h` 扣除导航栏（3.5rem）与 padding（2rem），避免超出下边界
 * - 内置 ESC 关闭、body 滚动锁定、header（图标 + 标题 + 关闭按钮）
 * - children 为表单元素，自行负责中部滚动区与底部固定按钮区
 */

export interface CreateModalShellProps {
  open: boolean
  onClose: () => void
  title: string
  icon: LucideIcon
  /** aria-labelledby 指向的 id，需保证唯一 */
  labelledById: string
  children: React.ReactNode
}

export default function CreateModalShell({
  open,
  onClose,
  title,
  icon: Icon,
  labelledById,
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

  if (!open) return null

  return (
    <div
      className="fixed top-14 left-0 right-0 bottom-0 z-[110] flex items-center justify-center overflow-hidden bg-black/60 p-4 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card-static rounded-xl w-full max-w-2xl max-h-[calc(100dvh-3.5rem-2rem)] flex flex-col shadow-xl border border-border overflow-hidden"
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
    </div>
  )
}
