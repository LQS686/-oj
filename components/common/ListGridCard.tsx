import { cn } from '@/lib/utils'

/**
 * 题单 / 竞赛 / 班级列表统一卡片尺寸
 * 高度对齐原题单 grid 卡片（紧凑、底栏贴内容下方，中间不撑空白）
 */
export const LIST_GRID_CARD_HEIGHT_CLASS = 'h-[9.5rem]' // 152px 视觉高度

/** 宽屏最多 5 列，少量卡片时单卡更宽，避免 6 列空位 */
export const LIST_GRID_CLASS =
  'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-6'

/** 加载骨架与内容区同列规则，避免布局跳动 */
export const LIST_GRID_SKELETON_CLASS = LIST_GRID_CLASS

export const LIST_GRID_CARD_CLASS = cn(
  'card-static rounded-xl p-4 flex flex-col overflow-hidden',
  LIST_GRID_CARD_HEIGHT_CLASS,
  'hover:border-primary/30 transition-colors group'
)

export const LIST_GRID_CARD_TITLE =
  'text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary-light transition-colors'

export const LIST_GRID_CARD_META_ROW =
  'flex items-center justify-between gap-1 mb-2 flex-wrap shrink-0'

/** 上半区：标题/描述，超出截断（勿 flex-1，避免与固定高度叠加出大空白） */
export const LIST_GRID_CARD_MIDDLE = 'min-h-0 overflow-hidden'

export const LIST_GRID_CARD_FOOTER = 'shrink-0 text-xs text-muted-foreground'

export function listGridCardLinkClass(extra?: string) {
  return cn(LIST_GRID_CARD_CLASS, 'block', extra)
}
