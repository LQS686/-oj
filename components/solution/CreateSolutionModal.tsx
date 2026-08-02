'use client'

import { useState, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useRouter } from 'next/navigation'
import {
  Lightbulb,
  Code2,
  ChevronDown,
  AlertCircle,
  Loader2,
  Send,
  CheckCircle2,
  PencilLine,
  Save,
} from 'lucide-react'
import { CreateModalShell } from '@/components/common'
import MarkdownEditor from '@/components/solution/MarkdownEditor'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { useDialog } from '@/components/common/DialogProvider'
import { useUser } from '@/contexts/UserContext'
import { canManageContent } from '@/lib/permissions'

const CODE_LANGUAGES = [
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'python', label: 'Python' },
]

const TITLE_MIN = 1
const TITLE_MAX = 100
const CONTENT_MIN = 10
const CONTENT_MAX = 50000

const defaultForm = () => ({
  title: '',
  content: '',
  codeLanguage: 'cpp',
  code: '',
  codeOpen: true,
})

export default function CreateSolutionModal({
  open,
  onClose,
  onCreated,
  onSaved,
  problemId,
  /** 传入则为编辑模式 */
  solutionId = null,
}: {
  open: boolean
  onClose: () => void
  onCreated?: (id: string) => void
  onSaved?: () => void
  problemId: string
  solutionId?: string | null
}) {
  const router = useRouter()
  const dialog = useDialog()
  const { user } = useUser()
  const isEdit = !!solutionId

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState(defaultForm)

  const resetForm = useCallback(() => {
    setFormData(defaultForm())
    setError('')
    setSubmitting(false)
    setLoading(false)
  }, [])

  const applySolution = useCallback((solution: Record<string, unknown>) => {
    const code = typeof solution.code === 'string' ? solution.code : ''
    setFormData({
      title: typeof solution.title === 'string' ? solution.title : '',
      content: typeof solution.content === 'string' ? solution.content : '',
      codeLanguage:
        typeof solution.codeLanguage === 'string' && solution.codeLanguage
          ? solution.codeLanguage
          : 'cpp',
      code,
      codeOpen: true,
    })
  }, [])

  useDeferredEffect(() => {
    if (!open) return

    if (!isEdit || !solutionId) {
      resetForm()
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await fetchWithCookie(`/api/solutions/${solutionId}`)
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || !data?.success) {
          const msg = data?.error || data?.message || '获取题解失败'
          await dialog.alert({
            tone: 'error',
            message: typeof msg === 'string' ? msg : '获取题解失败',
          })
          onClose()
          return
        }
        applySolution(data.data)
      } catch (err) {
        logger.error('加载题解失败', err)
        if (!cancelled) {
          await dialog.alert({ tone: 'error', message: '网络错误，请稍后重试' })
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, isEdit, solutionId, resetForm, applySolution, dialog, onClose])

  const titleLength = formData.title.length
  const contentLength = formData.content.length

  const titleError = (() => {
    if (titleLength === 0) return null
    if (titleLength < TITLE_MIN || titleLength > TITLE_MAX) {
      return `标题长度需在 ${TITLE_MIN}-${TITLE_MAX} 字符之间`
    }
    return null
  })()

  const contentError = (() => {
    if (contentLength === 0) return null
    if (contentLength < CONTENT_MIN || contentLength > CONTENT_MAX) {
      return `内容长度需在 ${CONTENT_MIN}-${CONTENT_MAX} 字符之间`
    }
    return null
  })()

  const titleValid = titleLength >= TITLE_MIN && titleLength <= TITLE_MAX
  const contentValid = contentLength >= CONTENT_MIN && contentLength <= CONTENT_MAX
  const canSubmit =
    titleValid && contentValid && !submitting && !loading && !!problemId && (!isEdit || !!solutionId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) {
      if (!titleValid) setError(`标题长度需在 ${TITLE_MIN}-${TITLE_MAX} 字符之间`)
      else if (!contentValid) setError(`内容长度需在 ${CONTENT_MIN}-${CONTENT_MAX} 字符之间`)
      return
    }

    setSubmitting(true)
    setError('')

    const payload = {
      title: formData.title.trim(),
      content: formData.content,
      codeLanguage: formData.code.trim() ? formData.codeLanguage : null,
      code: formData.code.trim() ? formData.code : null,
    }

    try {
      if (isEdit && solutionId) {
        const res = await fetchWithCookie(`/api/solutions/${solutionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => null)
        if (res.ok && data?.success) {
          onSaved?.()
          onClose()
        } else {
          setError(data?.error || `保存失败（HTTP ${res.status}）`)
        }
      } else {
        const res = await fetchWithCookie('/api/solutions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problemId, ...payload }),
        })
        const data = await res.json().catch(() => null)
        if (res.ok && data?.success) {
          const newId = data?.data?.id
          if (newId) {
            // 安全合规：普通用户发布的题解进入待审核，提交后给出明确提示
            if (!isEdit && !canManageContent(user)) {
              await dialog.alert({
                tone: 'info',
                message: '题解已提交，管理员审核通过后将展示给其他用户。你可以在下方列表查看自己的题解。',
              })
            }
            onCreated?.(newId)
            onClose()
            // 调用方（题目页题解 Tab）会行内展开；否则回题目页并展开
            if (!onCreated) {
              router.push(`/problem/${problemId}?tab=solutions&solution=${newId}`)
            }
          } else {
            setError('发布成功但未返回题解 ID')
          }
        } else {
          setError(data?.error || `发布失败（HTTP ${res.status}）`)
        }
      }
    } catch (err) {
      logger.error(isEdit ? '更新题解失败' : '发布题解失败', err)
      setError('网络错误，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CreateModalShell
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑题解' : '发布题解'}
      icon={isEdit ? PencilLine : Lightbulb}
      labelledById={isEdit ? 'edit-solution-title' : 'create-solution-title'}
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          加载中…
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
            {error && (
              <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="solution-title" className="block text-sm font-medium text-foreground">
                  题解标题 <span className="text-error">*</span>
                </label>
                <span
                  className={`text-xs ${
                    titleLength > TITLE_MAX
                      ? 'text-error'
                      : titleLength > TITLE_MAX - 10
                        ? 'text-accent'
                        : 'text-muted-foreground'
                  }`}
                >
                  {titleLength}/{TITLE_MAX}
                </span>
              </div>
              <input
                id="solution-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                maxLength={TITLE_MAX + 20}
                placeholder="给你的题解起一个清晰的标题…"
                className={`w-full px-4 py-3 rounded-xl bg-background-secondary border focus:ring-2 transition-all text-foreground placeholder:text-muted-foreground ${
                  titleError
                    ? 'border-error/50 focus:border-error focus:ring-error/20'
                    : 'border-border focus:border-primary focus:ring-primary/20'
                }`}
              />
              {titleError && <p className="mt-1.5 text-xs text-error">{titleError}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-foreground">
                  题解内容 <span className="text-error">*</span>
                </label>
                <span
                  className={`text-xs ${
                    contentLength > CONTENT_MAX
                      ? 'text-error'
                      : contentLength < CONTENT_MIN
                        ? 'text-muted-foreground'
                        : 'text-secondary'
                  }`}
                >
                  {contentLength.toLocaleString()} / {CONTENT_MAX.toLocaleString()}
                </span>
              </div>
              <MarkdownEditor
                value={formData.content}
                onChange={(v) => setFormData({ ...formData, content: v })}
                minHeight={420}
                maxLength={CONTENT_MAX}
                placeholder="详细描述你的解题思路、关键算法与复杂度分析…"
                disabled={submitting}
              />
              {contentError && <p className="mt-1.5 text-xs text-error">{contentError}</p>}
              {contentValid && (
                <p className="mt-1.5 text-xs text-secondary inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  内容长度符合要求
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, codeOpen: !formData.codeOpen })}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-background-secondary/60 hover:bg-background-secondary transition-colors"
                aria-expanded={formData.codeOpen}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Code2 className="w-4 h-4 text-primary-light" />
                  配套代码（可选）
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                    formData.codeOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {formData.codeOpen && (
                <div className="p-4 space-y-3 border-t border-border">
                  <div className="flex items-center gap-3">
                    <label htmlFor="code-language" className="text-sm text-muted-foreground whitespace-nowrap">
                      代码语言
                    </label>
                    <select
                      id="code-language"
                      value={formData.codeLanguage}
                      onChange={(e) => setFormData({ ...formData, codeLanguage: e.target.value })}
                      className="px-3 py-2 rounded-lg bg-background-secondary border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground text-sm transition-all"
                    >
                      {CODE_LANGUAGES.map((lang) => (
                        <option key={lang.value} value={lang.value}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                    {formData.code.trim() && (
                      <span className="text-xs text-muted-foreground">
                        {formData.code.split('\n').length} 行 · {formData.code.length} 字符
                      </span>
                    )}
                  </div>

                  <textarea
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    spellCheck={false}
                    placeholder={`在此粘贴你的 ${CODE_LANGUAGES.find((l) => l.value === formData.codeLanguage)?.label ?? ''} 代码…`}
                    className="w-full min-h-[200px] px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground font-mono text-sm leading-6 transition-all custom-scrollbar resize-y"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button
              type="submit"
              disabled={!canSubmit}
              className={`btn flex-1 ${canSubmit ? 'btn-primary' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isEdit ? '保存中…' : '发布中…'}
                </>
              ) : isEdit ? (
                <>
                  <Save className="w-4 h-4" />
                  保存
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  发布题解
                </>
              )}
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost">
              取消
            </button>
          </div>
        </form>
      )}
    </CreateModalShell>
  )
}
