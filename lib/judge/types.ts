// 评测机共享类型定义
// 参考 Project LemonLime 的 LemonType.hpp / task.h / testcase.h

/**
 * 评测结果状态
 * 参考 LemonLime ResultState，映射为 OJ 用的短代码
 */
export type ResultState =
  | 'AC'   // Accepted (CorrectAnswer)
  | 'WA'   // Wrong Answer
  | 'TLE'  // Time Limit Exceeded
  | 'MLE'  // Memory Limit Exceeded
  | 'RE'   // Runtime Error
  | 'CE'   // Compile Error
  | 'SE'   // System Error
  | 'PC'   // Partly Correct (部分正确，预留)
  | 'PE'   // Presentation Error
  | 'OLE'  // Output Limit Exceeded
  | 'CSP'  // Cannot Start Program
  | 'Judging'
  | 'Pending'

/**
 * 编译状态
 * 参考 LemonLime CompileState
 */
export enum CompileState {
  CompileSuccessfully = 'CompileSuccessfully',
  NoValidSourceFile = 'NoValidSourceFile',
  CompileError = 'CompileError',
  CompileTimeLimitExceeded = 'CompileTimeLimitExceeded',
  InvalidCompiler = 'InvalidCompiler',
}

/**
 * 输出比较模式
 * 参考 LemonLime Task::ComparisonMode，仅保留传统题所需模式
 */
export type ComparisonMode = 'default' | 'strict' | 'ignore-spaces' | 'real-number'

/**
 * 比较输入
 */
export interface CompareInput {
  /** 选手输出 */
  userOutput: string
  /** 标准答案 */
  expectedOutput: string
  /** 该测点满分 */
  fullScore: number
  /** 比较模式 */
  comparisonMode: ComparisonMode
  /** 浮点数比较精度（小数位数），默认 3，仅 real-number 模式生效 */
  realPrecision?: number
}

/**
 * 比较结果
 */
export interface CompareResult {
  /** 得分（0 或 fullScore） */
  score: number
  /** 结果状态 */
  status: ResultState
  /** 详情消息 */
  message: string
}

/**
 * 单测点判定结果
 */
export interface JudgeVerdict {
  status: ResultState
  score: number
  time: number
  memory: number
  message: string
}

/**
 * 结果状态显示文案映射
 */
export const RESULT_STATE_LABELS: Record<ResultState, string> = {
  AC: 'Accepted',
  WA: 'Wrong Answer',
  TLE: 'Time Limit Exceeded',
  MLE: 'Memory Limit Exceeded',
  RE: 'Runtime Error',
  CE: 'Compile Error',
  SE: 'System Error',
  PC: 'Partly Correct',
  PE: 'Presentation Error',
  OLE: 'Output Limit Exceeded',
  CSP: 'Cannot Start Program',
  Judging: 'Judging',
  Pending: 'Pending',
}

/**
 * 结果状态颜色映射（tailwind 类名片段，用于前端展示）
 */
export const RESULT_STATE_COLORS: Record<ResultState, string> = {
  AC: 'green',
  WA: 'red',
  TLE: 'yellow',
  MLE: 'yellow',
  RE: 'red',
  CE: 'red',
  SE: 'gray',
  PC: 'blue',
  PE: 'yellow',
  OLE: 'yellow',
  CSP: 'red',
  Judging: 'blue',
  Pending: 'gray',
}

/**
 * 编译状态对应的 CE message 前缀
 */
export const COMPILE_STATE_MESSAGES: Record<CompileState, string> = {
  [CompileState.CompileSuccessfully]: '',
  [CompileState.NoValidSourceFile]: 'NoValidSourceFile',
  [CompileState.CompileError]: 'CompileError',
  [CompileState.CompileTimeLimitExceeded]: 'CompileTimeLimitExceeded',
  [CompileState.InvalidCompiler]: 'InvalidCompiler',
}
