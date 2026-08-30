'use client'

/**
 * ObjectiveQuestionWorkspace
 *
 * 客观题学生作答工作区（作业页中栏 + 右栏双栏布局）：
 * - 中栏（card-flat）：元信息行、题干 Markdown、按题型渲染的作答控件
 *   （单选 / 多选 / 判断 / 填空）
 * - 右栏（card-static sticky top-[72px]）：提交按钮、最近一次判分结果、
 *   提交次数与「逾期提交」警示徽标
 *
 * 集成约定：
 * - 切换题目时由父组件用 key={question.id} 强制重挂载本组件；
 *   草稿作答只在挂载时从 submission 初始化一次，组件内不做 prop 同步
 * - 提交成功后通过 onSubmitted 把最新作答回传给页面，由页面更新本地
 *   objectiveSubmissions 状态；本组件展示的「最近一次结果」即来自
 *   更新后的 submission prop
 * - 解析（explanation）不随题目数据下发（防答案泄露），仅在提交后由
 *   objective-submit 接口返回，保存在组件内部状态中展示
 * - 移动端单列堆叠（中栏在上、右栏在下），由 grid-cols-1 天然实现
 */

import { Fragment, useState } from 'react'
import { AlertCircle, Check, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import MarkdownContent from '@/components/common/MarkdownContent'
import {
  OBJECTIVE_QUESTION_TYPE_LABELS,
  OBJECTIVE_QUESTION_TYPE_TAG_CLASSES,
  countFillBlanks,
  splitFillBlankStem,
  type ObjectiveAnswer,
  type ObjectiveQuestionOption,
  type ObjectiveQuestionType,
  type ObjectiveSubmissionDTO,
} from '@/lib/objective-question/types'

/** objective-submit 接口响应的 data（服务端绝不返回标准答案） */
interface ObjectiveSubmitResponseData {
  isCorrect: boolean
  score: number
  explanation: string | null
  submitCount?: number
  submittedAt?: string
  isLate?: boolean
}

/** 提交成功后回传给页面的最新作答结果 */
export interface ObjectiveSubmittedResult {
  /** 题目 ID */
  questionId: string
  /** 本次提交的作答（结构同 ObjectiveAnswer） */
  answer: ObjectiveAnswer
  /** 是否判分正确 */
  isCorrect: boolean
  /** 得分：正确 = 题目分值，错误 = 0 */
  score: number
  /** 累计提交次数（重复提交 upsert 时 +1） */
  submitCount: number
  /** 提交时间（ISO 字符串） */
  submittedAt: string
  /** 是否逾期提交 */
  isLate: boolean
}

export interface ObjectiveQuestionWorkspaceProps {
  /** 班级 ID */
  classId: string
  /** 作业 ID */
  assignmentId: string
  /** 当前题目（作业详情返回的客观题条目，不含 answer / explanation） */
  question: {
    /** 题目 ID */
    id: string
    /** 题号，如 "Q1001"（可能为空） */
    questionNumber: string | null
    /** 题型 */
    type: ObjectiveQuestionType
    /** 题干（Markdown，填空题以 ≥4 连续下划线 ____ 标记空位） */
    title: string
    /** 难度：'简单' | '中等' | '困难' */
    difficulty: string
    /** 建议分值（1-100） */
    score: number
    /** 选项列表（单选/多选使用；判断/填空为 null） */
    options: ObjectiveQuestionOption[] | null
  }
  /** 当前用户最近一次作答（回填用），null = 未作答 */
  submission: ObjectiveSubmissionDTO | null
  /** 作业进行中为 true（时间窗判断由页面做：upcoming / ended 且不允许补交时为 false） */
  canSubmit: boolean
  /** 提交成功后回调（null 表示重置，预留）；页面用它更新本地 submissions 状态 */
  onSubmitted: (result: ObjectiveSubmittedResult | null) => void
}

/** 客观题难度对应的展示类名（与 ObjectiveQuestionPicker 的映射一致） */
function difficultyClass(difficulty: string) {
  if (difficulty === '简单') return 'bg-secondary/10 text-secondary-light'
  if (difficulty === '中等') return 'bg-accent/10 text-accent-light'
  return 'bg-error/10 text-error'
}

/** 序号 → 带圈数字（①..⑳，超出回退 (n)），用于填空题空位编号 */
function circledNumber(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x245f + n)
  return `(${n})`
}

