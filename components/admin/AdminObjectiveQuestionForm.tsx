'use client'

/**
 * 管理后台 - 客观题新建 / 编辑（全页表单，create / edit 复用）
 *
 * - 题型切换时重置选项 / 答案区为该题型默认结构
 * - 填空题按题干空位数（≥4 连续下划线）自动生成答案输入列表
 * - 前端校验与后端 validateObjectiveQuestionPayload 规则一致
 */
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Save, Trash2 } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useDialog, PageLoading } from '@/components/common'
import {
  OBJECTIVE_QUESTION_TYPES,
  OBJECTIVE_QUESTION_TYPE_LABELS,
  countFillBlanks,
  type ObjectiveAnswer,
  type ObjectiveQuestionDetail,
  type ObjectiveQuestionOption,
  type ObjectiveQuestionType,
} from '@/lib/objective-question/types'
import { OBJECTIVE_DIFFICULTIES } from '@/lib/objective-question/validation'

/** 选项数量下限 / 上限（与后端校验一致） */
const MIN_OPTIONS = 2
const MAX_OPTIONS = 8
/** 标签数量上限（与后端校验一致） */
const MAX_TAGS = 8
/** 选项字母表（key 由下标推导为 A-Z） */
const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** 填空空位序号（①-⑩，超出用「空 N」） */
const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

/** 默认选项结构：4 个空选项（A-D） */
function defaultOptionContents(): string[] {
  return ['', '', '', '']
}

/** 标签输入解析：中英文逗号分隔，trim 后剔除空项 */
function parseTags(input: string): string[] {
  return input
    .split(/[,，]/)
    .map(t => t.trim())
    .filter(Boolean)
}

/** 填空空位 label：空①、空②…（超过 10 个用「空 11」） */
function blankLabel(index: number): string {
  return index < CIRCLED_NUMBERS.length
    ? `空${CIRCLED_NUMBERS[index]}`
    : `空 ${index + 1}`
}

export interface AdminObjectiveQuestionFormProps {
  mode: 'create' | 'edit'
  /** 编辑模式的题目 ID */
  questionId?: string
}

/** 表单行内错误（字段名 → 中文提示） */
type FormErrors = Partial<
  Record<'title' | 'options' | 'answer' | 'tags' | 'score', string>
>

