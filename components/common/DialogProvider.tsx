'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

export interface PromptOptions {
  /** 标题，默认"请输入" */
  title?: string
  /** 说明文字 */
  message?: React.ReactNode
  /** 输入框默认值 */
  defaultValue?: string
  /** 输入框占位符 */
  placeholder?: string
  /** 语气/图标，默认 info */
  tone?: DialogTone
  /** 确认按钮文字，默认"确定" */
  confirmText?: string
  /** 取消按钮文字，默认"取消" */
  cancelText?: string
  /** 是否允许空字符串提交，默认 true */
  allowEmpty?: boolean
  /** 自定义图标节点 */
  icon?: React.ReactNode
}

export interface DialogApi {
  /** 弹出提示框，关闭时 resolve */
  alert(options: AlertOptions): Promise<void>
  /** 弹出确认框，确认返回 true，取消/关闭返回 false */
  confirm(options: ConfirmOptions): Promise<boolean>
  /** 弹出输入框，确认返回字符串，取消/关闭返回 null */
  prompt(options: PromptOptions): Promise<string | null>
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
  disabled,
}: {
  variant?: ButtonVariant
  children: React.ReactNode
  onClick: () => void
  autoFocus?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus={autoFocus}
      disabled={disabled}
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
  | {
      kind: 'prompt'
      options: PromptOptions
      resolve: (value: string | null) => void
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
      prompt(options: PromptOptions) {
        return new Promise<string | null>((resolve) => {
          push({ kind: 'prompt', options, resolve })
        })
      },
    }),
    [push]
  )

  const current = queue[0]

  const closeAlertOrConfirm = useCallback(
    (result: boolean | void) => {
      if (!current) return
      if (current.kind === 'alert') current.resolve()
      else if (current.kind === 'confirm') current.resolve(result === true)
      pop()
    },
    [current, pop]
  )

  const closePrompt = useCallback(
    (value: string | null) => {
      if (!current || current.kind !== 'prompt') return
      current.resolve(value)
      pop()
    },
    [current, pop]
  )

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && current.kind === 'prompt' && (
        <PromptDialog item={current} onClose={closePrompt} />
      )}
      {current && current.kind !== 'prompt' && (
        <ActiveDialog
          item={current}
          onClose={(confirmed) => closeAlertOrConfirm(confirmed)}
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
  item: Extract<DialogItem, { kind: 'alert' | 'confirm' }>
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

function PromptDialog({
  item,
  onClose,
}: {
  item: Extract<DialogItem, { kind: 'prompt' }>
  onClose: (value: string | null) => void
}) {
  const options = item.options
  const tone: DialogTone = options.tone ?? 'info'
  const title = options.title ?? '请输入'
  const Icon = TONE_ICON[tone]
  const allowEmpty = options.allowEmpty !== false
  const [value, setValue] = useState(options.defaultValue ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [])

  const canSubmit = allowEmpty || value.trim().length > 0

  const Footer = (
    <>
      <DialogButton variant="secondary" onClick={() => onClose(null)}>
        {options.cancelText ?? '取消'}
      </DialogButton>
      <DialogButton
        variant="primary"
        disabled={!canSubmit}
        onClick={() => onClose(value)}
      >
        {options.confirmText ?? '确定'}
      </DialogButton>
    </>
  )

  return (
    <Modal
      open
      onClose={() => onClose(null)}
      title={title}
      icon={
        options.icon ?? <Icon className={`w-5 h-5 ${TONE_ICON_CLASS[tone]}`} />
      }
      footer={Footer}
      closeOnOverlayClick={false}
      size="sm"
    >
      <div className="space-y-3">
        {options.message != null && options.message !== '' && (
          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
            {options.message}
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={options.placeholder}
          className="input w-full"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) {
              e.preventDefault()
              onClose(value)
            }
          }}
        />
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
