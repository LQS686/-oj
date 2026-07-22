'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, Search, AlertCircle } from 'lucide-react'
import { CreateModalShell } from '@/components/common'
import { fetchWithCookie } from '@/lib/api/base'
import { DIFFICULTIES, DIFFICULTY_COLORS, migrateDifficulty, type Difficulty } from '@/lib/constants'

interface Problem {
  id: string
  title: string
  difficulty: string
  tags: string[]
}

type CreateMode = 'select' | 'new'

const defaultForm = () => ({
  title: '',
  description: '',
  difficulty: '普及' as Difficulty,
  tags: '',
  timeLimit: 1000,
  memoryLimit: 256,
})

export default function CreateClassProblemModal({
  open,
  onClose,
  onCreated,
  classId,
}: {
  open: boolean
  onClose: () => void
  onCreated?: () => void
  classId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<CreateMode>('select')
  const [formData, setFormData] = useState(defaultForm)

  // 搜索相关
  const [problems, setProblems] = useState<Problem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProblemId, setSelectedProblemId] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)

  const resetForm = useCallback(() => {
    setFormData(defaultForm())
    setMode('select')
    setProblems([])
    setSearchQuery('')
    setSelectedProblemId('')
    setSearchLoading(false)
    setError('')
  }, [])

  useEffect(() => {
    if (!open) return
    resetForm()
  }, [open, resetForm])

  const searchProblems = async () => {
    if (!searchQuery.trim()) {
      setError('请输入搜索关键词')
      return
    }
    try {
      setSearchLoading(true)
      setError('')
      const response = await fetchWithCookie(`/api/problems?search=${encodeURIComponent(searchQuery)}&pageSize=20`)
      const data = await response.json()
      if (data.success) {
        setProblems(data.data.problems || [])
        if (data.data.problems.length === 0) {
          setError('未找到相关题目')
        }
      } else {
        setError(data.error || '搜索失败')
      }
    } catch {
      setError('搜索失败，请重试')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'select') {
      if (!selectedProblemId) {
        setError('请选择一个题目')
        return
      }
    } else {
      if (!formData.title.trim() || !formData.description.trim()) {
        setError('请填写题目标题和描述')
        return
      }
    }

    try {
      setLoading(true)
      const body = mode === 'select'
        ? { type: 'existing', problemId: selectedProblemId }
        : {
            type: 'new',
            title: formData.title,
            description: formData.description,
            difficulty: formData.difficulty,
            tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
            timeLimit: formData.timeLimit,
            memoryLimit: formData.memoryLimit,
          }
      const response = await fetchWithCookie(`/api/classes/${classId}/problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (data.success) {
        onCreated?.()
        onClose()
        router.push(`/classes/${classId}`)
      } else {
        setError(data.error || '添加失败')
      }
    } catch {
      setError('添加失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <CreateModalShell
      open={open}
      onClose={onClose}
      title="添加班级题目"
      icon={PlusCircle}
      labelledById="create-class-problem-title"
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Tab 切换 */}
            <div className="flex border-b border-border">
              <button
                type="button"
                onClick={() => setMode('select')}
                className={`flex-1 px-6 py-4 text-center font-medium transition-colors relative ${
                  mode === 'select' ? 'text-primary-light' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                从题库选择
                {mode === 'select' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setMode('new')}
                className={`flex-1 px-6 py-4 text-center font-medium transition-colors relative ${
                  mode === 'new' ? 'text-primary-light' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                创建新题目
                {mode === 'new' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {error && (
                <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {mode === 'select' ? (
                <>
                  {/* 搜索框 */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">搜索题目</label>
                    <div className="flex gap-3">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), searchProblems())}
                          placeholder="输入题目标题或标签"
                          className="input pl-10"
                        />
                      </div>
                      <button type="button" onClick={searchProblems} disabled={searchLoading} className="btn btn-primary whitespace-nowrap">
                        <Search className="w-4 h-4" />
                        {searchLoading ? '搜索中...' : '搜索'}
                      </button>
                    </div>
                  </div>

                  {/* 搜索结果 */}
                  {problems.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">选择题目</label>
                      <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                        {problems.map(problem => (
                          <div
                            key={problem.id}
                            onClick={() => setSelectedProblemId(problem.id)}
                            className={`p-3.5 rounded-xl cursor-pointer transition-all border ${
                              selectedProblemId === problem.id
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:border-primary/50 bg-muted'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <h3 className="font-medium text-foreground truncate">{problem.title}</h3>
                                  <span className={`tag ${DIFFICULTY_COLORS[migrateDifficulty(problem.difficulty)] || ''}`}>
                                    {migrateDifficulty(problem.difficulty)}
                                  </span>
                                </div>
                                <div className="flex gap-1 flex-wrap">
                                  {problem.tags.slice(0, 4).map((tag, idx) => (
                                    <span key={idx} className="tag">{tag}</span>
                                  ))}
                                </div>
                              </div>
                              {selectedProblemId === problem.id && (
                                <div className="ml-3 shrink-0">
                                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* 创建新题目表单 */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      题目标题 <span className="text-error">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="请输入题目标题"
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      题目描述 <span className="text-error">*</span>
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="请输入题目描述（支持Markdown）"
                      rows={10}
                      className="input font-mono text-sm min-h-[250px]"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">难度</label>
                      <select
                        value={formData.difficulty}
                        onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as Difficulty })}
                        className="input"
                      >
                        {DIFFICULTIES.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">标签</label>
                      <input
                        type="text"
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        placeholder="多个标签用逗号分隔"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">时间限制 (ms)</label>
                      <input
                        type="number"
                        value={formData.timeLimit}
                        onChange={(e) => setFormData({ ...formData, timeLimit: parseInt(e.target.value) })}
                        min="100"
                        max="10000"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">内存限制 (MB)</label>
                      <input
                        type="number"
                        value={formData.memoryLimit}
                        onChange={(e) => setFormData({ ...formData, memoryLimit: parseInt(e.target.value) })}
                        min="32"
                        max="1024"
                        className="input"
                      />
                    </div>
                  </div>

                  {/* 提示 */}
                  <div className="card-static rounded-xl p-3.5 border border-amber-500/20">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <div className="text-xs text-accent-light">
                        <p className="font-medium mb-0.5">提示</p>
                        <p>创建题目后，您需要在题目详情页面添加测试用例才能正常使用。</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? '添加中…' : '添加题目'}
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost">
              取消
            </button>
          </div>
      </form>
    </CreateModalShell>
  )
}
