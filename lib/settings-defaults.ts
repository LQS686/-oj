/**
 * 系统设置默认值（无 Prisma / 加密依赖，可安全被客户端组件引用）。
 */

export type FailFastMode = 'off' | 'hard' | 'all'

/** 评测相关默认值（与 .env.example / lib/judge/config 对齐） */
export const defaultJudgeSettings = {
  /** 单任务最大评测时长（秒） */
  jobTimeout: 300,
  /** fail-fast：off | hard | all */
  failFast: 'off' as FailFastMode,
  /** 跨提交并发（4 核服务器默认 2：留 2 核给 Next.js 主进程与编译） */
  maxConcurrent: 2,
  /** 同提交测点并行度；0 = 按 CPU 自动（容器内会读到宿主机核数，易偏高）。
   *  注意：这是评测实际总并行度（mapPool worker 数），大测点槽位在其内部再限流，
   *  若 caseConcurrency < largeCaseConcurrency 则 large 槽位不生效。4 核推荐 3。 */
  caseConcurrency: 3,
  /** 大 I/O 测点并行度（4 核服务器 3：百万行测点 input>2MB 全走此槽位，2 路会严重排队） */
  largeCaseConcurrency: 3,
  /** 临界 TLE 重测次数 */
  rejudgeTimes: 1,
  /** 超时容差比例 */
  extraTimeRatio: 0.1,
  /** 编译超时（毫秒） */
  compileTimeout: 20000,
  // —— 高级 ——
  /** 大输出墙钟 I/O 裕量上限（毫秒） */
  ioSlackMaxMs: 30000,
  /** 死任务扫描间隔（毫秒） */
  deadCheckMs: 5000,
  /** close 事件兜底等待（毫秒）；过短易漏检伪 EOF，默认 2s */
  closeFallbackMs: 2000,
  /** 「大测点」字节阈值 */
  largeCaseBytes: 2 * 1024 * 1024,
}

export type JudgeSettings = typeof defaultJudgeSettings

export const defaultSettings = {
  siteName: '大山 OJ',
  siteDescription: '代码如山·算法为径·陪你从入门到顶峰',
  allowRegistration: true,
  allowGuestSubmission: false,
  defaultLanguage: 'cpp',
  maxSubmissionSize: 65536,
  smtpHost: '',
  smtpPort: 465,
  smtpUser: '',
  smtpFrom: '',
  // 授权码：存储时加密，对外展示时掩码
  smtpPassword: '',
  // 是否启用 SSL（QQ 邮箱端口 465 需为 true，587 通常为 false）
  smtpSecure: true,
  judge: { ...defaultJudgeSettings },
}

export type SystemSettings = typeof defaultSettings

/** 规范化 failFast 字符串 */
export function normalizeFailFast(raw: unknown): FailFastMode {
  const s = String(raw ?? 'off').trim().toLowerCase()
  if (s === 'hard') return 'hard'
  if (s === 'all' || s === 'any') return 'all'
  return 'off'
}

/** 合并 DB/请求中的 judge 片段到完整 JudgeSettings */
export function mergeJudgeSettings(
  partial?: Partial<JudgeSettings> | null,
): JudgeSettings {
  const src = partial && typeof partial === 'object' ? partial : {}
  return {
    jobTimeout: clampInt(src.jobTimeout, 30, 3600, defaultJudgeSettings.jobTimeout),
    failFast: normalizeFailFast(src.failFast ?? defaultJudgeSettings.failFast),
    maxConcurrent: clampInt(src.maxConcurrent, 1, 16, defaultJudgeSettings.maxConcurrent),
    caseConcurrency: clampInt(src.caseConcurrency, 0, 16, defaultJudgeSettings.caseConcurrency),
    largeCaseConcurrency: clampInt(
      src.largeCaseConcurrency,
      1,
      8,
      defaultJudgeSettings.largeCaseConcurrency,
    ),
    rejudgeTimes: clampInt(src.rejudgeTimes, 0, 5, defaultJudgeSettings.rejudgeTimes),
    extraTimeRatio: clampFloat(src.extraTimeRatio, 0, 1, defaultJudgeSettings.extraTimeRatio),
    compileTimeout: clampInt(
      src.compileTimeout,
      5000,
      120000,
      defaultJudgeSettings.compileTimeout,
    ),
    ioSlackMaxMs: clampInt(src.ioSlackMaxMs, 5000, 120000, defaultJudgeSettings.ioSlackMaxMs),
    deadCheckMs: clampInt(src.deadCheckMs, 2000, 30000, defaultJudgeSettings.deadCheckMs),
    closeFallbackMs: clampInt(src.closeFallbackMs, 200, 5000, defaultJudgeSettings.closeFallbackMs),
    largeCaseBytes: clampInt(
      src.largeCaseBytes,
      256 * 1024,
      64 * 1024 * 1024,
      defaultJudgeSettings.largeCaseBytes,
    ),
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function clampFloat(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
