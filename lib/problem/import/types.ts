/**
 * lib/problem/import/types.ts
 * 批量导入题库的统一中间数据结构
 *
 * 仅支持 DSOJ 标准题包：解析器（dsoj-parser）把题包数据转换为
 * ImportedProblem，再由 service.ts 统一去重 + 写库。
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

/** 题包内附带的题解（如 dsoj-pack solutions/） */
export interface ImportedSolution {
  title: string
  content: string
  /** 原作者名（展示用，入库仍挂导入操作者） */
  authorName?: string
  /** 点赞数（仅用于排序截断） */
  thumbUp?: number
  /** 外部 ID（如洛谷 lid） */
  externalId?: string
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
  /** 难度（必须是洛谷 8 档之一；缺省由 ImportOptions.defaultDifficulty 填充） */
  difficulty: string
  tags: string[]
  timeLimit: number
  memoryLimit: number
  comparisonMode?: 'default' | 'strict' | 'ignore-spaces' | 'real-number' | 'special-judge'
  realPrecision?: number
  /** 标程代码（FPS 的 solution / Hydro 的 std.cpp 等，存到 problem.stdCode） */
  stdCode?: string
  stdLang?: string
  /** Special Judge（Testlib checker.cpp） */
  spjCode?: string
  /** 完整测试用例集（仅 testcases/；与 samples/ 题面样例分离） */
  testCases: ImportedTestCase[]
  /** 可选题解列表（导入后写入 Solution 表） */
  solutions?: ImportedSolution[]
  /** 原始题号/外部 ID（用于去重日志，不写库） */
  externalId?: string
  /**
   * 题包内声明的可见性（dsoj-pack problem.yaml）
   * 有值时优先于 ImportOptions.visibility
   */
  visibility?: 'public' | 'private' | 'contest'
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

/** 流式导入 done 事件的最终汇总 */
export interface ImportStreamDoneSummary {
  total: number
  created: number
  skipped: number
  failed: number
  message: string
}

/** 流式导入 NDJSON 事件（meta → 逐题 item → done / error） */
export type ImportStreamEvent =
  | { type: 'meta'; total: number }
  | { type: 'item'; index: number; result: ImportedProblemResult }
  | { type: 'done'; summary: ImportStreamDoneSummary }
  | { type: 'error'; message: string }

/** 支持的导入格式（仅 DSOJ 标准题包） */
export type ImportFormat = 'dsoj'

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
}
