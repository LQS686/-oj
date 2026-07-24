'use client'

import { useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

export type ModalSize = 'sm' | 'md' | 'lg'

export interface ModalProps {
  open: boolean
  onClose: () => void
  /** 标题（含图标可选）。不传则不渲染标题栏（仍渲染右上角关闭按钮） */
  title?: React.ReactNode
  /** 标题左侧小图标节点 */
  icon?: React.ReactNode
  /** 主体内容 */
  children: React.ReactNode
  /** 底部按钮区（无则不渲染底栏） */
  footer?: React.ReactNode
  /** 点击遮罩是否关闭，默认 true */
  closeOnOverlayClick?: boolean
  /** 按 Esc 是否关闭，默认 true */
  closeOnEsc?: boolean
  /** 是否隐藏右上角关闭按钮，默认 false */
  hideCloseButton?: boolean
  /** 宽度档位，默认 md */
  size?: ModalSize
  /** 透传到外层 dialog 的额外 className（极少用到） */
  className?: string
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

/**
 * 公共模态框基础壳组件
 *
 * - 自带遮罩层、Esc 关闭、滚动锁定
 * - 不含业务按钮，按钮由调用方通过 footer 传入
 * - 用于替换浏览器原生 alert/confirm 以及散落各处的自实现遮罩弹窗
 *
 * 使用示例：
 * ```tsx
 * <Modal open={open} onClose={close} title="确认操作" footer={<><button onClick={ok}>确定</button></>}>
 *   正文内容
 * </Modal>
 * ```
 */
export default function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  hideCloseButton = false,
  size = 'md',
  className = '',
}: ModalProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === 'Escape') onClose()
    },
    [closeOnEsc, onClose]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, handleKey])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden bg-black/60 p-4 sm:p-6 animate-fadeIn"
      style={{ zIndex: 'var(--z-modal)' }}
      onClick={closeOnOverlayClick ? onClose : undefined}
      role="presentation"
    >
      <div
        className={`card-static rounded-xl w-full ${SIZE_CLASS[size]} max-h-[min(90dvh,calc(100dvh-2rem))] flex flex-col shadow-xl border border-border overflow-hidden ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={typeof title === 'string' ? 'modal-title' : undefined}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            {title ? (
              <h2 id="modal-title" className="text-lg font-semibold text-foreground flex items-center gap-2">
                {icon}
                {title}
              </h2>
            ) : (
              <span />
            )}
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">{footer}</div>
        )}
      </div>
    </div>
  )
}
