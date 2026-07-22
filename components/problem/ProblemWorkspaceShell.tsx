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
 *  │ ┌──────┐ ┌────── 中栏 ──────┐ ┌──── 右栏 ────┐ │
 *  │ │ 左栏 │ │ Tab 栏 (可选)    │ │ metaHeader  │ │
 *  │ │ 选择 │ │ ─────────────── │ │ rightHeader │ │
 *  │ │ 器   │ │ leftPanel       │ │ rightPanel  │ │
 *  │ │      │ │                 │ │             │ │
 *  │ └──────┘ └─────────────────┘ └─────────────┘ │
 *  └──────────────────────────────────────────────────┘
 *
 * 行为约定：
 *  - 桌面 (lg+)：
 *      · 双栏：grid-cols-[1fr_420px]
 *      · 三栏：grid-cols-[220px_1fr_440px]
 *      · 右栏 sticky 顶 72px（Navbar 56px + 16px 呼吸）
 *  - 移动端：单列堆叠
 *      · 双栏：codeMode=true 仅显示右栏，否则仅显示左栏（保持原页面行为）
 *      · 三栏：codeMode=true 仅显示右栏（隐藏左栏 + 中栏），
 *        否则显示左栏 + 中栏（隐藏右栏）；左栏在移动端作为顶部水平滚动条
 *  - 双栏左栏 / 三栏中栏采用 card-flat（鼠标移上去不浮动），与"阅读优先"语义匹配
 *  - 三栏左栏 / 右栏采用 card-static（保留轻微 hover 反馈），与"可操作区"语义匹配
 *  - metaHeader 渲染于右栏 rightHeader 之上，作为独立的元信息行
 *
 * 调用方负责：tab 状态、内容组件、提交流程、WebSocket 等所有业务逻辑。
 * 调用方只需关心：要渲染什么内容放在哪一边。
 */

interface ProblemWorkspaceShellProps {
  /**
   * 左栏头部 Tab 栏内容（按钮组等）。
   * 不传则不显示顶部 Tab 行，左栏 / 中栏直接渲染 leftPanel。
   */
  leftHeader?: ReactNode
  /** 左栏 / 中栏主体内容：题目详情 / 题解 / 提交记录 / 统计等 */
  leftPanel: ReactNode
  /** 右栏头部内容（标题行，如 "提交代码"） */
  rightHeader?: ReactNode
  /** 右栏主体内容：代码编辑器、提交按钮、运行测试等 */
  rightPanel: ReactNode

  /**
   * 代码编辑器优先模式。
   * true 时桌面端同时显示所有栏，但移动端只显示右栏（编辑优先）。
   * false 时移动端只显示左栏（阅读优先）。
   * 原页面行为：activeTab === 'code' 时仅显示右栏。
   */
  codeMode?: boolean

  /**
   * 左栏选择器（作业用）。
   * 传入时切换为三栏布局：左栏 220px（leftSelector）+ 中栏 1fr（leftHeader + leftPanel）+ 右栏 440px。
   * 不传时为双栏布局（主题库用）。
   */
  leftSelector?: ReactNode

  /**
   * 右栏元信息头部（位于 rightHeader 之上）。
   * 通常用于渲染题目元信息（标题、难度、标签等）。
   * 仅当传入时渲染，容器为带下边框的独立行，由内部组件自带 padding。
   */
  metaHeader?: ReactNode
}

export default function ProblemWorkspaceShell({
  leftHeader,
  leftPanel,
  rightHeader,
  rightPanel,
  codeMode = false,
  leftSelector,
  metaHeader,
}: ProblemWorkspaceShellProps) {
  // 三栏模式：作业用，左栏选择器 + 中栏题面 + 右栏编辑器
  if (leftSelector) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_440px] gap-4 items-start">
        {/* 左栏：题目选择器（移动端作为顶部水平滚动条） */}
        <div
          className={`card-static rounded-lg overflow-hidden ${codeMode ? 'hidden lg:block' : 'lg:block'}`}
        >
          {leftSelector}
        </div>

        {/* 中栏：题面 / 题解 / 提交记录 / 统计 */}
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
            {metaHeader && (
              <div className="border-b border-border">{metaHeader}</div>
            )}
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

  // 双栏模式：主题库用，保持现有行为
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
          {metaHeader && (
            <div className="border-b border-border">{metaHeader}</div>
          )}
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
