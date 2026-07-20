'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable } from '@/components/admin'
import { fetchWithCookie } from '@/lib/api/base'
import { Plus, Upload } from 'lucide-react'
import { useProblemList } from './_hooks/useProblemList'
import { ProblemFilterBar } from './_components/ProblemFilterBar'
import { ProblemStatsRow } from './_components/ProblemStatsRow'
import { buildProblemColumns } from './_components/problemColumns'
import { DeleteProblemModal } from './_components/DeleteProblemModal'
import { ImportProblemsModal } from './_components/ImportProblemsModal'
import { filterProblems } from './_utils'
import type { Problem, BatchActionType } from './_types'

export default function AdminProblemsPage() {
  const router = useRouter()
  const { problems, loading, initialLoading, error, fetchProblems, toggleVisibility } = useProblemList()

  const [searchQuery, setSearchQuery] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingProblem, setDeletingProblem] = useState<Problem | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)

  const filteredProblems = filterProblems(problems, { searchQuery, difficultyFilter })

  const handleBatchAction = async (action: BatchActionType, selectedIds: string[]) => {
    if (selectedIds.length === 0) return
    if (action === 'delete' && !confirm(`确定要删除选中的 ${selectedIds.length} 个题目吗？此操作无法撤销。`)) return

    try {
      const response = await fetchWithCookie('/api/admin/problems/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ids: selectedIds
        })
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
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowImportModal(true)}
              className="btn btn-ghost flex items-center gap-2"
            >
              <Upload className="w-5 h-5" />
              批量导入
            </button>
            <button
              onClick={() => router.push('/admin/problems/create')}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              创建题目
            </button>
          </div>
        </div>

        <ProblemFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          difficultyFilter={difficultyFilter}
          onDifficultyFilterChange={setDifficultyFilter}
        />

        <ProblemStatsRow problems={problems} filteredCount={filteredProblems.length} />

        <DataTable<Problem>
          data={filteredProblems}
          columns={columns}
          idKey="id"
          loading={loading}
          emptyMessage={searchQuery || difficultyFilter !== 'all'
            ? '没有找到匹配的题目'
            : '暂无题目，点击"创建题目"添加第一道题目'}
          batchActions={batchActions}
          onRowClick={(row) => router.push(`/admin/problems/${row.id}/edit`)}
        />
      </div>

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
    </>
  )
}
