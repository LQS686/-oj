'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  type LucideIcon,
} from 'lucide-react'
import Modal from './Modal'

/* ----------------------------- 类型定义 ----------------------------- */

export type DialogTone = 'success' | 'error' | 'warning' | 'info'

export interface AlertOptions {
  /** 标题，默认根据 tone 推断 */
  title?: string
  /** 正文，支持 ReactNode（如换行、加粗等） */
  message: React.ReactNode
  /** 语气/图标，默认 info */
  tone?: DialogTone
  /** 确认按钮文字，默认"确定" */
  confirmText?: string
  /** 确认按钮语气，默认根据 tone 推断（error→destructive） */
  confirmVariant?: ButtonVariant
  /** 自定义图标节点（覆盖 tone 推断的图标） */
  icon?: React.ReactNode
}

export interface ConfirmOptions {
  /** 标题，默认"请确认" */
  title?: string
  /** 正文，支持 ReactNode */
  message: React.ReactNode
  /** 语气/图标，默认 warning */
  tone?: DialogTone
  /** 确认按钮文字，默认"确定" */
  confirmText?: string
  /** 取消按钮文字，默认"取消" */
  cancelText?: string
  /** 确认按钮语气，默认 primary（删除场景应传 destructive） */
  confirmVariant?: ButtonVariant
  /** 自定义图标节点（覆盖 tone 推断的图标） */
  icon?: React.ReactNode
}

export interface DialogApi {
  /** 弹出提示框，关闭时 resolve */
  alert(options: AlertOptions): Promise<void>
  /** 弹出确认框，确认返回 true，取消/关闭返回 false */
  confirm(options: ConfirmOptions): Promise<boolean>
}

type ButtonVariant = 'primary' | 'secondary' | 'destructive'

/* ----------------------------- 图标映射 ----------------------------- */

const TONE_ICON: Record<DialogTone, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const TONE_ICON_CLASS: Record<DialogTone, string> = {
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning',
  info: 'text-info',
}

const TONE_TITLE: Record<DialogTone, string> = {
  success: '操作成功',
  error: '出错了',
  warning: '请确认',
  info: '提示',
}

function inferVariantFromTone(tone: DialogTone): ButtonVariant {
  return tone === 'error' ? 'destructive' : 'primary'
}

/* ----------------------------- 按钮 ----------------------------- */

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-ghost',
  destructive: 'btn btn-destructive',
}

function DialogButton({
  variant = 'primary',
  children,
  onClick,
  autoFocus,
}: {
  variant?: ButtonVariant
  children: React.ReactNode
  onClick: () => void
  autoFocus?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus={autoFocus}
      className={`${VARIANT_CLASS[variant]} flex-1`}
    >
      {children}
    </button>
  )
}

/* ----------------------------- 单条对话框状态 ----------------------------- */

type DialogItem =
  | {
      kind: 'alert'
      options: AlertOptions
      resolve: () => void
    }
  | {
      kind: 'confirm'
      options: ConfirmOptions
      resolve: (value: boolean) => void
    }

/* ----------------------------- Provider ----------------------------- */

const DialogContext = createContext<DialogApi | null>(null)

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<DialogItem[]>([])

  const push = useCallback((item: DialogItem) => {
    setQueue((prev) => [...prev, item])
  }, [])

  const pop = useCallback(() => {
    setQueue((prev) => prev.slice(1))
  }, [])

  const api = useMemo<DialogApi>(
    () => ({
      alert(options: AlertOptions) {
        return new Promise<void>((resolve) => {
          push({ kind: 'alert', options, resolve })
        })
      },
      confirm(options: ConfirmOptions) {
        return new Promise<boolean>((resolve) => {
          push({ kind: 'confirm', options, resolve })
        })
      },
    }),
    [push]
  )

  const current = queue[0]

  const closeCurrent = useCallback(
    (result: boolean | void) => {
      if (!current) return
      if (current.kind === 'alert') current.resolve()
      else current.resolve(result === true)
      pop()
    },
    [current, pop]
  )

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && (
        <ActiveDialog
          item={current}
          onClose={(confirmed) => closeCurrent(confirmed)}
        />
      )}
    </DialogContext.Provider>
  )
}

/* ----------------------------- 活动对话框渲染 ----------------------------- */

function ActiveDialog({
  item,
  onClose,
}: {
  item: DialogItem
  onClose: (confirmed: boolean) => void
}) {
  const isAlert = item.kind === 'alert'
  const options = item.options
  const tone: DialogTone = options.tone ?? (isAlert ? 'info' : 'warning')
  const title = options.title ?? TONE_TITLE[tone]
  const Icon = TONE_ICON[tone]

  const confirmVariant: ButtonVariant =
    options.confirmVariant ??
    (isAlert
      ? inferVariantFromTone(tone)
      : tone === 'error' || tone === 'warning'
      ? 'destructive'
      : 'primary')

  const confirmText = options.confirmText ?? '确定'
  const cancelText = !isAlert
    ? (item.options as ConfirmOptions).cancelText ?? '取消'
    : '取消'

  const Footer = (
    <>
      {!isAlert && (
        <DialogButton variant="secondary" onClick={() => onClose(false)}>
          {cancelText}
        </DialogButton>
      )}
      <DialogButton variant={confirmVariant} onClick={() => onClose(true)} autoFocus>
        {confirmText}
      </DialogButton>
    </>
  )

  return (
    <Modal
      open
      onClose={() => onClose(false)}
      title={title}
      icon={
        options.icon ?? <Icon className={`w-5 h-5 ${TONE_ICON_CLASS[tone]}`} />
      }
      footer={Footer}
      closeOnOverlayClick={isAlert ? true : false}
      size="sm"
    >
      <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
        {options.message}
      </div>
    </Modal>
  )
}

/* ----------------------------- Hook ----------------------------- */

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) {
    throw new Error('useDialog 必须在 <DialogProvider> 内部使用')
  }
  return ctx
}
