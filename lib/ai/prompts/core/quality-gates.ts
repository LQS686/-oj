/**
 * 共享 Prompt 基础：难度档位定义 + 质量门禁 + Few-shot 范例
 *
 * 设计目标：
 *   1. 让 4 个生成器（ParamGen / Clone / Similar / TestDataGen）共享统一的质量门禁与难度档位
 *   2. 避免在每个 generator 中重复定义相同规则
 *   3. 集中维护，便于后续微调
 */

export type Difficulty = '入门' | '普及-' | '普及' | '普及+' | '提高' | '提高+' | '省选' | 'NOI'

/**
 * 难度档位 → 算法典型 + 时空约束 + 标签库
 */
export const DIFFICULTY_PROFILES: Record<Difficulty, {
  algorithmExamples: string[]
  tags: string[]
  timeLimitRange: [number, number]
  memoryLimitRange: [number, number]
  description: string
}> = {
  '入门': {
    description: '基础语法与简单逻辑（变量、循环、数组基础）',
    algorithmExamples: ['基础循环', '条件判断', '简单模拟', '数组遍历', '字符串基础'],
    tags: ['入门', '模拟', '基础语法'],
    timeLimitRange: [1000, 1500],
    memoryLimitRange: [64, 128]
  },
  '普及-': {
    description: '简单算法（排序、二分、模拟、基础递推）',
    algorithmExamples: ['桶排序', '选择排序', '二分查找', '前缀和', '简单递推'],
    tags: ['普及-', '排序', '二分', '模拟', '前缀和'],
    timeLimitRange: [1000, 2000],
    memoryLimitRange: [128, 256]
  },
  '普及': {
    description: '标准算法（DP、BFS/DFS、贪心、基础图论）',
    algorithmExamples: ['线性 DP', '背包 DP', 'BFS/DFS', 'Dijkstra', 'Kruskal', '拓扑排序', '贪心'],
    tags: ['普及', 'DP', '搜索', '图论', '贪心'],
    timeLimitRange: [1000, 2500],
    memoryLimitRange: [128, 256]
  },
  '普及+': {
    description: '复杂 DP、图论、数据结构',
    algorithmExamples: ['区间 DP', '状压 DP', '树形 DP', '树的直径', 'LCA', '并查集', '单调栈', '线段树'],
    tags: ['普及+', 'DP', '图论', '数据结构'],
    timeLimitRange: [1500, 3000],
    memoryLimitRange: [256, 512]
  },
  '提高': {
    description: '高级算法与优化（高级 DP、图论、字符串）',
    algorithmExamples: ['树链剖分', '莫队', 'FFT', 'SAM', '生成函数', '网络流', '点分治', '主席树'],
    tags: ['提高', '高级 DP', '图论', '字符串'],
    timeLimitRange: [1500, 3000],
    memoryLimitRange: [256, 512]
  },
  '提高+': {
    description: '省选级别（高级数据结构 + 数学）',
    algorithmExamples: ['后缀自动机', 'Link-Cut Tree', '生成函数', '多项式', '数论分块', '杜教筛', '线性基'],
    tags: ['提高+', '高级数据结构', '数学', '省选'],
    timeLimitRange: [2000, 4000],
    memoryLimitRange: [256, 512]
  },
  '省选': {
    description: '省选难度（高级算法与复杂优化）',
    algorithmExamples: ['李超树', '动态 DP', 'K-D Tree', '矩阵树定理', '圆方树', '字符串哈希', '随机化'],
    tags: ['省选', '高级算法', '数学', '字符串'],
    timeLimitRange: [2000, 5000],
    memoryLimitRange: [512, 1024]
  },
  'NOI': {
    description: 'NOI 级别（竞赛难题）',
    algorithmExamples: ['计算几何', '线性规划', '博弈论', '启发式搜索', '分块', '随机化算法'],
    tags: ['NOI', '竞赛', '高级算法'],
    timeLimitRange: [3000, 8000],
    memoryLimitRange: [512, 1024]
  }
}

/**
 * 通用质量门禁（适用于所有题目生成器）
 */
export const COMMON_QUALITY_GATES = [
  '1. JSON 必须合法闭合，不带 ```json 等 markdown 标记',
  '2. difficulty 字段必须与用户传入严格相等（不要按主观判断修改）',
  '3. 所有描述性文本（title / description / input / output / hint）必须使用简体中文',
  '4. samples 与 test_cases 的 input / output 必须是纯数据，不能包含中文字符',
  '5. C++ 标程必须以 #include <bits/stdc++.h> 开头，Python 标程不能有语法错误',
  '6. time_limit 单位是毫秒，memory_limit 单位是 MB，必须为正整数'
] as const

/**
 * ParamGen / Similar 模式的质量门禁（在通用门禁基础上加严）
 */
