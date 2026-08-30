'use client'

import { Edit, Trash2 } from 'lucide-react'
import { type Column } from '@/components/admin'
import { formatDate } from '@/lib/utils'
import {
  OBJECTIVE_QUESTION_TYPE_LABELS,
  OBJECTIVE_QUESTION_TYPE_TAG_CLASSES,
} from '@/lib/objective-question/types'
import type { ObjectiveQuestionRow } from '../_types'

/** 客观题难度（简单/中等/困难）→ difficulty-tag 样式类（客观题三档与编程题八档体系独立） */
const OBJECTIVE_DIFFICULTY_TAG_CLASSES: Record<string, string> = {
  简单: 'difficulty-medium',
  中等: 'difficulty-medium-easy',
  困难: 'difficulty-hard',
}

/** 路由器最小接口（避免依赖 next 内部类型路径） */
interface RouterLike {
  push: (href: string) => void
}

/**
 * 构造客观题表格的列定义。
 * - 编辑：跳转 /admin/objective-questions/[id]/edit
 * - 删除：回调触发确认（由列表页处理被引用的 400 提示）
 */
export function buildObjectiveQuestionColumns(
  router: RouterLike,
  onDelete: (question: ObjectiveQuestionRow) => void
): Column<ObjectiveQuestionRow>[] {
  return [
    {
      key: 'questionNumber',
      label: '题号',
      className: 'whitespace-nowrap',
      render: (value) => (
        <span className="font-mono text-sm font-medium text-muted-foreground">
          {(value as string) || '—'}
        </span>
      ),
    },
    {
      key: 'type',
      label: '题型',
      render: (value) => {
        const type = value as ObjectiveQuestionRow['type']
        return (
          <span className={`tag ${OBJECTIVE_QUESTION_TYPE_TAG_CLASSES[type]} whitespace-nowrap`}>
            {OBJECTIVE_QUESTION_TYPE_LABELS[type]}
          </span>
        )
      },
    },
    {
      key: 'title',
      label: '题干',
      render: (value) => (
        <span
          className="block max-w-md truncate text-foreground"
          title={value as string}
        >
          {value as string}
        </span>
      ),
    },
    {
      key: 'difficulty',
      label: '难度',
      render: (value) => {
        const difficulty = value as string
        const tagClass = OBJECTIVE_DIFFICULTY_TAG_CLASSES[difficulty] || ''
        return tagClass ? (
          <span className={`difficulty-tag ${tagClass} whitespace-nowrap`}>
            {difficulty}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{difficulty}</span>
        )
      },
    },
    {
      key: 'tags',
      label: '标签',
      render: (value) => {
        const tags = (value as string[]) || []
        if (tags.length === 0) {
          return <span className="text-sm text-muted-foreground">—</span>
        }
        return (
          <div className="flex flex-wrap items-center gap-1">
            {tags.slice(0, 3).map((tag, idx) => (
              <span
                key={idx}
                className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{tags.length - 3}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'usageCount',
      label: '引用数',
      render: (value) => {
        const count = typeof value === 'number' ? value : 0
        return (
          <span
            className={`text-sm font-medium ${
              count > 0 ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {count}
          </span>
        )
      },
    },
    {
      key: 'updatedAt',
      label: '更新时间',
      render: (value) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(value as string)}
        </span>
      ),
    },
    {
      key: 'id' as keyof ObjectiveQuestionRow,
      label: '操作',
      render: (_value, question) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/admin/objective-questions/${question.id}/edit`)
            }}
            className="p-2.5 text-primary hover:bg-primary/5 rounded-lg transition-colors"
            title="编辑"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(question)
            }}
            className="p-2.5 text-error hover:bg-error/10 rounded-lg transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ]
}
