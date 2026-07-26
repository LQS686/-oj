/**
 * 提交评测状态统一枚举（lib/constants/submission-status.ts）
 *
 * 唯一真相源：读写一律使用本枚举字面量，不做历史写法兼容。
 */

export const SubmissionStatus = {
  /** 等待评测 */
  PENDING: 'PENDING',
  /** 正在评测 */
  JUDGING: 'JUDGING',
  /** 正在运行（评测过程细分） */
  RUNNING: 'RUNNING',
  /** 通过 */
  ACCEPTED: 'AC',
  /** 答案错误 */
  WRONG_ANSWER: 'WA',
  /** 编译错误 */
  COMPILE_ERROR: 'CE',
  /** 运行错误 */
  RUNTIME_ERROR: 'RE',
  /** 超出时间限制 */
  TIME_LIMIT_EXCEEDED: 'TLE',
  /** 超出内存限制 */
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  /** 输出超限 */
  OUTPUT_LIMIT_EXCEEDED: 'OLE',
  /** 格式错误（Presentation Error） */
  PRESENTATION_ERROR: 'PE',
  /** 部分通过 */
  PARTLY_CORRECT: 'PC',
  /** 特判 */
  CHECKER_SPECIAL_PROBLEM: 'CSP',
  /** 系统错误（评测队列失败、容器异常等） */
  SYSTEM_ERROR: 'SE',
  /** 已移除（作业修改 problemIds 时，被移除题目的孤儿提交标记；终态，不再计入统计但保留记录） */
  REMOVED: 'removed',
} as const

export type SubmissionStatusValue = (typeof SubmissionStatus)[keyof typeof SubmissionStatus]

/** 全部合法状态集合（用于运行时校验与 Prisma 写入前断言） */
export const ALL_SUBMISSION_STATUSES: ReadonlySet<string> = new Set(
  Object.values(SubmissionStatus)
)

/** 判断给定字符串是否为合法状态 */
export function isSubmissionStatus(value: unknown): value is SubmissionStatusValue {
  return typeof value === 'string' && ALL_SUBMISSION_STATUSES.has(value)
}

/** 类型守卫：保证写入 Submission.status 一定来自枚举 */
export function assertSubmissionStatus(value: unknown): SubmissionStatusValue {
  if (!isSubmissionStatus(value)) {
    throw new Error(
      `非法的 SubmissionStatus: ${String(value)}。请使用 lib/constants/submission-status.ts 中的 SubmissionStatus 枚举。`
    )
  }
  return value
}

/**
 * 若已是枚举值则原样返回，否则返回空串。
 * 不做驼峰/长文本映射。
 */
export function normalizeStatus(value: unknown): string {
  if (!isSubmissionStatus(value)) return ''
  return value
}

