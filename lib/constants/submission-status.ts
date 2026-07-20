/**
 * 提交评测状态统一枚举（lib/constants/submission-status.ts）
 *
 * 唯一真相源：所有写入 Submission.status 的字面量必须来自本枚举。
 * 前端渲染 getStatusConfig() 同时支持短码与长文本两种形态以兼容历史数据。
 *
 * 设计原则：
 *  - 短码（2~3 个大写字母）方便 SQL/索引与人工阅读；
 *  - 系统内部状态（Pending/Judging/Running/SE）也集中在此，避免散落字面量；
 *  - SYSTEM_ERROR = 'SE' 是兼容历史代码中误用的字面量，规范写法应是 SYSTEM_ERROR。
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

/** 状态机：从当前状态推断允许的下一状态（防御非法转换） */
const ALLOWED_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  PENDING: new Set([SubmissionStatus.JUDGING, SubmissionStatus.RUNNING, SubmissionStatus.SYSTEM_ERROR, SubmissionStatus.REMOVED]),
  JUDGING: new Set([
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
  RUNNING: new Set([
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
  // REMOVED：严格终态，不允许转出到任何状态（孤儿提交保留记录但不再参与统计/评测）
  [SubmissionStatus.REMOVED]: new Set([]),
}

/**
 * 历史数据兼容性：早期代码用 'Pending'/'Judging' 大驼峰 + 'Accepted' 长文本，
 * 后期用 'PENDING'/'JUDGING' 大写下划线 + 'AC' 短码。
 * 这里统一抽象为 toUpperCase + 比较，并支持大驼峰 → 短码的映射。
 */
function normalizeInput(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase().replace(/-/g, '_') : ''
}

/**
 * 大驼峰 → 枚举短码映射（兼容历史写法）。
 *   - normalizeStatus 把 'WrongAnswer' 转成 'WRONG_ANSWER'（下划线连接），
 *     然后查表映射到 'WA'。
 *   - 'PENDING'/'JUDGING' 是枚举值本身就 upper，不在 LEGACY_TO_ENUM 中。
 */
const LEGACY_TO_ENUM: Record<string, string> = {
  PENDING: 'PENDING',
  JUDGING: 'JUDGING',
  RUNNING: 'RUNNING',
  ACCEPTED: 'AC',
  WRONG_ANSWER: 'WA',
  COMPILE_ERROR: 'CE',
  RUNTIME_ERROR: 'RE',
  TIME_LIMIT_EXCEEDED: 'TLE',
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  OUTPUT_LIMIT_EXCEEDED: 'OLE',
  PRESENTATION_ERROR: 'PE',
  PARTLY_CORRECT: 'PC',
  CHECKER_SPECIAL_PROBLEM: 'CSP',
  SYSTEM_ERROR: 'SE',
  REMOVED: 'removed',
}

/**
 * 字符串归一化：驼峰 → 下划线连接大写。
 *   'WrongAnswer' -> 'WRONG_ANSWER'
 *   'MemoryLimitExceeded' -> 'MEMORY_LIMIT_EXCEEDED'
 *   'AC' -> 'AC'（已是短码）
 *   'PENDING' -> 'PENDING'
 */
function toSnakeUpper(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toUpperCase()
}

/**
 * 类型守卫：判断 value 是否为合法的 SubmissionStatus 字符串（兼容历史写法）。
 *   支持 'AC' / 'ACCEPTED' / 'Accepted' 三种写法。
 */
export function isValidStatus(value: unknown): value is string {
  const n = normalizeInput(value)
  if (!n) return false
  // 已是枚举短码
  if (ALL_SUBMISSION_STATUSES.has(n)) return true
  // 转为大写下划线后查表
  const snake = toSnakeUpper(n)
  if (ALL_SUBMISSION_STATUSES.has(snake)) return true
  if (snake in LEGACY_TO_ENUM) return true
  return false
}

/**
 * 标准化：将历史短码或大驼峰写法映射到标准枚举值。
 *   'AC' -> 'AC'（已是枚举值）
 *   'Accepted' -> 'AC'
 *   'WA' -> 'WA'
 *   'CE' -> 'CE'
 *   'SE' -> 'SE'
 * 未知值原样返回（不抛错，便于兼容未来扩展）。
 */
export function normalizeStatus(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  // 1) 已是枚举短码（AC/WA/CE 等）
  if (ALL_SUBMISSION_STATUSES.has(trimmed)) return trimmed
  // 2) 转为大写下划线（含 'Accepted' → 'ACCEPTED' 和 'WrongAnswer' → 'WRONG_ANSWER'）
  const snakeUpper = toSnakeUpper(trimmed)
  if (ALL_SUBMISSION_STATUSES.has(snakeUpper)) return snakeUpper
  // 3) 通过 LEGACY_TO_ENUM 映射
  const mapped = LEGACY_TO_ENUM[snakeUpper]
  if (mapped) return mapped
  // 4) 未知值返回原始大写下划线形式（便于日志调试）
  return snakeUpper
}

/**
 * 状态机转换校验（自动归一化两端）。
 *   输入 'Accepted' -> 'AC' 后再查表；'Pending' -> 'PENDING' 后查表。
 *
 * fail-closed 策略：
 *   - 空源状态放行（recover / 首次创建场景，无源状态可校验）
 *   - 非空未知源状态拒绝转换，防止新增枚举值未及时维护 ALLOWED_TRANSITIONS
 *     时状态机保护形同虚设。
 */
export function canTransition(from: string, to: string): boolean {
  const f = normalizeStatus(from) || from
  const t = normalizeStatus(to) || to
  // 空源状态放行（recover / 首次创建场景）
  if (!f) return true
  const allowed = ALLOWED_TRANSITIONS[f]
  if (!allowed) {
    // fail-closed：未知非空源状态拒绝任何转换，需显式登记到 ALLOWED_TRANSITIONS
    if (typeof console !== 'undefined') {
      console.warn(
        `[submission-status] canTransition 拒绝未知源状态: from=${f}, to=${t}`
      )
    }
    return false
  }
  return allowed.has(t)
}