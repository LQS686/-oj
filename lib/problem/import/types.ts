/**
 * lib/problem/import/types.ts
 * 批量导入题库的统一中间数据结构
 *
 * 各格式解析器（FPS / Hydro / SYZOJ / CSV / Codeforces）最终都要把数据
 * 转换为 ImportedProblem，再由 service.ts 统一去重 + 写库。
 *
 * 设计目标：
 *   - 解析器只负责格式转换，不直接访问数据库
 *   - service.ts 不关心原始格式，只消费 ImportedProblem
 *   - 单题失败不应影响其他题目（每题独立 try/catch）
 */
import type { Difficulty } from '@/lib/constants'

/** 单个测试用例（与 ImportedProblem 解耦，可来自 samples 或 tests） */
export interface ImportedTestCase {
  input: string
  output: string
  /** 是否为样例（展示在题目描述中），默认 false */
  isSample?: boolean
  /** 单测点分数（0-100），不填则由 service 均分 */
  score?: number
}

/** 样例（题目描述里展示给用户看的） */
export interface ImportedSample {
  input: string
  output: string
  explanation?: string
}

/** 统一的中间题目数据结构 */
export interface ImportedProblem {
  /** 题目编号（可选，不填则自动生成 Pxxxx） */
  problemNumber?: string
  title: string
  description: string
  /** 题目背景（markdown，可选） */
  background?: string
  input: string
  output: string
  samples: ImportedSample[]
  hint?: string
  source?: string
  /** 难度（必须是 8 档之一，否则 service 会按 fallback 处理） */
  difficulty: string
  tags: string[]
  timeLimit: number
  memoryLimit: number
  comparisonMode?: 'default' | 'strict' | 'ignore-spaces' | 'real-number'
  realPrecision?: number
  /** 标程代码（FPS 的 solution / Hydro 的 std.cpp 等，存到 problem.stdCode） */
  stdCode?: string
  stdLang?: string
  /** 完整测试用例集（不含样例，样例自动从 samples 同步） */
  testCases: ImportedTestCase[]
  /** 原始题号/外部 ID（用于去重日志，不写库） */
  externalId?: string
}

/** 单题导入结果 */
export interface ImportedProblemResult {
  /** 导入状态：created=新建 / skipped=跳过（重名）/ failed=失败 */
  status: 'created' | 'skipped' | 'failed'
  /** 数据库中的题目 ID（仅 created 时有值） */
  problemId?: string
  /** 自动分配的题号（仅 created 时有值） */
  problemNumber?: string
  title: string
  externalId?: string
  /** 跳过/失败原因 */
  reason?: string
}

/** 批量导入结果 */
export interface ImportBatchResult {
  total: number
  created: number
  skipped: number
  failed: number
  results: ImportedProblemResult[]
}

/** 支持的导入格式 */
export type ImportFormat = 'fps' | 'hydro' | 'syzoj' | 'csv' | 'codeforces' | 'dsoj'

/** 导入选项 */
export interface ImportOptions {
  /** 重名题目处理策略：skip=跳过 / overwrite=覆盖 / duplicate=允许重复 */
  onDuplicate: 'skip' | 'overwrite' | 'duplicate'
  /** 默认可见性 */
  visibility: 'public' | 'private' | 'contest'
  /** 默认难度（当导入数据无难度或难度非法时使用） */
  defaultDifficulty: Difficulty
  /** 创建者 ID（必填） */
  authorId: string
  /** Codeforces 同步专用：按 tag 过滤 */
  cfTags?: string[]
  /** Codeforces 同步专用：按 rating 范围过滤 [min, max] */
  cfRatingRange?: [number, number]
  /** Codeforces 同步专用：最大同步题数 */
  cfLimit?: number
}
