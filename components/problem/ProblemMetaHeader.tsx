'use client'

/**
 * 题目元信息头部（作业详情页：渲染于代码编辑器顶部）
 * 默认紧凑单行：时限 / 内存 / 难度；标签可折叠。
 */
import { useState } from 'react'
import { Timer, MemoryStick, ChevronDown, ChevronUp } from 'lucide-react'
import { getDifficultyColor } from '@/lib/status'

export interface ProblemMetaHeaderProps {
  timeLimit: number
  memoryLimit: number
  tags?: string[]
  difficulty: string
}

const TAG_COLLAPSE_THRESHOLD = 3

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
    <div className="px-4 py-2.5 space-y-1.5 bg-muted/30">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Timer className="w-3.5 h-3.5" />
          {timeLimit}ms
        </span>
        <span className="inline-flex items-center gap-1">
          <MemoryStick className="w-3.5 h-3.5" />
          {memoryLimit}MB
        </span>
        <span className={`difficulty-tag ${getDifficultyColor(difficulty)}`}>
          {difficulty}
        </span>
      </div>

      {hasTags && (
        <div className="flex flex-wrap items-center gap-1">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-muted/60 text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {needsCollapse && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[11px] text-primary-light hover:bg-primary/10 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
            >
              {expanded ? (
                <>
                  收起 <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  +{hiddenCount} <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
