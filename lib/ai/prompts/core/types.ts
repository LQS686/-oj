
export enum GenerationMode {
  PARAM_GEN = 'ParamGen',
  TEST_DATA_GEN = 'TestDataGen',
  /**
   * 题目智能分析：只读分析已有题目，输出 5 维度评估结果
   * （标签建议 / 难度建议 / 质量问题 / 测试维度缺口 / 提示建议）
   */
  ANALYZE = 'Analyze',
  /**
   * 元数据建议：基于题目描述生成 tags / difficulty / hint / timeLimit / memoryLimit
   * 不生成 testCases / 标程
   */
  SUGGEST_METADATA = 'SuggestMetadata',
  /**
   * 相似题生成（Task 28）：基于已有题目生成变体，读取原题信息作为 prompt 上下文，
   * 走与 PARAM_GEN 一致的预览-确认流程
   */
  SIMILAR = 'Similar',
  /**
   * 失败诊断（Task 30）：对 FAILED 任务的 error / result.parseError / result.qualityIssues
   * 自动分析，调用轻量 AI 返回 { failureType, suggestedFix }
   */
  DIAGNOSE = 'Diagnose',
  /**
   * 测试数据增量补充（Task 33）：基于 inferCoveredDimensions 推断已覆盖维度，
   * 仅生成缺失维度的测试点，**追加**而非 deleteMany 原有数据
   */
  TEST_DATA_INCREMENTAL = 'TestDataIncremental',
}

/**
 * AI 出题可选算法主题（可多选）
 *
 * 覆盖 OI/ACM 主流算法类别 + 通用数据结构 + 数学/几何/字符串
 * 与前端 AI 出题页的 chips 选项保持一致；扩展时同时更新两边
 *
 * 设计原则：
 * 1. 一个词或短语能精确锁定一类算法；AI 收到多个主题时会融合到一道题里
 * 2. 不放"动态规划"的同时放"区间 DP"——后者是前者的子集；避免冗余
 * 3. 与 DIFFICULTIES 配合，主题难度由"目标难度"决定，而非主题本身
 * 4. "基础语法"组用于入门档（变量 / if / 循环等），与算法类主题不重叠
 */
export const TOPICS = [
  // 基础语法（入门档，编程语言基础要素；不依赖任何算法）
  '变量与类型', '输入输出', '运算符与表达式', 'if 判断', '循环', '数组基础',
  '字符串基础', '函数', '结构体', '递归入门', 'switch',
  // 基础算法
  '枚举', '模拟', '递推', '前缀和', '差分', '离散化', '倍增',
  // 排序/查找
  '排序', '二分查找', '二分答案', '三分', '分治',
  // 动态规划
  '动态规划', '背包', '区间 DP', '树形 DP', '状压 DP', '数位 DP', '概率 DP', 'DP 优化',
  // 贪心
  '贪心',
  // 图论
  '图论', '最短路', '最小生成树', '拓扑排序', '二分图', '强连通分量', '网络流', '树上问题',
  // 搜索
  'DFS/BFS', '搜索剪枝', '启发式搜索', 'A*', 'IDA*',
  // 字符串
  '字符串', '字符串哈希', 'KMP', 'Trie', 'AC 自动机', '后缀数组', '后缀自动机', 'Manacher',
  // 数据结构
  '数据结构', '栈', '队列', '链表', '堆/优先队列', '单调栈', '单调队列', '并查集',
  '线段树', '树状数组', '平衡树', '可持久化', '树链剖分',
  // 数学
  '数论', '组合数学', '概率期望', '博弈论', '矩阵乘法', '生成函数', '多项式', '线性代数',
  // 计算几何
  '计算几何', '扫描线',
  // 高级/特殊
  '位运算', '构造', '随机化', '莫队', '分块', 'CDQ 分治', 'K-D Tree', '李超树'
] as const

export type Topic = typeof TOPICS[number]

export interface GeneratedProblem {
  title: string;
  description: string;
  input: string;
  output: string;
  samples: Array<{ input: string; output: string; explanation?: string }>;
  test_cases: Array<{ input: string; output: string }>;
  difficulty: string;
  tags: string[];
  hint?: string;
  time_limit?: number;
  memory_limit?: number;
  /**
   * C++17 标程（**必填**）——题目的标准解答 + output 生成工具，写入 problem.stdCode，
   * 题解参考代码段使用，必须可独立编译运行，且与题目逻辑严格一致。
   * C++ 标程是题目唯一权威解答，所有 test_cases.output 由后端编译运行此代码生成。
   */
  solution_cpp?: string;
  /**
   * Python3 标程（**可选**）——AI 主动生成则保留，后端不使用；
   * C++ 标程是题目唯一权威解答，Python 不再作为数据生成工具。
   */
  solution_python?: string;
  // 5 段式 markdown 题解，与 solution-article-feature 规范一致（思路分析 / 算法描述 / 复杂度分析 / 参考代码 / 关键点说明）
  // 业务决策（2026-06）：单次 AI 调用同时返回题目 + 题解，避免后续再入队题解生成任务
  solution_article?: string;
}