/** 状态机：从当前状态推断允许的下一状态 */
const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  [SubmissionStatus.PENDING]: new Set([
    SubmissionStatus.JUDGING,
    SubmissionStatus.RUNNING,
    SubmissionStatus.SYSTEM_ERROR,
    SubmissionStatus.REMOVED,
  ]),
  [SubmissionStatus.JUDGING]: new Set([
    SubmissionStatus.RUNNING,
    SubmissionStatus.ACCEPTED,
    SubmissionStatus.WRONG_ANSWER,
    SubmissionStatus.COMPILE_ERROR,
    SubmissionStatus.RUNTIME_ERROR,
    SubmissionStatus.TIME_LIMIT_EXCEEDED,
    SubmissionStatus.MEMORY_LIMIT_EXCEEDED,
    SubmissionStatus.OUTPUT_LIMIT_EXCEEDED,
    SubmissionStatus.PRESENTATION_ERROR,
    SubmissionStatus.PARTLY_CORRECT,
    SubmissionStatus.CHECKER_SPECIAL_PROBLEM,
    SubmissionStatus.SYSTEM_ERROR,
    SubmissionStatus.REMOVED,
  ]),
  [SubmissionStatus.RUNNING]: new Set([
    SubmissionStatus.ACCEPTED,
    SubmissionStatus.WRONG_ANSWER,
    SubmissionStatus.RUNTIME_ERROR,
    SubmissionStatus.TIME_LIMIT_EXCEEDED,
    SubmissionStatus.MEMORY_LIMIT_EXCEEDED,
    SubmissionStatus.OUTPUT_LIMIT_EXCEEDED,
    SubmissionStatus.PRESENTATION_ERROR,
    SubmissionStatus.PARTLY_CORRECT,
    SubmissionStatus.CHECKER_SPECIAL_PROBLEM,
    SubmissionStatus.SYSTEM_ERROR,
    SubmissionStatus.REMOVED,
  ]),
  // 终态：除 SystemError（管理员强制覆盖）外，禁止任何转换
  [SubmissionStatus.ACCEPTED]: new Set([SubmissionStatus.SYSTEM_ERROR]),
  [SubmissionStatus.WRONG_ANSWER]: new Set([SubmissionStatus.SYSTEM_ERROR]),
  [SubmissionStatus.COMPILE_ERROR]: new Set([SubmissionStatus.SYSTEM_ERROR]),
  [SubmissionStatus.RUNTIME_ERROR]: new Set([SubmissionStatus.SYSTEM_ERROR]),
  [SubmissionStatus.TIME_LIMIT_EXCEEDED]: new Set([SubmissionStatus.SYSTEM_ERROR]),
  [SubmissionStatus.MEMORY_LIMIT_EXCEEDED]: new Set([SubmissionStatus.SYSTEM_ERROR]),
  [SubmissionStatus.OUTPUT_LIMIT_EXCEEDED]: new Set([SubmissionStatus.SYSTEM_ERROR]),
  [SubmissionStatus.PRESENTATION_ERROR]: new Set([SubmissionStatus.SYSTEM_ERROR]),
  [SubmissionStatus.PARTLY_CORRECT]: new Set([SubmissionStatus.SYSTEM_ERROR]),
  [SubmissionStatus.CHECKER_SPECIAL_PROBLEM]: new Set([SubmissionStatus.SYSTEM_ERROR]),
  // REMOVED：严格终态
  [SubmissionStatus.REMOVED]: new Set([]),
}

/**
 * 状态机转换校验（仅接受枚举字面量）。
 * 空源状态放行（recover / 首次创建）；未知非空源状态拒绝。
 */
export function canTransition(from: string, to: string): boolean {
  if (!from) return true
  const allowed = ALLOWED_TRANSITIONS[from]
  if (!allowed) {
    if (typeof console !== 'undefined') {
      console.warn(
        `[submission-status] canTransition 拒绝未知源状态: from=${from}, to=${to}`
      )
    }
    return false
  }
  return allowed.has(to)
}

const NON_FINAL_STATUSES = new Set<string>([
  SubmissionStatus.PENDING,
  SubmissionStatus.JUDGING,
  SubmissionStatus.RUNNING,
])

/** 是否仍在评测流程中 */
export function isNonFinalSubmissionStatus(status: unknown): boolean {
  return typeof status === 'string' && NON_FINAL_STATUSES.has(status)
}

/** 是否已出终态结果 */
export function isFinalSubmissionStatus(status: unknown): boolean {
  return typeof status === 'string' && status.length > 0 && !isNonFinalSubmissionStatus(status)
}

/** 是否通过 */
export function isAcceptedStatus(status: unknown): boolean {
  return status === SubmissionStatus.ACCEPTED
}

/** 是否编译错误 */
export function isCompileErrorStatus(status: unknown): boolean {
  return status === SubmissionStatus.COMPILE_ERROR
}

/** 非终态查询（列表筛选「等待/评测中」） */
export const NON_FINAL_STATUS_QUERY = [
  SubmissionStatus.PENDING,
  SubmissionStatus.JUDGING,
  SubmissionStatus.RUNNING,
].join(',')
