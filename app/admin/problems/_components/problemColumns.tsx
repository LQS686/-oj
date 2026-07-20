'use client'

import { Edit, Trash2, Eye, EyeOff, Trophy, Database } from 'lucide-react'
import { type Column } from '@/components/admin'
import { getDifficultyColor } from '@/lib/status'
import { formatDate } from '@/lib/utils'
import type { Problem } from '../_types'

interface BuildProblemColumnsArgs {
  onToggleVisibility: (problemId: string, currentVisibility: string) => void
  onEdit: (problemId: string) => void
  onTestcases: (problemId: string) => void
  onDelete: (problem: Problem) => void
}

/**
 * 构造题目表格的列定义。操作列复用回调，避免闭包捕获 router。
 */
export function buildProblemColumns({
  onToggleVisibility,
  onEdit,
  onTestcases,
  onDelete,
}: BuildProblemColumnsArgs): Column<Problem>[] {
  return [
    {
      key: 'title',
      label: '题目',
      sortable: true,
      render: (_value, problem) => (
        <div className="flex items-center gap-2">
          {problem.problemNumber && (
            <span className="font-mono text-sm font-medium text-muted-foreground">
              {problem.problemNumber}
            </span>
          )}
          <span className="text-foreground font-medium">{problem.title}</span>
        </div>
      ),
    },
    {
      key: 'difficulty',
      label: '难度',
      sortable: true,
      render: (value) => (
        <span className={`difficulty-tag ${getDifficultyColor(value)}`}>
          {value}
        </span>
      ),
    },
    {
      key: 'tags',
      label: '标签',
      render: (value) => {
        const tags = (value as string[]) || []
        return (
          <div className="flex flex-wrap items-center gap-1">
            {tags.slice(0, 3).map((tag, idx) => (
              <span key={idx} className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {tag}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'visibility',
      label: '状态',
      render: (value, problem) => {
        const isPublic = value === 'public' || (!value && problem.isPublic)
        if (isPublic) return <span className="tag tag-success">公开</span>
        if (value === 'contest') return <span className="tag tag-info">竞赛</span>
        return <span className="tag">隐藏</span>
      },
    },
    {
      key: 'createdAt',
      label: '创建时间',
      sortable: true,
      render: (value) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(value)}
        </span>
      ),
    },
    {
      key: 'id' as keyof Problem,
      label: '操作',
      render: (_value, problem) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleVisibility(problem.id, problem.visibility || (problem.isPublic ? 'public' : 'private'))
            }}
            className={`p-2.5 rounded-lg transition-colors ${
              problem.visibility === 'public' || (!problem.visibility && problem.isPublic)
                ? 'text-secondary-light hover:bg-secondary/10'
                : problem.visibility === 'contest'
                ? 'text-accent-light hover:bg-accent/10'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            title="切换可见性"
          >
            {problem.visibility === 'public' || (!problem.visibility && problem.isPublic) ? (
              <Eye className="w-4 h-4" />
            ) : problem.visibility === 'contest' ? (
              <Trophy className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onTestcases(problem.id)
            }}
            className="p-2.5 text-primary hover:bg-primary/5 rounded-lg transition-colors"
            title="测试数据"
          >
            <Database className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit(problem.id)
            }}
            className="p-2.5 text-primary hover:bg-primary/5 rounded-lg transition-colors"
            title="编辑"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(problem)
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
