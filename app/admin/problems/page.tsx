'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DataTable, AdminPageShell } from '@/components/admin'
import { fetchWithCookie } from '@/lib/api/base'
import { PageLoading } from '@/components/common'
import AdminCreateProblemModal from '@/components/admin/AdminCreateProblemModal'
import { Download, Plus, Upload } from 'lucide-react'
import { useProblemList } from './_hooks/useProblemList'
import { ProblemFilterBar } from './_components/ProblemFilterBar'
import { ProblemStatsRow } from './_components/ProblemStatsRow'
import { buildProblemColumns } from './_components/problemColumns'
import { DeleteProblemModal } from './_components/DeleteProblemModal'
import { ImportProblemsModal } from './_components/ImportProblemsModal'
import { ExportProblemsModal } from './_components/ExportProblemsModal'
import {
  filterProblems,
  DEFAULT_FILTERS,
  filtersToQueryParams,
  queryParamsToFilters,
  countActiveFilters,
  type ProblemFilters,
} from './_utils'
import type { Problem, BatchActionType } from './_types'

function AdminProblemsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    problems,
    loading,
    initialLoading,
    error,
    fetchProblems,
    toggleVisibility,
    allTags,
    allSources,
  } = useProblemList()

  const [createOpen, setCreateOpen] = useState(false)

  // 支持 ?create=1 自动打开创建弹窗（外部跳转入口）
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateOpen(true)
      router.replace('/admin/problems', { scroll: false })
    }
  }, [searchParams, router])

  // 筛选条件：初始值从 URL query string 恢复（支持分享 / 刷新保留筛选状态）
  const [filters, setFilters] = useState<ProblemFilters>(() => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS
    // 从 URL 恢复筛选条件
    const params = new URLSearchParams(window.location.search)
    return queryParamsToFilters(params)
  })

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingProblem, setDeletingProblem] = useState<Problem | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  // DataTable 选中行的 ID 列表，用于批量导出
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // 部分更新筛选条件（保持其他维度不变）
  const handleFiltersChange = useCallback((patch: Partial<ProblemFilters>) => {
    setFilters(prev => ({ ...prev, ...patch }))
  }, [])

  // 重置筛选条件
  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
  }, [])

  // 筛选条件 URL 持久化：filters 变化时同步到 URL（用 replace 避免污染历史栈）
  useEffect(() => {
    const params = filtersToQueryParams(filters)
    const queryString = new URLSearchParams(params).toString()
    const newUrl = queryString ? `?${queryString}` : '/admin/problems'
    const currentSearch = typeof window !== 'undefined' ? window.location.search : ''
    const currentPath = currentSearch ? `/admin/problems${currentSearch}` : '/admin/problems'
    if (currentPath !== newUrl) {
      router.replace(newUrl, { scroll: false })
    }
  }, [filters, router])

  const filteredProblems = useMemo(
    () => filterProblems(problems, filters),
    [problems, filters]
  )

  const handleBatchAction = async (action: BatchActionType, selectedIds: string[]) => {
    if (selectedIds.length === 0) return
    if (action === 'delete' && !confirm(`确定要删除选中的 ${selectedIds.length} 个题目吗？此操作无法撤销。`)) return

    try {
      const response = await fetchWithCookie('/api/admin/problems/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // 前端 BatchActionType 与后端 action 的映射：
          //   publish   → action=visibility, visibility=public
          //   unpublish → action=visibility, visibility=private
          //   contest   → action=visibility, visibility=contest
          //   delete    → action=delete
          action: action === 'delete' ? 'delete' : 'visibility',
          problemIds: selectedIds,
          visibility:
            action === 'publish' ? 'public' : action === 'contest' ? 'contest' : 'private',
        }),
      })

      const data = await response.json()
      if (data.success) {
        fetchProblems()
      } else {
        alert('批量操作失败: ' + data.error)
      }
    } catch {
      alert('网络错误')
    }
  }

  const columns = buildProblemColumns({
    onToggleVisibility: toggleVisibility,
    onEdit: (id) => router.push(`/admin/problems/${id}/edit`),
    onTestcases: (id) => router.push(`/admin/problems/${id}/testcases`),
    onDelete: (problem) => {
      setDeletingProblem(problem)
      setShowDeleteModal(true)
    },
  })

  const batchActions = [
    { label: '公开', action: (ids: string[]) => handleBatchAction('publish', ids) },
    { label: '竞赛', action: (ids: string[]) => handleBatchAction('contest', ids) },
    { label: '隐藏', action: (ids: string[]) => handleBatchAction('unpublish', ids) },
    { label: '删除', action: (ids: string[]) => handleBatchAction('delete', ids), danger: true },
  ]

  // 空状态提示：有筛选条件时显示"无匹配"，否则显示"暂无题目"
  const hasActiveFilters = countActiveFilters(filters) > 0
  const emptyMessage = hasActiveFilters
    ? '没有找到匹配的题目，请调整筛选条件'
    : '暂无题目，点击"创建题目"添加第一道题目'

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
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
    <>
      <AdminPageShell width="list" className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowExportModal(true)}
              className="btn btn-ghost flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              批量导出
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="btn btn-ghost flex items-center gap-2"
            >
              <Upload className="w-5 h-5" />
              批量导入
            </button>
            <button
              onClick={() => setCreateOpen(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              创建题目
            </button>
          </div>
        </div>

        <ProblemFilterBar
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onReset={handleReset}
          allTags={allTags}
          allSources={allSources}
        />

        <ProblemStatsRow problems={problems} filteredProblems={filteredProblems} />

        <DataTable<Problem>
          data={filteredProblems}
          columns={columns}
          idKey="id"
          loading={loading}
          emptyMessage={emptyMessage}
          batchActions={batchActions}
          onRowClick={(row) => router.push(`/admin/problems/${row.id}/edit`)}
          onSelectionChange={setSelectedIds}
        />
      </AdminPageShell>

      {showDeleteModal && deletingProblem && (
        <DeleteProblemModal
          problem={deletingProblem}
          onClose={() => {
            setShowDeleteModal(false)
            setDeletingProblem(null)
          }}
          onSuccess={() => {
            setShowDeleteModal(false)
            setDeletingProblem(null)
            fetchProblems()
          }}
        />
      )}

      {showImportModal && (
        <ImportProblemsModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => fetchProblems()}
        />
      )}

      {showExportModal && (
        <ExportProblemsModal
          onClose={() => setShowExportModal(false)}
          selectedIds={selectedIds}
          totalCount={problems.length}
        />
      )}

      <AdminCreateProblemModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => fetchProblems()}
      />
    </>
  )
}

export default function AdminProblemsPage() {
  return (
    <Suspense fallback={<PageLoading label="加载中..." />}>
      <AdminProblemsPageContent />
    </Suspense>
  )
}
