/**
 * 共享 Prompt 基础：难度档位定义 + 质量门禁 + Few-shot 范例
 *
 * 设计目标：
 *   1. 让 2 个生成器（ParamGen / TestDataGen）共享统一的质量门禁与难度档位
 *   2. 避免在每个 generator 中重复定义相同规则
 *   3. 集中维护，便于后续微调
 *
 * 难度体系对齐洛谷 8 档权威定义（lib/constants.ts 为唯一真相源）：
 *   参考：https://help.luogu.com.cn/manual/luogu/problem/difficulty
 */

import type { Difficulty } from '@/lib/constants'

// 难度类型从 lib/constants 引入，保持全站单一真相源
export type { Difficulty }

/**
 * 难度档位 → 算法典型 + 时空约束 + 标签库 + 洛谷权威描述
 *
 * description 字段对齐洛谷官方难度定义，用于 AI prompt 中给模型明确指引。
 * algorithmExamples 参考洛谷各档位代表试题涉及的算法。
 */
export const DIFFICULTY_PROFILES: Record<Difficulty, {
  algorithmExamples: string[]
  tags: string[]
  timeLimitRange: [number, number]
  memoryLimitRange: [number, number]
  description: string
  /** 洛谷官方对该档位的训练时长指引（用于 prompt 中增强难度感知） */
  trainingHours: string
}> = {
  '入门': {
    description: '面向编程新手，主要考察分支结构、循环、数组及简单字符串处理等基础内容。掌握一门编程语言的基本语法后即可通过。对应 CSP-J 第一题。',
    trainingHours: '掌握基本语法即可',
    algorithmExamples: ['基础循环', '条件判断', '简单模拟', '数组遍历', '字符串基础'],
    tags: ['入门', '模拟', '基础语法'],
    timeLimitRange: [1000, 1500],
    memoryLimitRange: [64, 128]
  },
  '普及-': {
    description: '基础算法与简单数据结构，如简单的模拟、枚举、排序、贪心、队列、栈、初等数论。对应 CSP-J 第二题，CSP-J 复赛二等需稳定做出。',
    trainingHours: '约 50~100 小时',
    algorithmExamples: ['桶排序', '选择排序', '二分查找', '前缀和', '简单递推', '栈与队列'],
    tags: ['普及-', '排序', '二分', '模拟', '前缀和'],
    timeLimitRange: [1000, 2000],
    memoryLimitRange: [128, 256]
  },
  '普及': {
    description: '基础算法的综合应用，要求具备初步建模能力，能运用枚举、二分、贪心、DP、搜索等解决综合性问题。对应 CSP-J 第三题，CSP-J 一等奖/CSP-S 二等奖需稳定通过。',
    trainingHours: '约 200~300 小时',
    algorithmExamples: ['线性 DP', '背包 DP', 'BFS/DFS', 'Dijkstra', 'Kruskal', '拓扑排序', '贪心'],
    tags: ['普及', 'DP', '搜索', '图论', '贪心'],
    timeLimitRange: [1000, 2500],
    memoryLimitRange: [128, 256]
  },
  '普及+': {
    description: '在普及难度上进一步拔高，引入区间 DP、树形 DP、最短路、生成树、并查集、树状数组、线段树等，要求提炼非直观性质的能力。对应 CSP-J 高分/满分、CSP-S 一等奖。',
    trainingHours: '约 300~500 小时',
    algorithmExamples: ['区间 DP', '状压 DP', '树形 DP', '树的直径', 'LCA', '并查集', '单调栈', '线段树'],
    tags: ['普及+', 'DP', '图论', '数据结构'],
    timeLimitRange: [1500, 3000],
    memoryLimitRange: [256, 512]
  },
  '提高': {
    description: '正式迈入较高水平算法竞赛门槛，更广泛综合地运用所学算法与数据结构，需完成一定难度的推导。对应 CSP-S 强省一等奖 / NOIP 一等奖。',
    trainingHours: '约 500~800 小时',
    algorithmExamples: ['树链剖分', '莫队', 'FFT', 'SAM', '生成函数', '网络流', '点分治', '主席树'],
    tags: ['提高', '高级 DP', '图论', '字符串'],
    timeLimitRange: [1500, 3000],
    memoryLimitRange: [256, 512]
  },
  '提高+': {
    description: '具有相当高的挑战性，引入后缀数组、AC 自动机、平衡树、线段树合并等高级数据结构，考查更困难综合的模型提炼能力。对应 NOIP 强省一等奖 / 多数省份三倍省队线。',
    trainingHours: '约 800~1000 小时',
    algorithmExamples: ['后缀自动机', 'Link-Cut Tree', '生成函数', '多项式', '数论分块', '杜教筛', '线性基'],
    tags: ['提高+', '高级数据结构', '数学', '省选'],
    timeLimitRange: [2000, 4000],
    memoryLimitRange: [256, 512]
  },
  '省选': {
    description: '相当于竞赛省队门槛，涉及 FFT、复杂网络流建模、Polya 定理、后缀自动机、LCT 等高阶算法，注重高度复合的模型提炼、转化与创造性构造。对应多数省份省队 / NOI 银牌。',
    trainingHours: '约 1500~2000 小时',
    algorithmExamples: ['李超树', '动态 DP', 'K-D Tree', '矩阵树定理', '圆方树', '字符串哈希', '随机化'],
    tags: ['省选', '高级算法', '数学', '字符串'],
    timeLimitRange: [2000, 5000],
    memoryLimitRange: [512, 1024]
  },
  'NOI': {
    description: 'NOI 金牌、IOI 金牌难度，考察极为深刻的数学理论与技巧，如线性规划与拟阵、Lyndon 树和 Runs 定理、复杂形式幂级数，要求超凡直觉、深厚数学推演能力与创新性思维。',
    trainingHours: '2000 小时以上',
    algorithmExamples: ['计算几何', '线性规划', '博弈论', '启发式搜索', '分块', '随机化算法'],
    tags: ['NOI', '竞赛', '高级算法'],
    timeLimitRange: [3000, 8000],
    memoryLimitRange: [512, 1024]
  }
}

