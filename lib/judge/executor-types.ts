export interface ExecuteOptions {
  code: string
  language: string
  input: string
  timeLimit: number
  memoryLimit: number
  compiledPath?: string
  /** 临界 TLE 容差比例，extraTime = ceil(max(2000, timeLimit*2) * extraTimeRatio) */
  extraTimeRatio?: number
}

export interface ExecuteResult {
  output: string
  error?: string
  time: number
  memory: number
  exitCode: number
  timeout: boolean
  memoryExceeded: boolean
  runtimeError: boolean
  cannotStart: boolean
  /** CPU 时间（用户态 + 内核态，ms）。Windows 平台回退为墙钟时间 */
  cpuTime?: number
  /** 程序正常完成但 CPU 时间 > timeLimit（且未被强制杀死），用于触发重测 */
  exceedsTimeLimit?: boolean
}
