'use client'

/**
 * components/admin/AdminCreateTrainingModal.tsx
 * 管理后台 - 新建题单（模态窗形式）
 * 由 app/admin/trainings/create/page.tsx 改造而来，
 * 使用 CreateModalShell (variant="admin") 作为统一外壳。
 */
import { useCallback, useState } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useRouter } from 'next/navigation'
import { ListChecks, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchWithCookie } from '@/lib/api/base'
import { CreateModalShell, ProblemPicker } from '@/components/common'
import type { ProblemPickItem } from '@/lib/assignment/problemSelection'

type Problem = ProblemPickItem

const difficultyClass = (d: string) => {
  if (d?.includes('入门')) return 'bg-success/15 text-success border-success/30'
  if (d?.includes('普及')) return 'bg-warning/15 text-warning border-warning/30'
  if (d?.includes('提高') || d?.includes('省选') || d?.includes('NOI')) return 'bg-error/15 text-error border-error/30'
  return 'bg-primary/15 text-primary-light border-primary/30'
}

const defaultForm = () => ({
  title: '',
  description: '',
  categoryType: '' as '' | 'official' | 'contest',
  isPublic: true,
  status: 'published',
  isRecommended: false,
  tags: [] as string[],
  cover: '',
  problemIds: [] as string[],
})

export default function AdminCreateTrainingModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  /** 创建成功并跳转前可选刷新列表 */
  onCreated?: () => void
}) {
  const router = useRouter()
  const [problems, setProblems] = useState<Problem[]>([])
  const [problemsLoading, setProblemsLoading] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(false)

  const resetForm = useCallback(() => {
    setForm(defaultForm())
    setTagInput('')
    setProblems([])
  }, [])

  useDeferredEffect(() => {
    if (!open) return
    resetForm()
    // 循环分页加载全部公开题，供 ProblemPicker 客户端搜索/批量添加
    let cancelled = false
    const load = async () => {
      setProblemsLoading(true)
      try {
        const all: Problem[] = []
        let page = 1
        const pageSize = 50
        for (;;) {
          const res = await fetchWithCookie(`/api/problems?page=${page}&pageSize=${pageSize}`, { cache: 'no-store' })
          const data = await res.json()
          if (cancelled) return
          if (!data.success) break
          const batch = data.data?.problems || []
          all.push(...batch)
          const totalPages = data.data?.pagination?.totalPages ?? 1
          if (page >= totalPages || batch.length === 0) break
          page += 1
        }
        if (!cancelled) setProblems(all)
      } catch {
        if (!cancelled) setProblems([])
      } finally {
        if (!cancelled) setProblemsLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [open, resetForm])

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !form.tags.includes(t)) {
      setForm(f => ({ ...f, tags: [...f.tags, t] }))
    }
    setTagInput('')
  }

  const removeTag = (t: string) => {
    setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))
  }

  const handleProblemsChange = (ids: string[]) => {
    setForm(f => ({ ...f, problemIds: ids }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title || !form.description || !form.categoryType) {
      toast.error('请填写标题、描述、分类')
      return
    }
    setLoading(true)
    try {
      const res = await fetchWithCookie('/api/trainings', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          categoryType: form.categoryType || null,
          tags: form.tags,
          cover: form.cover || null,
          problemIds: form.problemIds,
          status: 'published',
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('已发布')
        onCreated?.()
        onClose()
        router.push(`/admin/trainings/${data.data.id}`)
      } else {
        toast.error(data.error || '创建失败')
      }
    } catch {
      toast.error('网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <CreateModalShell
      open={open}
      onClose={onClose}
      title="创建题单"
      icon={ListChecks}
      labelledById="admin-create-training-title"
      variant="admin"
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {/* 标题 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              标题 <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-colors"
              placeholder="例：动态规划入门"
              maxLength={100}
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              描述 <span className="text-error">*</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-colors resize-y"
              placeholder="题单介绍（支持换行）"
            />
          </div>

          {/* 分类 + 封面 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                分类 <span className="text-error">*</span>
              </label>
              <div className="flex items-center gap-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="categoryType"
                    value="official"
                    checked={form.categoryType === 'official'}
                    onChange={() => setForm(f => ({ ...f, categoryType: 'official' }))}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-foreground">官方</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="categoryType"
                    value="contest"
                    checked={form.categoryType === 'contest'}
                    onChange={() => setForm(f => ({ ...f, categoryType: 'contest' }))}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm text-foreground">竞赛</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">封面 URL</label>
              <input
                type="text"
                value={form.cover}
                onChange={e => setForm(f => ({ ...f, cover: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="可选"
              />
            </div>
          </div>

          {/* 标签 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">标签</label>
            <div className="flex flex-wrap items-center gap-1.5 mb-2 min-h-[24px]">
              {form.tags.length === 0 ? (
                <span className="text-xs text-muted-foreground">暂无标签</span>
              ) : (
                form.tags.map(t => (
                  <span key={t} className="tag tag-primary inline-flex items-center gap-1 text-xs">
                    {t}
                    <button type="button" onClick={() => removeTag(t)} className="hover:text-error" aria-label={`删除标签 ${t}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                className="flex-1 px-3 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
                placeholder="输入标签后回车（含竞赛/CSP/NOIP/真题 等有助于归入竞赛分类）"
              />
              <button
                type="button"
                onClick={addTag}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="添加标签"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 公开 / 推荐 */}
          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary"
              />
              <span className="text-sm text-foreground">公开</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isRecommended}
                onChange={e => setForm(f => ({ ...f, isRecommended: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary"
              />
              <span className="text-sm text-foreground">推荐到首页</span>
            </label>
          </div>

          {/* 题目选择 */}
          <div className="card-static p-4 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">题目列表</h2>
              <span className="text-sm text-muted-foreground">
                共 {problems.length} 题 · 已选 {form.problemIds.length}
              </span>
            </div>

            <ProblemPicker
              problems={problems}
              problemsLoading={problemsLoading}
              selectedIds={form.problemIds}
              onChange={handleProblemsChange}
              emptyText="暂无题目"
              renderSelectedItem={(p, index) => (
                <>
                  <span className="flex-shrink-0 w-7 text-center text-xs font-semibold text-primary-light">
                    #{index + 1}
                  </span>
                  <span className="flex-1 text-sm text-foreground truncate">
                    {p.problemNumber ? (
                      <span className="text-muted-foreground">[{p.problemNumber}] </span>
                    ) : null}
                    {p.title}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 ${difficultyClass(p.difficulty)}`}>
                    {p.difficulty}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleProblemsChange(form.problemIds.filter(id => id !== p.id))}
                    className="p-1 rounded text-muted-foreground hover:text-error hover:bg-error/10 flex-shrink-0"
                    title="移除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}
            />
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
          <button type="submit" disabled={loading} className="btn btn-primary flex-1">
            {loading ? '创建中…' : '创建题单'}
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            取消
          </button>
        </div>
      </form>
    </CreateModalShell>
  )
}
