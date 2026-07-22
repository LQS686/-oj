'use client'

/**
 * 题目元信息头部（作业详情页三栏改造：渲染于代码编辑器顶部）
 *
 * 三行纵向排列：
 *   1. 时间限制 + 内存限制
 *   2. 标签列表（可选，标签数 > 阈值时支持折叠/展开）
 *   3. 难度标签
 */
import { useState } from 'react'
import { Timer, MemoryStick, ChevronDown, ChevronUp } from 'lucide-react'
import { getDifficultyColor } from '@/lib/status'

export interface ProblemMetaHeaderProps {
  timeLimit: number          // 毫秒
  memoryLimit: number        // MB
  tags?: string[]            // 可选，可能为空或不存在
  difficulty: string         // 例如 "入门"/"普及"/"提高" 等
}

// 折叠阈值：标签数超过此值时显示折叠按钮
const TAG_COLLAPSE_THRESHOLD = 4

export default function ProblemMetaHeader({
  timeLimit,
  memoryLimit,
  tags,
  difficulty,
}: ProblemMetaHeaderProps) {
  const [expanded, setExpanded] = useState(false)

  const hasTags = Array.isArray(tags) && tags.length > 0
  const needsCollapse = hasTags && tags!.length > TAG_COLLAPSE_THRESHOLD
  const visibleTags = needsCollapse && !expanded
    ? tags!.slice(0, TAG_COLLAPSE_THRESHOLD)
    : tags!
  const hiddenCount = needsCollapse ? tags!.length - TAG_COLLAPSE_THRESHOLD : 0

  return (
    <div className="space-y-2 px-5 py-3 border-b border-border bg-muted/30">
      {/* 第 1 行：时间限制 + 内存限制 */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 group">
          <Timer className="w-4 h-4 transition-colors duration-300 group-hover:text-primary-light" />
          <span>{timeLimit}ms</span>
        </span>
        <span className="inline-flex items-center gap-1.5 group">
          <MemoryStick className="w-4 h-4 transition-colors duration-300 group-hover:text-primary-light" />
          <span>{memoryLimit}MB</span>
        </span>
      </div>

      {/* 第 2 行：标签列表（仅在 tags 存在且非空时渲染） */}
      {hasTags && (
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary-light transition-colors"
            >
              {tag}
            </span>
          ))}
          {needsCollapse && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-0.5 text-xs text-primary-light hover:bg-primary/10 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
            >
              <span>+{hiddenCount}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          )}
          {needsCollapse && expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-0.5 text-xs text-primary-light hover:bg-primary/10 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
            >
              <span>收起</span>
              <ChevronUp className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* 第 3 行：难度标签 */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className={`difficulty-tag ${getDifficultyColor(difficulty)}`}>
          {difficulty}
        </span>
      </div>
    </div>
  )
}
