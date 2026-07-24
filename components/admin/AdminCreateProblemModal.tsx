'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, FileText } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { DIFFICULTIES } from '@/lib/constants'
import { useDialog } from '@/components/common/DialogProvider'
import { CreateModalShell } from '@/components/common'

interface Sample {
  input: string
  output: string
}

export default function AdminCreateProblemModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}) {
  const router = useRouter()
  const dialog = useDialog()

  const [submitting, setSubmitting] = useState(false)

  const [problemNumber, setProblemNumber] = useState('')
  const [title, setTitle] = useState('')
  const [difficulty, setDifficulty] = useState('入门')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [timeLimit, setTimeLimit] = useState(1000)
  const [memoryLimit, setMemoryLimit] = useState(128)
  const [comparisonMode, setComparisonMode] = useState('default')
  const [realPrecision, setRealPrecision] = useState(3)
  const [visibility, setVisibility] = useState('private')

  const [background, setBackground] = useState('')
  const [description, setDescription] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [hint, setHint] = useState('')
  const [source, setSource] = useState('')

  const [samples, setSamples] = useState<Sample[]>([{ input: '', output: '' }])

  const resetForm = useCallback(() => {
    setSubmitting(false)
    setProblemNumber('')
    setTitle('')
    setDifficulty('入门')
    setTags([])
    setTagInput('')
    setTimeLimit(1000)
    setMemoryLimit(128)
    setComparisonMode('default')
    setRealPrecision(3)
    setVisibility('private')
    setBackground('')
    setDescription('')
    setInput('')
    setOutput('')
    setHint('')
    setSource('')
    setSamples([{ input: '', output: '' }])
  }, [])

  useEffect(() => {
    if (!open) return
    resetForm()
  }, [open, resetForm])

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index))
  }

  const handleAddSample = () => {
    setSamples([...samples, { input: '', output: '' }])
  }

  const handleRemoveSample = (index: number) => {
    setSamples(samples.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      await dialog.alert({
        tone: 'warning',
        message: '请填写题目标题',
      })
      return
    }

    if (!description.trim()) {
      await dialog.alert({
        tone: 'warning',
        message: '请填写题目描述',
      })
      return
    }

    setSubmitting(true)

    try {
      const response = await fetchWithCookie('/api/admin/problems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemNumber: problemNumber.trim() || null,
          title: title.trim(),
          description,
          background,
          input,
          output,
          samples: samples.filter(s => s.input || s.output),
          hint: hint || null,
          source: source || null,
          difficulty,
          tags,
          timeLimit,
          memoryLimit,
          comparisonMode,
          realPrecision: comparisonMode === 'real-number' ? realPrecision : 3,
          isPublic: visibility === 'public',
          visibility,
        }),
      })

      const data = await response.json()

      if (data.success) {
        await dialog.alert({
          tone: 'success',
          title: '创建成功',
          message: `题目《${title.trim()}》已创建`,
          confirmText: '返回列表',
        })
        onCreated?.()
        onClose()
        router.push('/admin/problems')
      } else {
        const msg = data.error?.message || data.error || '创建失败'
        await dialog.alert({
          tone: 'error',
          message: typeof msg === 'string' ? msg : '创建失败',
        })
      }
    } catch {
      await dialog.alert({
        tone: 'error',
        message: '网络错误，请稍后重试',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CreateModalShell
      open={open}
      onClose={onClose}
      title="创建题目"
      icon={FileText}
      labelledById="admin-create-problem-title"
      variant="admin"
    >
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {/* 基本信息 */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">基本信息</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  题目编号（可选）
                </label>
                <input
                  type="text"
                  value={problemNumber}
                  onChange={(e) => setProblemNumber(e.target.value)}
                  placeholder="如：P1001"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  难度 <span className="text-error">*</span>
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="input"
                >
                  {DIFFICULTIES.map(diff => (
                    <option key={diff} value={diff}>{diff}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                题目标题 <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入题目标题"
                className="input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">标签</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="输入标签后按回车"
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="btn btn-primary"
                >
                  添加
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="tag flex items-center gap-2"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(idx)}
                      className="hover:text-error"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  时间限制（ms）
                </label>
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value) || 1000)}
                  min="100"
                  max="10000"
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  内存限制（MB）
                </label>
                <input
                  type="number"
                  value={memoryLimit}
                  onChange={(e) => setMemoryLimit(parseInt(e.target.value) || 128)}
                  min="32"
                  max="1024"
                  className="input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  输出比较模式
                </label>
                <select
                  value={comparisonMode}
                  onChange={(e) => setComparisonMode(e.target.value)}
                  className="input"
                >
                  <option value="default">默认（NOI 忽略行末空格）</option>
                  <option value="strict">严格逐行匹配</option>
                  <option value="ignore-spaces">忽略所有空白</option>
                  <option value="real-number">浮点数比较</option>
                </select>
              </div>

              <div>
                {comparisonMode === 'real-number' ? (
                  <>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      精度（小数位数）
                    </label>
                    <input
                      type="number"
                      value={realPrecision}
                      onChange={(e) => setRealPrecision(parseInt(e.target.value) || 3)}
                      min="0"
                      max="12"
                      className="input"
                    />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground pt-7">
                    {comparisonMode === 'default' && 'NOI 规则：忽略每行行末多余空格与文件末尾多余空行'}
                    {comparisonMode === 'strict' && '逐字符严格比较，所有空白与换行均参与对比'}
                    {comparisonMode === 'ignore-spaces' && '比较时忽略所有空白字符（含空格、制表符、换行）'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-foreground">题目可见性：</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="input w-auto"
              >
                <option value="public">公开 (Public)</option>
                <option value="private">隐藏 (Private)</option>
                <option value="contest">竞赛专用 (Contest)</option>
              </select>
              <span className="text-xs text-muted-foreground">
                {visibility === 'public' && '题目将在题库中对所有用户可见'}
                {visibility === 'private' && '题目仅管理员可见（草稿状态）'}
                {visibility === 'contest' && '题目仅在竞赛中可见'}
              </span>
            </div>
          </div>

          {/* 题目描述 */}
          <div className="space-y-4 pt-2 border-t border-border">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-2">题目描述</h2>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                题目背景 <span className="text-muted-foreground">(可选)</span>
              </label>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                rows={3}
                placeholder="题目背景内容（markdown 格式，可选）"
                className="input font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                题目描述 <span className="text-error">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                placeholder="详细描述题目要求..."
                className="input min-h-[200px] font-mono text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">输入格式</label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={4}
                placeholder="描述输入格式..."
                className="input font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">输出格式</label>
              <textarea
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                rows={4}
                placeholder="描述输出格式..."
                className="input font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">提示（可选）</label>
              <textarea
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                rows={3}
                placeholder="给出解题提示..."
                className="input font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">来源（可选）</label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="如：NOIP 2020 普及组"
                className="input"
              />
            </div>
          </div>

          {/* 样例 */}
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="flex justify-between items-center pt-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">样例</h2>
              <button
                type="button"
                onClick={handleAddSample}
                className="btn btn-ghost text-sm flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                添加样例
              </button>
            </div>

            {samples.map((sample, idx) => (
              <div key={idx} className="p-4 rounded-lg bg-muted border border-border space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-foreground">样例 {idx + 1}</h3>
                  {samples.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSample(idx)}
                      className="text-error hover:text-error/80"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">输入</label>
                    <textarea
                      value={sample.input}
                      onChange={(e) => {
                        const newSamples = [...samples]
                        newSamples[idx].input = e.target.value
                        setSamples(newSamples)
                      }}
                      rows={3}
                      className="input font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">输出</label>
                    <textarea
                      value={sample.output}
                      onChange={(e) => {
                        const newSamples = [...samples]
                        newSamples[idx].output = e.target.value
                        setSamples(newSamples)
                      }}
                      rows={3}
                      className="input font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
          <button type="submit" disabled={submitting} className="btn btn-primary flex-1">
            {submitting ? '创建中…' : '创建题目'}
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            取消
          </button>
        </div>
      </form>
    </CreateModalShell>
  )
}