export interface BaseContext {
  mode: GenerationMode;
}

export interface ParamGenContext extends BaseContext {
  mode: GenerationMode.PARAM_GEN;
  type: string;
  difficulty: string;
  topic: string[];
  count: number;
  additionalInfo?: string;
  /**
   * PRE-generation 候选相似题列表（Phase 6 Task 7.4）。
   *
   * 在 enqueueAiGeneration 时根据 topic + difficulty 检索题库相同主题+难度的题目
   * （最多 5 道），注入此字段。ParamGen generator 检测到非空时引用
   * DUPLICATE_AVOIDANCE_SPEC 提示 AI 避开雷同；空时不引用。
   */
  avoidDuplicateWith?: Array<{ title: string; tags: string[] }>;
}

export interface TestDataGenContext extends BaseContext {
  mode: GenerationMode.TEST_DATA_GEN;
  title: string;
  description: string;
  inputDescription: string;
  outputDescription: string;
  count: number;
  hasSolution?: boolean;
}

/**
 * 题目智能分析上下文（只读分析，不修改题目）
 */
export interface AnalyzeContext extends BaseContext {
  mode: GenerationMode.ANALYZE;
  problem: {
    title: string;
    description: string;
    input?: string;
    output?: string;
    samples?: any[];
    tags?: string[];
    difficulty?: string;
    stdCode?: string | null;
    stdLang?: string | null;
    hint?: string | null;
  };
}

/**
 * 元数据建议上下文（轻量，只输出元数据）
 */
export interface SuggestMetadataContext extends BaseContext {
  mode: GenerationMode.SUGGEST_METADATA;
  description: string;
  samples?: any[];
  input?: string;
  output?: string;
}

/**
 * 相似题生成上下文（Task 28）
 *
 * 基于已有题目信息生成变体，复用 ParamGen 模板 + 注入原题信息
 */
export interface SimilarContext extends BaseContext {
  mode: GenerationMode.SIMILAR;
  type: string;
  difficulty: string;
  topic: string[];
  count: number;
  additionalInfo?: string;
  /** 原题信息（作为 prompt 上下文注入） */
  sourceProblem: {
    title: string;
    description: string;
    input?: string;
    output?: string;
    tags?: string[];
    difficulty?: string;
    stdCode?: string | null;
    stdLang?: string | null;
  };
  /**
   * PRE-generation 候选相似题列表（Phase 6 Task 7.4）。
   *
   * 与 ParamGenContext.avoidDuplicateWith 语义一致——在 enqueueAiGeneration 时
   * 根据 topic + difficulty 检索题库相同主题+难度的题目（最多 5 道），注入此字段。
   * Similar generator 检测到非空时引用 DUPLICATE_AVOIDANCE_SPEC 提示 AI 避开雷同；空时不引用。
   */
  avoidDuplicateWith?: Array<{ title: string; tags: string[] }>;
}

/**
 * 失败诊断上下文（Task 30）
 *
 * 分析 FAILED 任务的 error / parseError / qualityIssues，返回 { failureType, suggestedFix }
 */
export interface DiagnoseContext extends BaseContext {
  mode: GenerationMode.DIAGNOSE;
  /** 原任务的错误信息 */
  error: string;
  /** 原任务的 mode（用于分类失败类型） */
  originalMode: string;
  /** 原任务的解析错误信息（如有） */
  parseError?: string;
  /** 原任务的质量问题（如有） */
  qualityIssues?: string[];
  /** 原任务的 promptHash（用于关联同类失败任务，Task 39.4） */
  promptHash?: string;
}

/**
 * 测试数据增量补充上下文（Task 33）
 *
 * 基于现有测试点推断已覆盖维度，仅生成缺失维度的测试点
 */
export interface TestDataIncrementalContext extends BaseContext {
  mode: GenerationMode.TEST_DATA_INCREMENTAL;
  title: string;
  description: string;
  inputDescription: string;
  outputDescription: string;
  count: number;
  hasSolution?: boolean;
  /** 已覆盖的维度（来自 inferCoveredDimensions） */
  coveredDimensions: Array<{ id: string; name: string }>;
  /** 缺失的维度（需要 AI 补充的） */
  missingDimensions: Array<{ id: string; name: string }>;
}

export type PromptContext =
  | ParamGenContext
  | TestDataGenContext
  | AnalyzeContext
  | SuggestMetadataContext
  | SimilarContext
  | DiagnoseContext
  | TestDataIncrementalContext;

export interface PromptResult {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}

export interface PromptGenerator {
  generate(context: PromptContext): PromptResult;
  generateThinkingPrompt(context: PromptContext): string;
}

export class PromptCrossUseException extends Error {
  constructor(message: string, public context?: any) {
    super(message);
    this.name = 'PromptCrossUseException';
  }
}
