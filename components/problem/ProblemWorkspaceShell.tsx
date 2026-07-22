'use client'

import { ReactNode } from 'react'

/**
 * ProblemWorkspaceShell
 *
 * 题目工作台的两栏布局壳子：
 *  ┌─────────────────────────────────────┐
 *  │  ┌──────── 左栏 ─────────┐ ┌─────┐ │
 *  │  │  Tab 栏 (可选)        │ │ 右栏│ │
 *  │  │  ─────────────────── │ │ 内  │ │
 *  │  │  leftPanel           │ │ 容  │ │
 *  │  │                      │ │     │ │
 *  │  └──────────────────────┘ └─────┘ │
 *  └─────────────────────────────────────┘
 *
 * 行为约定（与原 app/problem/[id]/page.tsx 内联实现一致）：
 *  - 桌面 (lg+)：两栏并排，右栏 sticky 顶 72px（Navbar 56px + 16px 呼吸）
 *  - 移动端：单列堆叠；当 codeMode=true 时仅显示右栏（编辑器优先），
 *    否则仅显示左栏（题目详情优先），与原页面保持一致
 *  - 左栏采用 card-flat（鼠标移上去不浮动），与"阅读优先"语义匹配
 *  - 右栏采用 card-static（保留轻微 hover 反馈），与"可操作区"语义匹配
 *
 * 调用方负责：tab 状态、内容组件、提交流程、WebSocket 等所有业务逻辑。
 * 调用方只需关心：要渲染什么内容放在哪一边。
 */

interface ProblemWorkspaceShellProps {
  /**
   * 左栏头部 Tab 栏内容（按钮组等）。
   * 不传则不显示顶部 Tab 行，左栏直接渲染 leftPanel。
   */
  leftHeader?: ReactNode
  /** 左栏主体内容：题目详情 / 题解 / 提交记录 / 统计等 */
  leftPanel: ReactNode
  /** 右栏头部内容（标题行，如 "提交代码"） */
  rightHeader?: ReactNode
  /** 右栏主体内容：代码编辑器、提交按钮、运行测试等 */
  rightPanel: ReactNode

  /**
   * 代码编辑器优先模式。
   * true 时桌面端同时显示两栏，但移动端只显示右栏（编辑优先）。
   * false 时移动端只显示左栏（阅读优先）。
   * 原页面行为：activeTab === 'code' 时仅显示右栏。
   */
  codeMode?: boolean
}

export default function ProblemWorkspaceShell({
  leftHeader,
  leftPanel,
  rightHeader,
  rightPanel,
  codeMode = false,
}: ProblemWorkspaceShellProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 items-start">
      {/* 左栏：题面 / 题解 / 提交记录 / 统计 */}
      <div
        className={`card-flat rounded-lg overflow-hidden ${codeMode ? 'hidden lg:block' : ''}`}
      >
        {leftHeader && (
          <div className="flex border-b border-border overflow-x-auto">
            {leftHeader}
          </div>
        )}
        <div className="p-6">{leftPanel}</div>
      </div>

      {/* 右栏：提交代码（宽屏 sticky 顶 72px = Navbar 56px + 16px 呼吸） */}
      <div
        className={`lg:sticky lg:top-[72px] ${codeMode ? '' : 'hidden lg:block'}`}
      >
        <div className="card-static rounded-lg overflow-hidden">
          {rightHeader && (
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted">
              {rightHeader}
            </div>
          )}
          <div className="p-4 space-y-3">{rightPanel}</div>
        </div>
      </div>
    </div>
  )
}