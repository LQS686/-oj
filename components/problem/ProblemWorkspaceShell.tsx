'use client'

import { ReactNode } from 'react'

/**
 * ProblemWorkspaceShell
 *
 * 题目工作台的布局壳子，支持双栏 / 三栏两种模式：
 *
 *  双栏模式（主题库用，不传 leftSelector）：
 *  ┌─────────────────────────────────────┐
 *  │  ┌──────── 左栏 ─────────┐ ┌─────┐ │
 *  │  │  Tab 栏 (可选)        │ │ 右栏│ │
 *  │  │  ─────────────────── │ │ 内  │ │
 *  │  │  leftPanel           │ │ 容  │ │
 *  │  │                      │ │     │ │
 *  │  └──────────────────────┘ └─────┘ │
 *  └─────────────────────────────────────┘
 *
 *  三栏模式（作业用，传入 leftSelector）：
 *  ┌──────────────────────────────────────────────────┐
 *  │ ┌────┐ ┌─────── 中栏 ───────┐ ┌──── 右栏 ────┐ │
 *  │ │题号│ │ Tab 栏 (可选)      │ │ metaHeader  │ │
 *  │ │轨  │ │ ───────────────── │ │ rightHeader │ │
 *  │ │    │ │ leftPanel         │ │ rightPanel  │ │
 *  │ └────┘ └───────────────────┘ └─────────────┘ │
 *  └──────────────────────────────────────────────────┘
 *
 * 行为约定：
 *  - 桌面 (lg+)：
 *      · 双栏：grid-cols-[1fr_420px]
 *      · 三栏：题号轨收窄 + 中栏优先 + 右栏约 24rem
 *      · 右栏 sticky 顶 72px（Navbar 56px + 16px 呼吸）
 *  - 移动端：单列堆叠
 *  - dense：作业页压缩内边距，把垂直空间留给题面与编辑器
 */

interface ProblemWorkspaceShellProps {
  leftHeader?: ReactNode
  leftPanel: ReactNode
  rightHeader?: ReactNode
  rightPanel: ReactNode
  codeMode?: boolean
  leftSelector?: ReactNode
  metaHeader?: ReactNode
  /** 作业等三栏场景：压缩内边距与栏宽 */
  dense?: boolean
}

export default function ProblemWorkspaceShell({
  leftHeader,
  leftPanel,
  rightHeader,
  rightPanel,
  codeMode = false,
  leftSelector,
  metaHeader,
  dense = false,
}: ProblemWorkspaceShellProps) {
  const panelPad = dense ? 'p-4 lg:p-5' : 'p-6'
  const rightPad = dense ? 'p-3 space-y-2.5' : 'p-4 space-y-3'

  if (leftSelector) {
    return (
      <div
        className={`grid grid-cols-1 gap-3 items-start ${
          dense
            ? 'lg:grid-cols-[5.25rem_minmax(0,1fr)_minmax(20rem,24rem)] xl:grid-cols-[5.25rem_minmax(0,1fr)_minmax(22rem,26rem)]'
            : 'lg:grid-cols-[220px_minmax(0,1fr)_440px]'
        }`}
      >
        <div
          className={`card-static rounded-lg overflow-hidden lg:sticky lg:top-[72px] ${
            codeMode ? 'hidden lg:block' : 'lg:block'
          }`}
        >
          {leftSelector}
        </div>

        <div
          className={`card-flat rounded-lg overflow-hidden min-w-0 ${
            codeMode ? 'hidden lg:block' : ''
          }`}
        >
          {leftHeader && (
            <div className="flex border-b border-border overflow-x-auto">{leftHeader}</div>
          )}
          <div className={panelPad}>{leftPanel}</div>
        </div>

        <div className={`lg:sticky lg:top-[72px] min-w-0 ${codeMode ? '' : 'hidden lg:block'}`}>
          <div className="card-static rounded-lg overflow-hidden">
            {metaHeader && <div className="border-b border-border">{metaHeader}</div>}
            {rightHeader && (
              <div
                className={`flex items-center gap-2 border-b border-border bg-muted ${
                  dense ? 'px-4 py-2.5' : 'px-5 py-3.5'
                }`}
              >
                {rightHeader}
              </div>
            )}
            <div className={rightPad}>{rightPanel}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
      <div
        className={`card-flat rounded-lg overflow-hidden min-w-0 ${
          codeMode ? 'hidden lg:block' : ''
        }`}
      >
        {leftHeader && (
          <div className="flex border-b border-border overflow-x-auto">{leftHeader}</div>
        )}
        <div className={panelPad}>{leftPanel}</div>
      </div>

      <div className={`lg:sticky lg:top-[72px] min-w-0 ${codeMode ? '' : 'hidden lg:block'}`}>
        <div className="card-static rounded-lg overflow-hidden">
          {metaHeader && <div className="border-b border-border">{metaHeader}</div>}
          {rightHeader && (
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted">
              {rightHeader}
            </div>
          )}
          <div className={rightPad}>{rightPanel}</div>
        </div>
      </div>
    </div>
  )
}