export default function ObjectiveQuestionWorkspace({
  classId,
  assignmentId,
  question,
  submission,
  canSubmit,
  onSubmitted,
}: ObjectiveQuestionWorkspaceProps) {
  // === 草稿作答：挂载时自 submission.answer 回填一次（父组件用 key={question.id} 控制重置） ===
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    if (question.type !== 'single-choice' || !submission) return null
    const first = submission.answer[0]
    return typeof first === 'string' &&
      (question.options ?? []).some((o) => o.key === first)
      ? first
      : null
  })
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => {
    if (question.type !== 'multiple-choice' || !submission) return []
    const keys = (question.options ?? []).map((o) => o.key)
    return submission.answer.filter(
      (v): v is string => typeof v === 'string' && keys.includes(v)
    )
  })
  const [trueFalseValue, setTrueFalseValue] = useState<boolean | null>(() => {
    if (question.type !== 'true-false' || !submission) return null
    const first = submission.answer[0]
    return typeof first === 'boolean' ? first : null
  })
  const blankCount =
    question.type === 'fill-blank' ? countFillBlanks(question.title) : 0
  const [fillValues, setFillValues] = useState<string[]>(() => {
    if (question.type !== 'fill-blank' || blankCount <= 0) return []
    if (!submission) return Array.from({ length: blankCount }, () => '')
    return Array.from({ length: blankCount }, (_, i) => {
      const v = submission.answer[i]
      return typeof v === 'string' ? v : ''
    })
  })

  // 最近一次提交返回的解析（题目数据不含 explanation，仅在提交后由服务端返回）
  const [explanation, setExplanation] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  /** 当前草稿作答；null = 未作任何选择/填写（提交按钮禁用） */
  const currentAnswer: ObjectiveAnswer | null =
    question.type === 'single-choice'
      ? selectedKey !== null
        ? [selectedKey]
        : null
      : question.type === 'multiple-choice'
        ? selectedKeys.length > 0
          ? [...selectedKeys]
          : null
        : question.type === 'true-false'
          ? trueFalseValue !== null
            ? [trueFalseValue]
            : null
          : fillValues.some((v) => v.trim() !== '')
            ? [...fillValues]
            : null

  const handleSubmit = async () => {
    if (!canSubmit || submitting || !currentAnswer) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const response = await fetchWithCookie(
        `/api/classes/${classId}/assignments/${assignmentId}/objective-submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId: question.id, answer: currentAnswer }),
        }
      )
      const data = await response.json()
      if (data.success) {
        const payload = (data.data ?? {}) as ObjectiveSubmitResponseData
        setExplanation(payload.explanation ?? null)
        onSubmitted({
          questionId: question.id,
          answer: currentAnswer,
          isCorrect: payload.isCorrect,
          score: payload.score,
          submitCount: payload.submitCount ?? (submission?.submitCount ?? 0) + 1,
          submittedAt: payload.submittedAt ?? new Date().toISOString(),
          isLate: payload.isLate ?? false,
        })
      } else {
        setSubmitError(typeof data.error === 'string' ? data.error : '提交失败，请稍后重试')
      }
    } catch {
      setSubmitError('网络错误，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-3 items-start">
      {/* 中栏：题面与作答 */}
      <div className="card-flat rounded-lg overflow-hidden min-w-0">
        <div className="p-5 lg:p-6 space-y-5">
          {/* 元信息行 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <span className={`tag ${OBJECTIVE_QUESTION_TYPE_TAG_CLASSES[question.type]}`}>
              {OBJECTIVE_QUESTION_TYPE_LABELS[question.type]}
            </span>
            {question.questionNumber && (
              <span className="font-mono">{question.questionNumber}</span>
            )}
            <span>{question.score} 分</span>
            <span
              className={`px-2 py-0.5 rounded font-medium ${difficultyClass(question.difficulty)}`}
            >
              {question.difficulty}
            </span>
          </div>

          {/* 题干：填空题按空位切片段，片段间渲染编号空位占位 */}
          {question.type === 'fill-blank' ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
              {splitFillBlankStem(question.title).map((segment, index) => (
                <Fragment key={index}>
                  {segment !== '' && <MarkdownContent content={segment} />}
                  {index < blankCount && (
                    <span className="inline-flex items-center justify-center shrink-0 min-w-[1.75rem] h-7 px-1.5 rounded-md border border-dashed border-primary/50 bg-primary/5 text-primary text-sm font-semibold leading-none">
                      {circledNumber(index + 1)}
                    </span>
                  )}
                </Fragment>
              ))}
            </div>
          ) : (
            <MarkdownContent content={question.title} />
          )}

          {/* 作答控件 */}
          <div className="pt-5 border-t border-border">
            {/* 单选：选项卡片，点击选中，再次点击可取消 */}
            {question.type === 'single-choice' && (
              <div className="space-y-2.5">
                {(question.options ?? []).map((option) => {
                  const selected = selectedKey === option.key
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() =>
                        setSelectedKey((prev) => (prev === option.key ? null : option.key))
                      }
                      aria-pressed={selected}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors flex items-start gap-3 cursor-pointer ${
                        selected
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/40 hover:bg-primary/5'
                      }`}
                    >
                      <span
                        className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold ${
                          selected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {option.key}
                      </span>
                      <MarkdownContent
                        content={option.content}
                        className="min-w-0 flex-1"
                      />
                    </button>
                  )
                })}
              </div>
            )}

            {/* 多选：选项卡片，点击切换勾选状态（选中角标 ✓） */}
            {question.type === 'multiple-choice' && (
              <div className="space-y-2.5">
                {(question.options ?? []).map((option) => {
                  const selected = selectedKeys.includes(option.key)
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() =>
                        setSelectedKeys((prev) =>
                          prev.includes(option.key)
                            ? prev.filter((k) => k !== option.key)
                            : [...prev, option.key]
                        )
                      }
                      aria-pressed={selected}
                      className={`relative w-full text-left px-4 py-3 rounded-lg border transition-colors flex items-start gap-3 cursor-pointer ${
                        selected
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/40 hover:bg-primary/5'
                      }`}
                    >
                      <span
                        className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold ${
                          selected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {option.key}
                      </span>
                      <MarkdownContent
                        content={option.content}
                        className="min-w-0 flex-1 pr-6"
                      />
                      {selected && (
                        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* 判断：两个大按钮，单选互斥 */}
            {question.type === 'true-false' && (
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <button
                  type="button"
                  onClick={() => setTrueFalseValue((prev) => (prev === true ? null : true))}
                  aria-pressed={trueFalseValue === true}
                  className={`py-4 rounded-lg border transition-colors flex items-center justify-center gap-2 text-base font-medium cursor-pointer ${
                    trueFalseValue === true
                      ? 'border-secondary bg-secondary/10 text-secondary'
                      : 'border-border hover:border-secondary/40 hover:bg-secondary/5 text-foreground'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  正确
                </button>
                <button
                  type="button"
                  onClick={() => setTrueFalseValue((prev) => (prev === false ? null : false))}
                  aria-pressed={trueFalseValue === false}
                  className={`py-4 rounded-lg border transition-colors flex items-center justify-center gap-2 text-base font-medium cursor-pointer ${
                    trueFalseValue === false
                      ? 'border-error bg-error/10 text-error'
                      : 'border-border hover:border-error/40 hover:bg-error/5 text-foreground'
                  }`}
                >
                  <XCircle className="w-5 h-5" />
                  错误
                </button>
              </div>
            )}

            {/* 填空：按空位数渲染输入框，已有作答回填 */}
            {question.type === 'fill-blank' && (
              <div className="space-y-3 max-w-xl">
                {fillValues.map((value, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <label
                      htmlFor={`${question.id}-blank-${index}`}
                      className="shrink-0 text-sm font-medium text-muted-foreground"
                    >
                      空{circledNumber(index + 1)}
                    </label>
                    <input
                      id={`${question.id}-blank-${index}`}
                      type="text"
                      value={value}
                      onChange={(e) =>
                        setFillValues((prev) =>
                          prev.map((v, i) => (i === index ? e.target.value : v))
                        )
                      }
                      placeholder={`请输入第 ${index + 1} 空的答案`}
                      className="input flex-1 min-w-0"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 右栏：提交与结果 */}
      <div className="lg:sticky lg:top-[72px] min-w-0">
        <div className="card-static rounded-lg overflow-hidden">
          <div className="p-4 space-y-3">
            {/* 提交按钮 */}
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || submitting || !currentAnswer}
              className="btn btn-primary w-full"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  提交中...
                </>
              ) : (
                '提交作答'
              )}
            </button>

            {!canSubmit && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                作业未开始或已结束，暂不能提交
              </p>
            )}
            {canSubmit && !currentAnswer && !submitting && (
              <p className="text-xs text-muted-foreground">请先选择或填写作答内容</p>
            )}

            {/* 提交失败提示（400 / 403 等） */}
            {submitError && (
              <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-error text-xs flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* 最近一次结果卡 */}
            {submission && (
              <div
                className={`rounded-lg border p-3 space-y-2.5 ${
                  submission.isCorrect
                    ? 'border-secondary/30 bg-secondary/10'
                    : 'border-error/30 bg-error/10'
                }`}
              >
                <div
                  className={`flex items-center gap-2 text-sm font-semibold ${
                    submission.isCorrect ? 'text-secondary' : 'text-error'
                  }`}
                >
                  {submission.isCorrect ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      回答正确 +{submission.score} 分
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 shrink-0" />
                      回答错误 {submission.score} 分
                    </>
                  )}
                </div>

                {explanation && (
                  <div className="pt-2.5 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">解析</p>
                    <MarkdownContent content={explanation} />
                  </div>
                )}
              </div>
            )}

            {/* 元信息：提交次数 + 逾期标记 */}
            {submission ? (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>第 {submission.submitCount} 次提交</span>
                {submission.isLate && <span className="tag tag-warning">逾期提交</span>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">尚未提交</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