export default function AdminObjectiveQuestionForm({
  mode,
  questionId,
}: AdminObjectiveQuestionFormProps) {
  const router = useRouter()
  const dialog = useDialog()
  const isEdit = mode === 'edit'

  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  // 提交尝试后开启行内条件错误（选项内容为空 / 填空答案为空）
  const [showFieldErrors, setShowFieldErrors] = useState(false)

  const [questionNumber, setQuestionNumber] = useState('')
  const [type, setType] = useState<ObjectiveQuestionType>('single-choice')
  const [title, setTitle] = useState('')
  /** 选项内容列表（key 由下标推导为 A-Z，删除中间项后自动重排） */
  const [optionContents, setOptionContents] = useState<string[]>(defaultOptionContents)
  /** 已标记为正确答案的选项下标（单选恰好 1 个，多选 ≥2 个） */
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([])
  /** 判断题答案（null = 未选择） */
  const [trueFalseAnswer, setTrueFalseAnswer] = useState<boolean | null>(null)
  /** 填空题答案输入（按空位下标存储；渲染/提交时按空位数截断或补空） */
  const [fillAnswers, setFillAnswers] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState<string>('简单')
  const [tagsInput, setTagsInput] = useState('')
  const [score, setScore] = useState(5)
  const [explanation, setExplanation] = useState('')

  const isChoice = type === 'single-choice' || type === 'multiple-choice'
  const blankCount = type === 'fill-blank' ? countFillBlanks(title) : 0

  /** 清除指定字段的行内错误（输入变化时调用） */
  const clearError = useCallback((field: keyof FormErrors) => {
    setErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }, [])

  /** 详情回填：answer Json → 表单结构 */
  const applyQuestion = useCallback((detail: ObjectiveQuestionDetail) => {
    setQuestionNumber(detail.questionNumber || '')
    setType(detail.type)
    setTitle(detail.title)
    if (detail.type === 'single-choice' || detail.type === 'multiple-choice') {
      const contents = (detail.options || []).map(o => o.content)
      setOptionContents(
        contents.length >= MIN_OPTIONS ? contents : defaultOptionContents()
      )
      const keys = (detail.options || []).map(o => o.key)
      const indexes = (detail.answer as string[])
        .map(k => keys.indexOf(k))
        .filter(i => i >= 0)
      setSelectedIndexes(indexes)
    } else if (detail.type === 'true-false') {
      setTrueFalseAnswer(
        typeof detail.answer[0] === 'boolean' ? detail.answer[0] : null
      )
    } else {
      setFillAnswers(
        Array.isArray(detail.answer) ? (detail.answer as string[]) : []
      )
    }
    setDifficulty(detail.difficulty || '简单')
    setTagsInput((detail.tags || []).join(','))
    setScore(typeof detail.score === 'number' ? detail.score : 5)
    setExplanation(detail.explanation || '')
  }, [])

  // 编辑模式：加载详情回填；404 / 失败时提示并返回列表
  useDeferredEffect(() => {
    if (!isEdit || !questionId) return

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        const response = await fetchWithCookie(
          `/api/admin/objective-questions/${questionId}`
        )
        const data = await response.json()
        if (cancelled) return
        if (!response.ok || !data.success) {
          const msg = data.error || '获取题目失败'
          await dialog.alert({
            tone: 'error',
            message: typeof msg === 'string' ? msg : '获取题目失败',
          })
          router.replace('/admin/objective-questions')
          return
        }
        applyQuestion(data.data as ObjectiveQuestionDetail)
      } catch {
        if (!cancelled) {
          await dialog.alert({ tone: 'error', message: '网络错误，请稍后重试' })
          router.replace('/admin/objective-questions')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isEdit, questionId])

  /** 题型切换：清空选项 / 答案区并重置为该题型默认结构 */
  const handleTypeChange = (nextType: ObjectiveQuestionType) => {
    if (nextType === type) return
    setType(nextType)
    setErrors({})
    setShowFieldErrors(false)
    if (nextType === 'single-choice' || nextType === 'multiple-choice') {
      setOptionContents(defaultOptionContents())
      setSelectedIndexes([])
    } else if (nextType === 'true-false') {
      setTrueFalseAnswer(null)
    } else {
      setFillAnswers([])
    }
  }

  /* ------------------------- 选项编辑器（单选 / 多选） ------------------------- */

  const handleAddOption = () => {
    if (optionContents.length >= MAX_OPTIONS) return
    setOptionContents(prev => [...prev, ''])
  }

  const handleRemoveOption = (index: number) => {
    if (optionContents.length <= MIN_OPTIONS) return
    setOptionContents(prev => prev.filter((_, i) => i !== index))
    // 删除选项后：移除其答案标记，其后的下标前移
    setSelectedIndexes(prev =>
      prev
        .filter(i => i !== index)
        .map(i => (i > index ? i - 1 : i))
    )
  }

  const handleOptionContentChange = (index: number, content: string) => {
    setOptionContents(prev => prev.map((c, i) => (i === index ? content : c)))
  }

  /** 标记正确答案：单选 radio（互斥），多选 checkbox（可多选） */
  const handleToggleAnswer = (index: number) => {
    clearError('answer')
    if (type === 'single-choice') {
      setSelectedIndexes([index])
    } else {
      setSelectedIndexes(prev =>
        prev.includes(index)
          ? prev.filter(i => i !== index)
          : [...prev, index].sort((a, b) => a - b)
      )
    }
  }

  /** 填空答案输入（按空位下标写入） */
  const handleFillAnswerChange = (index: number, value: string) => {
    setFillAnswers(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  /* --------------------------------- 校验 --------------------------------- */

  /** 前端校验（与后端 validateObjectiveQuestionPayload 规则一致） */
  const validate = (): FormErrors => {
    const errs: FormErrors = {}

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      errs.title = '题干不能为空'
    } else if (type === 'fill-blank' && countFillBlanks(trimmedTitle) < 1) {
      errs.title = '填空题题干必须包含至少一个空位标记（____）'
    }

    if (type === 'single-choice' || type === 'multiple-choice') {
      if (optionContents.length < MIN_OPTIONS || optionContents.length > MAX_OPTIONS) {
        errs.options = `选项数量必须在 ${MIN_OPTIONS}-${MAX_OPTIONS} 个之间`
      } else if (optionContents.some(c => !c.trim())) {
        errs.options = '选项内容不能为空'
      }
      if (type === 'single-choice' && selectedIndexes.length !== 1) {
        errs.answer = '请标记 1 个正确答案'
      } else if (type === 'multiple-choice' && selectedIndexes.length < 2) {
        errs.answer = '多选题需标记至少 2 个正确答案'
      }
    } else if (type === 'true-false') {
      if (trueFalseAnswer === null) {
        errs.answer = '请选择判断题答案'
      }
    } else if (blankCount > 0) {
      if (Array.from({ length: blankCount }, (_, i) => fillAnswers[i] ?? '').some(a => !a.trim())) {
        errs.answer = '每个空位的答案不能为空'
      }
    }

    if (parseTags(tagsInput).length > MAX_TAGS) {
      errs.tags = `标签数量不能超过 ${MAX_TAGS} 个`
    }
    if (!Number.isInteger(score) || score < 1 || score > 100) {
      errs.score = '分值必须是 1-100 的整数'
    }
    return errs
  }

  /** 构造提交载荷（answer / options 按题型规范化） */
  const buildPayload = () => {
    let options: ObjectiveQuestionOption[] | null = null
    let answer: ObjectiveAnswer
    if (type === 'single-choice') {
      options = optionContents.map((content, i) => ({
        key: OPTION_LETTERS[i],
        content: content.trim(),
      }))
      answer = [OPTION_LETTERS[selectedIndexes[0]]]
    } else if (type === 'multiple-choice') {
      options = optionContents.map((content, i) => ({
        key: OPTION_LETTERS[i],
        content: content.trim(),
      }))
      answer = [...selectedIndexes]
        .sort((a, b) => a - b)
        .map(i => OPTION_LETTERS[i])
    } else if (type === 'true-false') {
      answer = [trueFalseAnswer as boolean]
    } else {
      answer = Array.from({ length: blankCount }, (_, i) =>
        (fillAnswers[i] ?? '').trim()
      )
    }
    return {
      type,
      title: title.trim(),
      options,
      answer,
      difficulty,
      tags: parseTags(tagsInput),
      score,
      explanation: explanation.trim() || null,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    const errs = validate()
    setErrors(errs)
    setShowFieldErrors(true)
    if (Object.values(errs).some(Boolean)) return

    setSubmitting(true)
    try {
      const response = await fetchWithCookie(
        isEdit
          ? `/api/admin/objective-questions/${questionId}`
          : '/api/admin/objective-questions',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        }
      )
      const data = await response.json()
      if (data.success) {
        router.push('/admin/objective-questions')
      } else {
        const msg = data.error || (isEdit ? '更新失败' : '创建失败')
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
  const errorText = 'mt-1 text-xs text-error'

  return (
    <form onSubmit={handleSubmit} className="card divide-y divide-border" noValidate>
      {/* 基本信息 */}
      <section className="p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">基本信息</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">题型、题干与元信息</p>
          </div>
          {/* 编辑模式：题号只读展示（服务端生成，不可修改） */}
          {isEdit && questionNumber && (
            <span className="tag font-mono shrink-0">{questionNumber}</span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={fieldLabel}>
              题型 <span className="text-error">*</span>
            </label>
            <select
              value={type}
              onChange={e => handleTypeChange(e.target.value as ObjectiveQuestionType)}
              className="input"
            >
              {OBJECTIVE_QUESTION_TYPES.map(t => (
                <option key={t} value={t}>
                  {OBJECTIVE_QUESTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel}>
              难度 <span className="text-error">*</span>
            </label>
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
              className="input"
            >
              {OBJECTIVE_DIFFICULTIES.map(d => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel}>
              建议分值 <span className="text-error">*</span>
            </label>
            <input
              type="number"
              value={score}
              min={1}
              max={100}
              onChange={e => {
                const n = parseInt(e.target.value, 10)
                setScore(Number.isFinite(n) ? n : 0)
                clearError('score')
              }}
              className="input"
            />
            {errors.score && <p className={errorText}>{errors.score}</p>}
          </div>
        </div>

        <div>
          <label className={fieldLabel}>
            题干 <span className="text-error">*</span>
          </label>
          <textarea
            value={title}
            onChange={e => {
              setTitle(e.target.value)
              clearError('title')
            }}
            rows={6}
            placeholder="输入题干，支持 Markdown…"
            className="input resize-y"
          />
          {errors.title && <p className={errorText}>{errors.title}</p>}
          {type === 'fill-blank' && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              用 <code className="px-1 rounded bg-muted">____</code>（4 个以上连续下划线）标记空位，提交后将渲染为编号空位；当前空位数：
              <span className="font-medium text-foreground">{blankCount}</span>
            </p>
          )}
        </div>
      </section>

      {/* 答案设置（按题型） */}
      <section className="p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {isChoice ? '选项与答案' : '标准答案'}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {type === 'single-choice' && '标记 1 个正确选项'}
            {type === 'multiple-choice' && '标记 2 个及以上正确选项'}
            {type === 'true-false' && '选择判断题的标准答案'}
            {type === 'fill-blank' && '按空位顺序填写每空的答案'}
          </p>
        </div>

        {/* 选项编辑器（单选 / 多选） */}
        {isChoice && (
          <div className="space-y-3">
            {errors.options && <p className="text-xs text-error">{errors.options}</p>}
            <div className="space-y-2">
              {optionContents.map((content, index) => {
                const letter = OPTION_LETTERS[index]
                const checked = selectedIndexes.includes(index)
                const showEmptyError = showFieldErrors && !content.trim()
                return (
                  <div
                    key={index}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                      showEmptyError ? 'border-error/40' : 'border-border'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 shrink-0 cursor-pointer">
                      <input
                        type={type === 'single-choice' ? 'radio' : 'checkbox'}
                        name="objective-correct-option"
                        checked={checked}
                        onChange={() => handleToggleAnswer(index)}
                        className="w-4 h-4 accent-primary"
                        aria-label={`标记选项 ${letter} 为正确答案`}
                      />
                      <span className="w-6 h-6 rounded-md bg-muted text-muted-foreground text-xs font-medium flex items-center justify-center font-mono">
                        {letter}
                      </span>
                    </label>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={content}
                        onChange={e => handleOptionContentChange(index, e.target.value)}
                        placeholder={`选项 ${letter} 内容`}
                        className="input"
                      />
                      {showEmptyError && (
                        <p className="mt-1 text-xs text-error">选项内容不能为空</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(index)}
                      disabled={optionContents.length <= MIN_OPTIONS}
                      className="p-2 text-muted-foreground hover:text-error rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-muted-foreground shrink-0"
                      aria-label={`删除选项 ${letter}`}
                      title={
                        optionContents.length <= MIN_OPTIONS
                          ? `至少保留 ${MIN_OPTIONS} 个选项`
                          : `删除选项 ${letter}`
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleAddOption}
                disabled={optionContents.length >= MAX_OPTIONS}
                className="btn btn-ghost btn-sm gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                添加选项
              </button>
              <span className="text-xs text-muted-foreground">
                {optionContents.length} / {MAX_OPTIONS} 个选项
              </span>
            </div>
            {errors.answer && <p className="text-xs text-error">{errors.answer}</p>}
          </div>
        )}

        {/* 判断题答案：分段选择按钮 */}
        {type === 'true-false' && (
          <div className="space-y-2">
            <div className="inline-flex border border-border rounded-lg overflow-hidden">
              {([
                { v: true, l: '正确' },
                { v: false, l: '错误' },
              ] as const).map(opt => {
                const selected = trueFalseAnswer === opt.v
                return (
                  <button
                    key={String(opt.v)}
                    type="button"
                    onClick={() => {
                      setTrueFalseAnswer(opt.v)
                      clearError('answer')
                    }}
                    className={`px-8 py-2.5 text-sm transition-colors ${
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {opt.l}
                  </button>
                )
              })}
            </div>
            {errors.answer && <p className="text-xs text-error">{errors.answer}</p>}
          </div>
        )}

        {/* 填空题答案：按空位数自动生成输入列表 */}
        {type === 'fill-blank' &&
          (blankCount === 0 ? (
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
              请先在题干中用 ____（4 个以上连续下划线）标记空位，标记后将自动生成答案输入框
            </p>
          ) : (
            <div className="space-y-2">
              {Array.from({ length: blankCount }, (_, index) => {
                const value = fillAnswers[index] ?? ''
                const isEmpty = showFieldErrors && !value.trim()
                return (
                  <div
                    key={index}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                      isEmpty ? 'border-error/40' : 'border-border'
                    }`}
                  >
                    <span className="w-14 shrink-0 text-sm font-medium text-muted-foreground">
                      {blankLabel(index)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={value}
                        onChange={e => {
                          handleFillAnswerChange(index, e.target.value)
                          clearError('answer')
                        }}
                        placeholder={`第 ${index + 1} 空的答案`}
                        className="input"
                      />
                      {isEmpty && (
                        <p className="mt-1 text-xs text-error">答案不能为空</p>
                      )}
                    </div>
                  </div>
                )
              })}
              {errors.answer && <p className="text-xs text-error">{errors.answer}</p>}
            </div>
          ))}
      </section>

      {/* 标签与解析 */}
      <section className="p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">标签与解析</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">分类标签与题目解析（选填）</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={fieldLabel}>标签</label>
            <input
              type="text"
              value={tagsInput}
              onChange={e => {
                setTagsInput(e.target.value)
                clearError('tags')
              }}
              placeholder={`多个标签用逗号分隔，最多 ${MAX_TAGS} 个`}
              className="input"
            />
            {errors.tags && <p className={errorText}>{errors.tags}</p>}
          </div>
          <div>
            <label className={fieldLabel}>解析（选填）</label>
            <textarea
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              rows={4}
              placeholder="题目解析，将展示给学生在练习后查看…"
              className="input resize-y"
            />
          </div>
        </div>
      </section>

      {/* 底栏操作 */}
      <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center justify-end gap-2 bg-muted/20">
        <button
          type="button"
          onClick={() => router.push('/admin/objective-questions')}
          disabled={submitting}
          className="btn btn-ghost"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary gap-1.5 disabled:opacity-50 min-w-[7.5rem]"
        >
          {submitting ? (
            isEdit ? '保存中…' : '创建中…'
          ) : (
            <>
              <Save className="w-4 h-4" />
              {isEdit ? '保存更改' : '创建题目'}
            </>
          )}
        </button>
      </div>
    </form>
  )
}