/**
 * 通用质量门禁（适用于所有题目生成器）
 *
 * 难度档位（对齐洛谷 8 档权威定义）：
 *   入门 / 普及- / 普及 / 普及+ / 提高 / 提高+ / 省选 / NOI
 *   参考：https://help.luogu.com.cn/manual/luogu/problem/difficulty
 */
export const COMMON_QUALITY_GATES = [
  '1. JSON 必须合法闭合，不带 ```json 等 markdown 标记',
  '2. difficulty 字段必须与用户传入严格相等（不要按主观判断修改），且必须是 8 档之一：入门 / 普及- / 普及 / 普及+ / 提高 / 提高+ / 省选 / NOI',
  '3. 所有描述性文本（title / description / input / output / hint）必须使用简体中文',
  '4. samples 与 test_cases 的 input / output 必须是纯数据，不能包含中文字符',
  '5. C++ 标程必须以 #include <bits/stdc++.h> 开头，Python 标程不能有语法错误',
  '6. time_limit 单位是毫秒，memory_limit 单位是 MB，必须为正整数'
] as const

/**
 * ParamGen 模式的质量门禁（在通用门禁基础上加严）
 */
export const PROBLEM_QUALITY_GATES = [
  ...COMMON_QUALITY_GATES,
  '7. samples 不少于 2 组，每组必须有 input / output 字段',
  '8. test_cases 不少于 15 组，必须覆盖以下 10 个维度的至少 8 个：(a) 最小值 (b) 最大值/压力 (c) 边界条件 (d) 特殊/反例 (e) 随机典型 (f) 全相同 (g) 严格单调 (h) 极端比例 (i) 倒数边界 (j) 随机压力',
  '9. tags 数组必须非空，至少 1 个标签',
  '10. hint 字段必须非空，主要说明数据范围，不要直接透露算法'
] as const

