'use client'

import { useState, useEffect } from 'react'
import { Download, FileCode, FileText, X, Loader2, Check } from 'lucide-react'

interface ExportProblemsModalProps {
  onClose: () => void
  // 当前选中的题目 ID 列表（来自 DataTable 的勾选行）
  selectedIds: string[]
  // 全部题目数量（用于显示"全部题目"选项的提示文案）
  totalCount: number
}

/**
 * 批量导出题目弹窗
 *
 * 支持两种导出模式：
 *   - DSOJ 标准题包 ZIP（含题面、测试点、标程）
 *   - CSV 元数据报表
 *
 * 通过 window.location.href 触发浏览器下载，
 * 不需要 fetchWithCookie，浏览器会自动携带 cookie。
 */
export function ExportProblemsModal({
  onClose,
  selectedIds,
  totalCount,
}: ExportProblemsModalProps) {
  const [mode, setMode] = useState<'dsoj' | 'csv'>('dsoj')
  const [scope, setScope] = useState<'selected' | 'all' | 'filtered'>(
    selectedIds.length > 0 ? 'selected' : 'all'
  )
  const [includeStdCode, setIncludeStdCode] = useState(true)
  const [includeTestCases, setIncludeTestCases] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  // ESC 键关闭弹窗（导出中不允许）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !exporting) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [exporting, onClose])

  const handleClose = () => {
    if (exporting) return
    onClose()
  }

  // 点击遮罩关闭（导出中不允许）
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (exporting) return
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleExport = async () => {
    setError('')
    setExporting(true)
    try {
      let url: string
      if (mode === 'csv') {
        url = '/api/admin/problems/export'
      } else {
        // DSOJ
        const params = new URLSearchParams()
        params.set('format', 'dsoj')
        if (scope === 'selected' && selectedIds.length > 0) {
          params.set('ids', selectedIds.join(','))
        }
        // scope === 'all' 或 'filtered' 都不传 ids（导出全部）
        params.set('includeStdCode', String(includeStdCode))
        params.set('includeTestCases', String(includeTestCases))
        url = `/api/admin/problems/export?${params.toString()}`
      }
      // 触发浏览器下载
      window.location.href = url
      // 短暂延迟后关闭弹窗（让浏览器开始下载）
      setTimeout(() => {
        onClose()
      }, 500)
    } catch (err) {
      setError('网络错误，请稍后重试')
    } finally {
      setExporting(false)
    }
  }

  // 按钮禁用条件
  const isDisabled =
    exporting ||
    (mode === 'dsoj' && scope === 'selected' && selectedIds.length === 0) ||
    (mode === 'csv' && totalCount === 0)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4"
      onClick={handleOverlayClick}
    >
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10">
              <Download className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">批量导出题目</h3>
              <p className="text-xs text-muted-foreground">
                DSOJ 标准题包 ZIP / CSV 报表
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={exporting}
            className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* 模式选择 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              导出格式
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* DSOJ 题包 ZIP */}
              <button
                type="button"
                onClick={() => {
                  setMode('dsoj')
                  setError('')
                }}
                className={`relative p-3 rounded-lg border text-left transition-all ${
                  mode === 'dsoj'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted'
                }`}
              >
                {mode === 'dsoj' && (
                  <Check className="absolute top-2 right-2 w-4 h-4 text-primary" />
                )}
                <div className="flex items-center gap-2 mb-1">
                  <FileCode
                    className={`w-4 h-4 ${
                      mode === 'dsoj' ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  <span className="font-medium text-foreground text-sm">
                    DSOJ 题包 ZIP
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  完整题包格式，含题面、测试点、标程
                </p>
              </button>

              {/* CSV 报表 */}
              <button
                type="button"
                onClick={() => {
                  setMode('csv')
                  setError('')
                }}
                className={`relative p-3 rounded-lg border text-left transition-all ${
                  mode === 'csv'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted'
                }`}
              >
                {mode === 'csv' && (
                  <Check className="absolute top-2 right-2 w-4 h-4 text-primary" />
                )}
                <div className="flex items-center gap-2 mb-1">
                  <FileText
                    className={`w-4 h-4 ${
                      mode === 'csv' ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  <span className="font-medium text-foreground text-sm">CSV 报表</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  题目元数据表格（ID / 标题 / 来源 / 提交数 / AC 数）
                </p>
              </button>
            </div>
          </div>

          {/* DSOJ 模式选项 */}
          {mode === 'dsoj' && (
            <div className="space-y-3 p-4 rounded-lg bg-muted/50 border border-border">
              {/* 导出范围 */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  导出范围
                </label>
                <div className="space-y-2">
                  {/* 选中题目 */}
                  <label
                    className={`flex items-start gap-2 p-2 rounded-lg border transition-colors ${
                      scope === 'selected'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted'
                    } ${
                      selectedIds.length === 0
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="export-scope"
                      value="selected"
                      checked={scope === 'selected'}
                      onChange={() => setScope('selected')}
                      disabled={selectedIds.length === 0}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <div className="text-foreground font-medium">
                        选中题目 ({selectedIds.length} 个)
                      </div>
                      {selectedIds.length === 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          未选择题目
                        </div>
                      )}
                    </div>
                  </label>

                  {/* 全部题目 */}
                  <label
                    className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                      scope === 'all'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name="export-scope"
                      value="all"
                      checked={scope === 'all'}
                      onChange={() => setScope('all')}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <div className="text-foreground font-medium">
                        全部题目 ({totalCount} 个)
                      </div>
                    </div>
                  </label>

                  {/* 按筛选条件（当前禁用） */}
                  <label className="flex items-start gap-2 p-2 rounded-lg border opacity-50 cursor-not-allowed">
                    <input
                      type="radio"
                      name="export-scope"
                      value="filtered"
                      checked={scope === 'filtered'}
                      onChange={() => setScope('filtered')}
                      disabled
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <div className="text-foreground font-medium">按筛选条件</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        该功能将在筛选功能上线后启用
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 包含内容 */}
              <div className="border-t border-border pt-3">
                <label className="block text-sm font-medium text-foreground mb-2">
                  包含内容
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={includeStdCode}
                      onChange={e => setIncludeStdCode(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-foreground">
                      包含标程代码 (std.cpp)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={includeTestCases}
                      onChange={e => setIncludeTestCases(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm text-foreground">
                      包含测试点 (testcases/)
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* CSV 模式提示 */}
          {mode === 'csv' && (
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground leading-relaxed">
                导出全部题目的元数据 CSV 报表，包含字段：ID、标题、来源、创建时间、更新时间、提交数、AC 数
              </p>
            </div>
          )}

          {/* 错误信息 */}
          {error && (
            <div className="bg-error/10 border border-error/30 text-error px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-background border-t border-border px-6 py-4 flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={exporting}
            className="btn btn-ghost"
          >
            {exporting ? '关闭' : '取消'}
          </button>
          <button
            onClick={handleExport}
            disabled={isDisabled}
            className="btn btn-primary flex items-center gap-2"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                导出中...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                开始导出
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
