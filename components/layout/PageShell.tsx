import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import PageContainer from './PageContainer'
import type { PageContainerVariant } from './PageContainer'

/**
 * 页面外壳 PageShell —— 全站页面结构的唯一入口
 *
 * 立规矩（与 app/globals.css 的标题 token 配套）：
 *   1. **每个页面恰好一个 H1**，由本组件渲染，页面自身不得再写 <h1>。
 *   2. H1 **始终在无障碍树中且可见**，不允许用 display:none 隐藏
 *      （历史问题：列表页在桌面端把 H1 设为 sm:hidden，导致页面没有可用标题）。
 *   3. H1 字号只能取 `text-page-title`（24px）。状态页请用 `text-status-title`。
 *   4. 页面宽度只能取下面 PageWidth 的取值，不得自定 max-w-*。
 *   5. **不要在本组件或页面里写 `<main>` / `id="main-content"`**：
 *      主内容地标由根布局的 MainLandmark 统一提供（后台由 AdminLayout 提供），
 *      这样自带布局的页面（首页、详情页、认证页、错误页）也不会漏掉地标。
 *
 * 需要隐藏标题时，场景几乎只应是「页面内已有等价的可见标题」，
 * 此时用 visuallyHiddenTitle 让它对读屏可见、对视觉隐藏。
 */

/** 页面宽度语义（对应 globals.css 的 --max-width-page-*） */
export type PageWidth = 'full' | 'workspace' | 'standard' | 'form' | 'bleed'

const WIDTH_TO_VARIANT: Record<Exclude<PageWidth, 'bleed'>, PageContainerVariant> = {
  full: 'full',
  workspace: 'workspace',
  standard: 'standard',
  form: 'form',
}

export interface PageShellProps {
  /** 页面标题（H1） */
  title: string
  /** 标题上方的辅助标签，如「官方题单」「管理员视图」 */
  eyebrow?: ReactNode
  /** 标题下方的说明文字 */
  description?: ReactNode
  /** 标题左侧图标 */
  icon?: LucideIcon
  /** 图标底色，默认主色填充 */
  iconClassName?: string
  /** 返回链接地址（传了才渲染） */
  backHref?: string
  /** 返回链接文案，默认「返回」 */
  backLabel?: string
  /** 标题行右侧操作区（如「创建题目」） */
  actions?: ReactNode
  /** 标题下方的工具栏（搜索、筛选等） */
  toolbar?: ReactNode
  /** 页面宽度语义，默认 full */
  width?: PageWidth
  /** 视觉隐藏 H1：仅当页面内已有等价可见标题时使用 */
  visuallyHiddenTitle?: boolean
  /** 追加类名 */
  className?: string
  children: ReactNode
}

export function PageShell({
  title,
  eyebrow,
  description,
  icon: Icon,
  iconClassName = 'bg-primary text-primary-foreground',
  backHref,
  backLabel = '返回',
  actions,
  toolbar,
  width = 'full',
  visuallyHiddenTitle = false,
  className = '',
  children,
}: PageShellProps) {
  const body = (
    <>
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-3 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {backLabel}
        </Link>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 min-w-0 sm:flex-1">
          {Icon ? (
            <span
              className={`hidden sm:flex w-9 h-9 rounded-lg items-center justify-center shrink-0 ${iconClassName}`}
              aria-hidden="true"
            >
              <Icon className="w-4 h-4" />
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-xs font-semibold text-muted-foreground mb-0.5">{eyebrow}</div>
            ) : null}
            <h1
              className={
                visuallyHiddenTitle ? 'sr-only' : 'text-page-title text-foreground truncate'
              }
            >
              {title}
            </h1>
            {description ? (
              <div className="text-sm text-muted-foreground mt-0.5">{description}</div>
            ) : null}
          </div>
        </div>

        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </div>

      {toolbar ? <div className="mb-4">{toolbar}</div> : null}

      {/* 页面内区块节奏：顶层区块间距统一 24px（space-y-6）。
          单块页面不受影响；多块页面不再各自用 mb-* 拼间距。 */}
      <div className="space-y-6">{children}</div>
    </>
  )

  return (
    <div className={`min-h-[calc(100vh-var(--navbar-height))] bg-background ${className}`.trim()}>
      {width === 'bleed' ? (
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 md:py-6">{body}</div>
      ) : (
        <PageContainer variant={WIDTH_TO_VARIANT[width]} className="py-4 md:py-6">
          {body}
        </PageContainer>
      )}
    </div>
  )
}

export default PageShell