export const PROBLEM_QUALITY_GATES = [
  ...COMMON_QUALITY_GATES,
  '7. samples 不少于 2 组，每组必须有 input / output 字段',
  '8. test_cases 不少于 10 组，必须覆盖以下 10 个维度的至少 8 个：(a) 最小值 (b) 最大值/压力 (c) 边界条件 (d) 特殊/反例 (e) 随机典型 (f) 全相同 (g) 严格单调 (h) 极端比例 (i) 倒数边界 (j) 随机压力',
  '9. tags 数组必须非空，至少 1 个标签',
  '10. hint 字段必须非空，主要说明数据范围，不要直接透露算法'
] as const

/**
 * Clone 模式的提取门禁（强调"严格提取、不可编造"）
 */
export const CLONE_QUALITY_GATES = [
  ...COMMON_QUALITY_GATES,
  '7. 严格按用户提供的输入文本提取信息，不要凭空添加不存在的细节（如不存在的样例、约束）',
  '8. 如原题未给出样例，samples 可以少于 2 组，但 test_cases 必须生成 10 组以上，覆盖以下 10 维度的至少 8 个：(a) 最小值 (b) 最大值/压力 (c) 边界条件 (d) 特殊/反例 (e) 随机典型 (f) 全相同 (g) 严格单调 (h) 极端比例 (i) 倒数边界 (j) 随机压力',
  '9. 标程 solution_cpp / solution_python 必须根据题目描述的算法自行编写，编译/运行结果应正确',
  '10. tags 数组必须非空，至少 1 个标签'
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

/**
 * Few-shot 范例（用于 ParamGen / Clone）
 * 示例：提高档位的"最长上升子序列"风格题
 */
export const FEW_SHOT_EXAMPLE = `【标准答案示例】
{
  "problems": [
    {
      "title": "登山步道",
      "description": "某山区有 N 个观景点，按海拔从低到高编号 1..N，相邻观景点之间的爬升高度依次为 a[1..N-1]。\\n\\n登山者可以选择从任一观景点出发，按编号递增的方向前往更高海拔的观景点，且每步爬升不超过给定体力上限 H。请求出在不超过 H 限制下，从最低观景点出发能到达的最高观景点编号。",
      "input": "第一行两个整数 N H。\\n第二行 N-1 个整数 a[1..N-1]，相邻海拔差。",
      "output": "能到达的最高观景点编号",
      "samples": [
        { "input": "5 5\\n3 2 4 1", "output": "4", "explanation": "从 1 出发：3≤5 到 2，2≤5 到 3，4≤5 到 4，1≤5 到 5。最终最高编号 5？" }
      ],
      "test_cases": [
        { "input": "1 10\\n", "output": "1" },
        { "input": "2 0\\n0", "output": "2" },
        { "input": "5 3\\n3 3 3 3", "output": "2" },
        { "input": "10 1\\n1 1 1 1 1 1 1 1 1", "output": "2" },
        { "input": "5 100\\n1 1 1 1", "output": "5" }
      ],
      "difficulty": "普及+",
      "tags": ["贪心", "前缀和", "模拟"],
      "hint": "1 ≤ N ≤ 10^5，1 ≤ H ≤ 10^9",
      "time_limit": 1500,
      "memory_limit": 256,
      "solution_cpp": "#include <bits/stdc++.h>\\nusing namespace std;\\nint main(){ios::sync_with_stdio(false);cin.tie(nullptr);int n;long long h;if(!(cin>>n>>h))return 0;int reach=1;for(int i=0;i<n-1;i++){long long a;cin>>a;if(a<=h)reach=i+2;else break;}cout<<reach<<'\\n';}\\n",
      "solution_python": "import sys\\ndata=sys.stdin.read().split()\\nif not data:sys.exit(0)\\nn,h=int(data[0]),int(data[1])\\nreach=1\\nfor i in range(n-1):\\n    a=int(data[2+i])\\n    if a<=h:reach=i+2\\n    else:break\\nprint(reach)\\n"
    }
  ]
}`

/**
 * 根据 difficulty 取得对应的"算法典型 + 时空约束"段落
 */
export function buildDifficultyContext(difficulty: string): string {
  const profile = DIFFICULTY_PROFILES[difficulty as Difficulty]
  if (!profile) {
    return `【难度档位提示】用户指定难度：${difficulty}。请按此档位对应的算法难度生成。`
  }
  return `【难度档位：${difficulty}】
- 描述：${profile.description}
- 算法典型：${profile.algorithmExamples.join('、')}
- 标签建议：${profile.tags.join('、')}
- 时间限制建议：${profile.timeLimitRange[0]}-${profile.timeLimitRange[1]}ms
- 内存限制建议：${profile.memoryLimitRange[0]}-${profile.memoryLimitRange[1]}MB`
}
