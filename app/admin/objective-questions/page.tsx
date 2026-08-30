'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, AdminPageShell } from '@/components/admin'
import { useDialog, RouteSuspenseFallback } from '@/components/common'
import { ListChecks, Plus, SearchX } from 'lucide-react'
import { useObjectiveQuestionList } from './_hooks/useObjectiveQuestionList'
import { ObjectiveQuestionFilterBar } from './_components/ObjectiveQuestionFilterBar'
import { buildObjectiveQuestionColumns } from './_components/objectiveQuestionColumns'
import {
  DEFAULT_FILTERS,
  filtersToQueryParams,
  queryParamsToFilters,
  countActiveFilters,
  type ObjectiveQuestionFilters,
} from './_utils'
import type { ObjectiveQuestionRow } from './_types'

function AdminObjectiveQuestionsPageContent() {
  const dialog = useDialog()
  const router = useRouter()

  // 筛选条件：初始值从 URL query string 恢复（支持分享 / 刷新保留筛选状态）
  // 必须先于 useObjectiveQuestionList 定义（hook 依赖 filters 构造请求参数）
  const [filters, setFilters] = useState<ObjectiveQuestionFilters>(() => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS
    // 从 URL 恢复筛选条件
    const params = new URLSearchParams(window.location.search)
    return queryParamsToFilters(params)
  })

  const {
    questions,
    total,
    loading,
    initialLoading,
    error,
    deleteQuestion,
    page,
    pageSize,
    setPage,
    setPageSize,
  } = useObjectiveQuestionList(filters)

  // 部分更新筛选条件（保持其他维度不变）
  // 筛选变化时重置到第 1 页，避免停留在空页
  const handleFiltersChange = useCallback(
    (patch: Partial<ObjectiveQuestionFilters>) => {
      setFilters(prev => ({ ...prev, ...patch }))
      setPage(1)
    },
    [setPage]
  )

  // 重置筛选条件
  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [setPage])

  // 筛选条件 URL 持久化：filters 变化时同步到 URL（用 replace 避免污染历史栈）
  useEffect(() => {
    const params = filtersToQueryParams(filters)
    const queryString = new URLSearchParams(params).toString()
    const newUrl = queryString
      ? `?${queryString}`
      : '/admin/objective-questions'
    const currentSearch =
      typeof window !== 'undefined' ? window.location.search : ''
    const currentPath = currentSearch
      ? `/admin/objective-questions${currentSearch}`
      : '/admin/objective-questions'
    if (currentPath !== newUrl) {
      router.replace(newUrl, { scroll: false })
    }
  }, [filters, router])

  // 删除单题：确认后调用 DELETE；被作业引用时展示后端错误信息
  const handleDelete = useCallback(
    async (question: ObjectiveQuestionRow) => {
      const ok = await dialog.confirm({
        message: `确定要删除 ${
          question.questionNumber || '该题目'
        } 吗？此操作无法撤销。`,
        tone: 'warning',
        confirmText: '删除',
        confirmVariant: 'destructive',
      })
      if (!ok) return
      const result = await deleteQuestion(question.id)
      if (!result.ok) {
        await dialog.alert({ tone: 'error', message: result.error || '删除失败' })
      }
    },
    [dialog, deleteQuestion]
  )

  const columns = buildObjectiveQuestionColumns(router, handleDelete)

  // 空状态区分：有筛选条件时显示"无匹配"（提供清除筛选），否则显示"暂无题目"（提供创建入口）
  const hasActiveFilters = countActiveFilters(filters) > 0
  const isEmpty = !loading && !initialLoading && questions.length === 0

  if (initialLoading) {
    return (
      <AdminPageShell width="list" className="space-y-6">
        <div className="flex items-center justify-end gap-2">
          <div className="h-10 w-28 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="h-20 rounded-xl bg-muted/70 animate-pulse" />
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="h-11 bg-muted/60 border-b border-border" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-12 border-b border-border last:border-0 bg-card flex items-center gap-4 px-4"
            >
              <div className="h-4 w-16 rounded bg-muted animate-pulse" />
              <div className="h-4 flex-1 max-w-md rounded bg-muted/70 animate-pulse" />
              <div className="h-4 w-16 rounded bg-muted/50 animate-pulse ml-auto" />
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground">正在加载客观题列表…</p>
      </AdminPageShell>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-error text-lg mb-2">{error}</p>
          {error.includes('权限') && <p className="text-muted-foreground">正在跳转...</p>}
        </div>
      </div>
    )
  }

  return (
    <AdminPageShell width="list" className="space-y-6">
      {/* 页头：标题 + 描述 + 创建入口 */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            客观题管理
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理单选、多选、判断、填空题题库，供班级作业引用
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/objective-questions/create')}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          创建题目
        </button>
      </div>

      <ObjectiveQuestionFilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onReset={handleReset}
      />

      {/* 统计行：共 N 题 + 当前筛选激活数气泡 */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          共 <span className="font-medium text-foreground">{total}</span> 题
        </p>
        {hasActiveFilters && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            已启用 {countActiveFilters(filters)} 项筛选
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="card px-6 py-16 text-center">
          <ListChecks className="w-10 h-10 mx-auto text-muted-foreground/50" />
          {hasActiveFilters ? (
            <>
              <p className="mt-3 text-foreground font-medium">
                没有找到匹配的客观题
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                没有符合当前筛选条件的题目，请调整筛选条件
              </p>
              <button
                onClick={handleReset}
                className="btn btn-ghost mt-4 gap-1.5"
              >
                <SearchX className="w-4 h-4" />
                清除筛选
              </button>
            </>
          ) : (
            <>
              <p className="mt-3 text-foreground font-medium">暂无客观题</p>
              <p className="mt-1 text-sm text-muted-foreground">
                题库还是空的，创建第一道客观题吧
              </p>
              <button
                onClick={() => router.push('/admin/objective-questions/create')}
                className="btn btn-primary mt-4 gap-1.5"
              >
                <Plus className="w-4 h-4" />
                创建第一道题
              </button>
            </>
          )}
        </div>
      ) : (
        <DataTable<ObjectiveQuestionRow>
          data={questions}
          columns={columns}
          idKey="id"
          loading={loading}
          emptyMessage={
            hasActiveFilters
              ? '没有找到匹配的客观题，请调整筛选条件'
              : '暂无客观题，点击"创建题目"添加第一道题目'
          }
          onRowClick={(row) =>
            router.push(`/admin/objective-questions/${row.id}/edit`)
          }
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size)
              setPage(1)
            },
          }}
        />
      )}
    </AdminPageShell>
  )
}

export default function AdminObjectiveQuestionsPage() {
  return (
    <Suspense fallback={<RouteSuspenseFallback label="加载中..." />}>
      <AdminObjectiveQuestionsPageContent />
    </Suspense>
  )
}
