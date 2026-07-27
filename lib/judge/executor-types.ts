export interface ExecuteOptions {
  code: string
  language: string
  /** 输入内容（小测点 / pretest）；与 inputPath 二选一 */
  input?: string
  /** 输入文件路径（大数据测点优先，避免再拷贝字符串） */
  inputPath?: string
  timeLimit: number
  memoryLimit: number
  compiledPath?: string
  /** 临界 TLE 容差比例，extraTime = ceil(max(2000, timeLimit*2) * extraTimeRatio) */
  extraTimeRatio?: number
  /**
   * 标准答案字节数（用于计算输出上限 OLE）。
   * 缺省时使用硬上限 DEFAULT_MAX_OUTPUT_BYTES。
   */
  expectedOutputBytes?: number
  /** 显式输出上限（字节）；优先于 expectedOutputBytes 推算 */
  outputLimitBytes?: number
  /**
   * 外部中止（fail-fast：其它测点已 TLE 等）。
   * 触发后立即 SIGKILL 选手进程，避免暴力解在并行槽位上跑满时限。
   */
  signal?: AbortSignal
}

/** 评测产物路径；比较完成后须调用 cleanupExecuteArtifacts */
export interface ExecuteArtifacts {
  outputPath: string
  errorPath: string
}

export interface ExecuteResult {
  /**
   * 选手输出预览（最多约 8KB），仅用于 RE 诊断 / pretest 展示。
   * 完整输出在 artifacts.outputPath，切勿再整文件读入内存比对。
   */
  output: string
  error?: string
  time: number
  memory: number
  exitCode: number
  timeout: boolean
  memoryExceeded: boolean
  runtimeError: boolean
  cannotStart: boolean
  /** 输出超限（OLE） */
  outputLimitExceeded?: boolean
  /** 磁盘上的完整输出/错误文件；调用方负责 cleanupExecuteArtifacts */
  artifacts?: ExecuteArtifacts
  /** CPU 时间（用户态 + 内核态，ms）；采不到时回退墙钟 */
  cpuTime?: number
  /** 程序正常完成但 CPU 时间 > timeLimit（且未被强制杀死），用于触发重测 */
  exceedsTimeLimit?: boolean
  /**
   * TLE 触发类型（参考 HOJ/Hydro 的 clockLimit = 3 × cpuLimit 设计）：
   *   - 'wall-clock'：墙钟超时（sleep 型死循环、IO 阻塞等），强制 SIGKILL
   *   - 'cpu'：CPU 时间超限（CPU 满载死循环、算法效率不足等）
   *   - undefined：未触发 TLE
   * 仅当 timeout=true 时有值，用于 judger 端的错误消息细化
   */
  timeoutType?: 'wall-clock' | 'cpu'
  /** 因 AbortSignal 提前终止（非选手自身 TLE） */
  aborted?: boolean
}
