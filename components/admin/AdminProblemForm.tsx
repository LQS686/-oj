'use client'

/**
 * 管理后台 - 题目新建 / 编辑（全页表单，避免模态窗误关丢数据）
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, X, Database, ArrowLeft, Save } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { DIFFICULTIES } from '@/lib/constants'
import { useDialog, PageLoading } from '@/components/common'
import { AdminPageShell } from '@/components/admin'

interface Sample {
  input: string
  output: string
}

export default function AdminProblemForm({
  problemId = null,
}: {
  /** 传入则为编辑模式 */
  problemId?: string | null
}) {
  const router = useRouter()
  const dialog = useDialog()
  const isEdit = !!problemId

  const [loading, setLoading] = useState(isEdit)
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
  const [visibility, setVisibility] = useState(isEdit ? 'public' : 'private')

  const [background, setBackground] = useState('')
  const [description, setDescription] = useState('')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [hint, setHint] = useState('')
  const [source, setSource] = useState('')

  const [samples, setSamples] = useState<Sample[]>([{ input: '', output: '' }])
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const hydratedRef = useRef(false)

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        problemNumber,
        title,
        difficulty,
        tags,
        timeLimit,
        memoryLimit,
        comparisonMode,
        realPrecision,
        visibility,
        background,
        description,
        input,
        output,
        hint,
        source,
        samples,
      }),
    [
      problemNumber,
      title,
      difficulty,
      tags,
      timeLimit,
      memoryLimit,
      comparisonMode,
      realPrecision,
      visibility,
      background,
      description,
      input,
      output,
      hint,
      source,
      samples,
    ]
  )

  const dirty = hydratedRef.current && snapshot !== savedSnapshot

  const applyProblem = useCallback((problem: Record<string, unknown>) => {
    setProblemNumber(typeof problem.problemNumber === 'string' ? problem.problemNumber : '')
    setTitle(typeof problem.title === 'string' ? problem.title : '')
    setDescription(typeof problem.description === 'string' ? problem.description : '')
    setBackground(typeof problem.background === 'string' ? problem.background : '')
    setInput(typeof problem.input === 'string' ? problem.input : '')
    setOutput(typeof problem.output === 'string' ? problem.output : '')
    setHint(typeof problem.hint === 'string' ? problem.hint : '')
    setSource(typeof problem.source === 'string' ? problem.source : '')
    setDifficulty(typeof problem.difficulty === 'string' ? problem.difficulty : '入门')
    setTags(Array.isArray(problem.tags) ? (problem.tags as string[]) : [])
    setTimeLimit(typeof problem.timeLimit === 'number' ? problem.timeLimit : 1000)
    setMemoryLimit(typeof problem.memoryLimit === 'number' ? problem.memoryLimit : 128)
    setComparisonMode(typeof problem.comparisonMode === 'string' ? problem.comparisonMode : 'default')
    setRealPrecision(typeof problem.realPrecision === 'number' ? problem.realPrecision : 3)
    const vis =
      typeof problem.visibility === 'string'
        ? problem.visibility
        : problem.isPublic
          ? 'public'
          : 'private'
    setVisibility(vis)
    setSamples(
      Array.isArray(problem.samples) && problem.samples.length > 0
        ? (problem.samples as Sample[])
        : [{ input: '', output: '' }]
    )
  }, [])

  useEffect(() => {
    if (!isEdit || !problemId) {
      hydratedRef.current = true
      setSavedSnapshot(snapshot)
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        const response = await fetchWithCookie(`/api/admin/problems/${problemId}`)
        const data = await response.json()
        if (cancelled) return
        if (!response.ok || !data.success) {
          const msg = data.error?.message || data.error || data.message || '获取题目失败'
          await dialog.alert({
            tone: 'error',
            message: typeof msg === 'string' ? msg : '获取题目失败',
          })
          router.replace('/admin/problems')
          return
        }
        applyProblem(data.data)
      } catch {
        if (!cancelled) {
          await dialog.alert({ tone: 'error', message: '网络错误，请稍后重试' })
          router.replace('/admin/problems')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在 problemId 变化时加载
  }, [isEdit, problemId])

  // 编辑模式数据加载完成后打快照
  useEffect(() => {
    if (loading) return
    if (hydratedRef.current) return
    hydratedRef.current = true
    setSavedSnapshot(snapshot)
  }, [loading, snapshot])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const handleAddTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) {
      setTags([...tags, t])
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

  const buildPayload = () => ({
    problemNumber: problemNumber.trim() || null,
    title: title.trim(),
    description,
    background,
    input,
    output,
    samples: samples.filter((s) => s.input || s.output),
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
  })

  const leave = async (href: string) => {
    if (dirty) {
      const ok = await dialog.confirm({
        message: '有未保存的修改，确定离开？',
        tone: 'warning',
        confirmText: '离开',
        confirmVariant: 'destructive',
      })
      if (!ok) return
    }
    router.push(href)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      await dialog.alert({ tone: 'warning', message: '请填写题目标题' })
      return
    }
    if (!description.trim()) {
      await dialog.alert({ tone: 'warning', message: '请填写题目描述' })
      return
    }

    setSubmitting(true)
    try {
      const response = await fetchWithCookie(
        isEdit ? `/api/admin/problems/${problemId}` : '/api/admin/problems',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        }
      )
      const data = await response.json()

      if (data.success) {
        setSavedSnapshot(snapshot)
        hydratedRef.current = true
        if (isEdit) {
          await dialog.alert({
            tone: 'success',
            title: '更新成功',
            message: `题目《${title.trim()}》已保存`,
          })
          router.push('/admin/problems')
        } else {
          const createdId = data.data?.problem?.id as string | undefined
          await dialog.alert({
            tone: 'success',
            title: '创建成功',
            message: createdId
              ? `题目《${title.trim()}》已创建，接下来请配置测试数据`
              : `题目《${title.trim()}》已创建`,
            confirmText: createdId ? '去编辑测试数据' : '返回列表',
          })
          if (createdId) {
            router.push(`/admin/problems/${createdId}/testcases`)
          } else {
            router.push('/admin/problems')
          }
        }
      } else {
        const msg = data.error?.message || data.error || (isEdit ? '更新失败' : '创建失败')
        await dialog.alert({
          tone: 'error',
          message: typeof msg === 'string' ? msg : isEdit ? '更新失败' : '创建失败',
        })
      }
    } catch {
      await dialog.alert({ tone: 'error', message: '网络错误，请稍后重试' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <PageLoading label="加载题目…" />
  }

  const fieldLabel = 'block text-sm font-medium text-foreground mb-1.5'

  return (
    <AdminPageShell width="form" className="pb-10">
      {/* 页头：不与侧栏抢视觉，保持轻量 */}
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={() => void leave('/admin/problems')}
            className="mt-0.5 p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            aria-label="返回题目列表"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                {isEdit ? '编辑题目' : '创建题目'}
              </h1>
              {dirty && (
                <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-md">
                  未保存
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isEdit
                ? title || problemNumber || '修改题面与判题参数'
                : '先完善题面，创建后进入测试数据配置'}
            </p>
            {!isEdit && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    1
                  </span>
                  题面
                </span>
                <span className="text-muted-foreground/40">—</span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-5 h-5 rounded-full border border-border text-xs flex items-center justify-center">
                    2
                  </span>
                  测试数据
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:pt-0.5">
          {isEdit && problemId && (
            <Link
              href={`/admin/problems/${problemId}/testcases`}
              onClick={(e) => {
                if (dirty) {
                  e.preventDefault()
                  void leave(`/admin/problems/${problemId}/testcases`)
                }
              }}
              className="btn btn-ghost text-sm gap-1.5"
            >
              <Database className="w-4 h-4" />
              测试数据
            </Link>
          )}
          <button
            type="button"
            onClick={() => void leave('/admin/problems')}
            className="btn btn-ghost text-sm"
          >
            取消
          </button>
          <button
            type="submit"
            form="admin-problem-form"
            disabled={submitting || (isEdit && !dirty)}
            className="btn btn-primary text-sm gap-1.5 disabled:opacity-50"
          >
            {submitting ? (
              isEdit ? '保存中…' : '创建中…'
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEdit ? '保存更改' : '创建并继续'}
              </>
            )}
          </button>
        </div>
      </header>

      <form id="admin-problem-form" onSubmit={handleSubmit} className="card divide-y divide-border">
        {/* 基本信息 */}
        <section className="p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">基本信息</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">编号、难度与判题参数</p>
          </div>

          <div>
            <label className={fieldLabel}>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={fieldLabel}>题目编号</label>
              <input
                type="text"
                value={problemNumber}
                onChange={(e) => setProblemNumber(e.target.value)}
                placeholder="如 P1001"
                className="input"
              />
            </div>
            <div>
              <label className={fieldLabel}>
                难度 <span className="text-error">*</span>
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="input"
              >
                {DIFFICULTIES.map((diff) => (
                  <option key={diff} value={diff}>
                    {diff}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>可见性</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="input"
              >
                <option value="public">公开</option>
                <option value="private">隐藏（草稿）</option>
                <option value="contest">竞赛专用</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={fieldLabel}>时间限制 (ms)</label>
              <input
                type="number"
                value={timeLimit}
                onChange={(e) => setTimeLimit(parseInt(e.target.value, 10) || 1000)}
                min={100}
                max={30000}
                className="input"
              />
            </div>
            <div>
              <label className={fieldLabel}>内存限制 (MB)</label>
              <input
                type="number"
                value={memoryLimit}
                onChange={(e) => setMemoryLimit(parseInt(e.target.value, 10) || 128)}
                min={32}
                max={1024}
                className="input"
              />
            </div>
            <div>
              <label className={fieldLabel}>输出比较模式</label>
              <select
                value={comparisonMode}
                onChange={(e) => setComparisonMode(e.target.value)}
                className="input"
              >
                <option value="default">默认（NOI）</option>
                <option value="strict">严格匹配</option>
                <option value="ignore-spaces">忽略空白</option>
                <option value="real-number">浮点数</option>
              </select>
            </div>
          </div>

          {comparisonMode === 'real-number' && (
            <div className="max-w-xs">
              <label className={fieldLabel}>浮点精度（小数位数）</label>
              <input
                type="number"
                value={realPrecision}
                onChange={(e) => setRealPrecision(parseInt(e.target.value, 10) || 3)}
                min={0}
                max={12}
                className="input"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={fieldLabel}>来源</label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="如：NOIP 2020 普及组"
                className="input"
              />
            </div>
            <div>
              <label className={fieldLabel}>标签</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                  placeholder="输入后回车"
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="btn btn-outline shrink-0 px-3"
                >
                  添加
                </button>
              </div>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 -mt-2">
              {tags.map((tag, idx) => (
                <span key={`${tag}-${idx}`} className="tag flex items-center gap-1.5">
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(idx)}
                    className="hover:text-error"
                    aria-label={`移除 ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 题面 */}
        <section className="p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">题面描述</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">支持 Markdown 语法</p>
          </div>

          <div>
            <label className={fieldLabel}>题目背景（可选）</label>
            <textarea
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              rows={3}
              placeholder="背景或引言…"
              className="input font-mono text-sm resize-y"
            />
          </div>

          <div>
            <label className={fieldLabel}>
              题目描述 <span className="text-error">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={7}
              placeholder="详细描述题目要求…"
              className="input font-mono text-sm resize-y"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={fieldLabel}>输入格式</label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={4}
                placeholder="描述输入…"
                className="input font-mono text-sm resize-y"
              />
            </div>
            <div>
              <label className={fieldLabel}>输出格式</label>
              <textarea
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                rows={4}
                placeholder="描述输出…"
                className="input font-mono text-sm resize-y"
              />
            </div>
          </div>

          <div>
            <label className={fieldLabel}>提示（可选）</label>
            <textarea
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              rows={2}
              placeholder="解题提示…"
              className="input font-mono text-sm resize-y"
            />
          </div>
        </section>

        {/* 样例 */}
        <section className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">样例</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">展示给选手的输入输出样例</p>
            </div>
            <button
              type="button"
              onClick={handleAddSample}
              className="btn btn-ghost text-sm gap-1 shrink-0"
            >
              <Plus className="w-4 h-4" />
              添加
            </button>
          </div>

          <div className="space-y-3">
            {samples.map((sample, idx) => (
              <div key={idx} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">样例 {idx + 1}</span>
                  {samples.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSample(idx)}
                      className="text-muted-foreground hover:text-error p-1"
                      aria-label={`删除样例 ${idx + 1}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      输入
                    </label>
                    <textarea
                      value={sample.input}
                      onChange={(e) => {
                        const next = [...samples]
                        next[idx] = { ...next[idx], input: e.target.value }
                        setSamples(next)
                      }}
                      rows={3}
                      className="input font-mono text-sm resize-y"
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      输出
                    </label>
                    <textarea
                      value={sample.output}
                      onChange={(e) => {
                        const next = [...samples]
                        next[idx] = { ...next[idx], output: e.target.value }
                        setSamples(next)
                      }}
                      rows={3}
                      className="input font-mono text-sm resize-y"
                      spellCheck={false}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 底栏操作 */}
        <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center justify-end gap-2 bg-muted/20">
          <button
            type="button"
            onClick={() => void leave('/admin/problems')}
            className="btn btn-ghost"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={submitting || (isEdit && !dirty)}
            className="btn btn-primary gap-1.5 disabled:opacity-50 min-w-[7.5rem]"
          >
            {submitting ? (
              isEdit ? '保存中…' : '创建中…'
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEdit ? '保存更改' : '创建并继续'}
              </>
            )}
          </button>
        </div>
      </form>
    </AdminPageShell>
  )
}
