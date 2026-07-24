'use client'

import type { ReactNode } from 'react'

/**
 * 管理后台页面宽度外壳
 *
 * 主区域已有侧栏 + 统一内边距；本组件约束内容最大宽度，避免超宽屏表单/列表被拉散。
 *
 * - list  1440px  表格列表、仪表盘
 * - wide  1280px  多区块编辑（题目编辑、测试点、题单）
 * - form  1024px  设置、公告、竞赛编辑、分类等表单
 * - full  不限宽（极少用）
 */
export type AdminPageWidth = 'list' | 'wide' | 'form' | 'full'

const WIDTH_CLASS: Record<AdminPageWidth, string> = {
  list: 'max-w-page-workspace',
  wide: 'max-w-page-full',
  form: 'max-w-page-standard',
  full: '',
}

export function AdminPageShell({
  children,
  width = 'list',
  className = '',
}: {
  children: ReactNode
  width?: AdminPageWidth
  className?: string
}) {
  return (
    <div className={['w-full mx-auto', WIDTH_CLASS[width], className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}