/**
 * TestDataGen 模式的质量门禁（强调边界与数据真实性）
 */
export const TEST_DATA_QUALITY_GATES = [
  '1. JSON 必须合法闭合，不带 ```json 等 markdown 标记',
  '2. test_cases 数量必须严格等于用户指定的数量（不多不少）',
  '3. input / output 必须是纯数据，不能包含中文字符',
  '4. 严格遵循题目输入格式：行数、列数、字段顺序、值域都必须符合',
  '5. 必须覆盖以下 10 个维度的至少 8 个：(a) 最小值 (b) 最大值/压力 (c) 边界条件 (d) 特殊/反例/特殊字符 (e) 随机典型 (f) 全相同 (g) 严格单调递增或递减 (h) 极端比例 (i) 倒数第二/第三的边界 (j) 接近上限的随机压力'
] as const

/**
 * 10 维测试数据覆盖维度（用于 prompt 提示 + quality-check 验证）
 */
export const TEST_CASE_COVERAGE_DIMENSIONS = [
  {
    id: 'a',
    name: '最小值情形',
    examples: 'n=1、空集合、单元素、全零、字符串空输入',
    purpose: '验证最小规模是否正确处理'
  },
  {
    id: 'b',
    name: '最大值/压力测试',
    examples: 'n 达到数据范围上限（如 10^5 / 10^6 / 2*10^5）、树高链状、满图',
    purpose: '验证算法在极限数据下的时间/空间'
  },
  {
    id: 'c',
    name: '边界条件',
    examples: '恰好等于阈值、临界值、相等/相邻值、上下界 ±1',
    purpose: '验证分支判断的临界点'
  },
  {
    id: 'd',
    name: '特殊/反例',
    examples: '重复元素、负数、浮点精度（如 0.1+0.2）、字符串含空格/换行/反斜杠、unicode',
    purpose: '验证非常规输入的健壮性'
  },
  {
    id: 'e',
    name: '随机典型',
    examples: '中等规模（如 n=100~1000）随机数据，符合均匀分布',
    purpose: '验证一般情况的功能正确性'
  },
  {
    id: 'f',
    name: '全相同',
    examples: '所有元素相等（全 0、全 1、全 max）、所有字符相同',
    purpose: '验证算法对均匀数据的退化情况'
  },
  {
    id: 'g',
    name: '严格单调',
    examples: '严格递增序列、严格递减序列、循环单峰/双峰',
    purpose: '验证有序/特殊模式输入'
  },
  {
    id: 'h',
    name: '极端比例',
    examples: '1 个极大 + 9999 个极小、长链 + 多分叉、稀疏图 vs 稠密图',
    purpose: '验证算法对偏斜分布的鲁棒性'
  },
  {
    id: 'i',
    name: '倒数边界',
    examples: 'n=上限-1、第 2 大、第 2 小、最后一个元素触发某种条件',
    purpose: '验证"边界-1"位置的处理'
  },
  {
    id: 'j',
    name: '随机压力',
    examples: '接近上限的随机数据（如 n=10^5-100）、稠密随机图',
    purpose: '在极限附近验证算法的稳定性（比纯最大数据更能暴露 bug）'
  }
] as const

/**
 * 渲染测试数据覆盖维度（用于 prompt 中嵌入）
 */
export function renderTestCaseDimensions(): string {
  return TEST_CASE_COVERAGE_DIMENSIONS.map(d =>
    `${d.id}. ${d.name} — ${d.examples}（目的：${d.purpose}）`
  ).join('\n')
}

/**
 * 思考步骤（thinking prompt）通用 4 步框架
 */
export const THINKING_STEP_FRAME = `【思考步骤】（请按顺序逐项完成）
步骤1 审题：明确题目要求识别的问题类型、输入输出约束
步骤2 抽象建模：把题目抽象为数学模型 / 状态机 / 图论问题
步骤3 边界与数据范围：列出所有边界条件、特殊值、最大/最小情形
步骤4 时空与算法选型：根据数据范围选择算法、给出时空复杂度上限`
