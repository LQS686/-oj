
import { GenerationMode, ParamGenContext, PromptGenerator, PromptResult } from '../core/types';
import { fillTemplate, PROBLEM_JSON_TEMPLATE } from './json-template';

export class ParamGenPromptGenerator implements PromptGenerator {
  generate(context: ParamGenContext): PromptResult {
    if (context.mode !== GenerationMode.PARAM_GEN) {
      throw new Error('Invalid context mode for ParamGenPromptGenerator');
    }

    const { type, difficulty, topic, count, additionalInfo } = context;
    // ParamGen 创作题：保留一定随机性以激发灵感
    const temperature = 0.8;

    // 难度档位建议
    const timeLimit = 1000;
    const memoryLimit = 256;

    const systemPrompt = `你是一位资深的算法竞赛 JSON 填空机器人。

# 你的任务
- 严格按用户给出的 JSON 模板输出
- 把所有 <...> 占位符替换成题目内容
- 其他字符（字段名、嵌套层级、引号、逗号、换行）原样保留
- 字段名拼写、大小写、嵌套层级必须 1:1 一致
- 禁止添加模板之外的字段
- 禁止删除模板中的字段
- 禁止在 JSON 之外添加任何解释、markdown 标记（\`\`\`json 等）、think 块

# ⚠️ 字段名固定规则
所有字段名必须用 **snake_case**（下划线命名），与模板完全一致：
- test_cases（不是 testCases）
- time_limit（不是 timeLimit）
- memory_limit（不是 memoryLimit）
- solution_cpp（不是 solutionCpp）
- solution_python（不是 solutionPython）

# ⚠️ 多道题时的关键约束
- 无论生成几道题，**顶层必须是 JSON 数组**：[ {problem1}, {problem2}, ... ]
- 严禁把多道题塞进同一个对象（会导致重复 key，JSON.parse 只保留最后一个值）
- count=1 时输出长度为 1 的数组：[ {...} ]
- count=2 时输出长度为 2 的数组：[ {...}, {...} ]
- count=3 时输出长度为 3 的数组：[ {...}, {...}, {...} ]

# ⚠️ 响应长度
- 字段内容必须完整闭合，禁止中途截断
- test_cases 必须包含 15 个对象（不是 3 个），覆盖 10 个维度（最小值/最大值/边界/反例/随机/全相同/单调/极端比例/倒数边界/随机压力）
- 标程代码（solution_cpp / solution_python）必须可在标准编译器下编译运行
- 测试点（test_cases）必须真实可解，与标程输出完全一致
- 中文标点、字符串、代码中可能含双引号，**必须用 \\" 转义**，否则 JSON 非法

# 字段填充指引
- title: 4-10 字中文题目名
- description: Markdown 格式，简体中文，含背景/要求/约束
- samples: 至少 2 组，explanation 用中文
- test_cases: 至少 15 组，每组 { "input": "...", "output": "..." }
- tags: 至少 2 个中文标签
- hint: 1-2 句数据范围提示
- time_limit / memory_limit: 根据难度档位选择合适的整数值（直接写数字，不要带引号）
- solution_cpp: C++17 标程（字符串里可能含 \\n 换行；含双引号必须转义为 \\"）
- solution_python: Python3 标程
`;

    const userPrompt = `请根据主题「${topic.join('、')}」、难度「${difficulty}」、类型「${type}」，生成 ${count} 道题。

${additionalInfo ? `附加要求：${additionalInfo}\n` : ''}

# 输出格式（严格遵守）

- 顶层必须是一个 **JSON 数组**，长度为 ${count}
- 每个元素是 1 道题的对象
- 字段名必须用 snake_case：test_cases / time_limit / memory_limit / solution_cpp / solution_python
- 所有 <...> 占位符都必须替换为真实内容
- 模板仅供参考结构，**请直接输出 JSON，不要写"下面是 JSON"等任何前言**

# JSON 模板

${fillTemplate(difficulty, timeLimit, memoryLimit)}`;

    return {
      systemPrompt,
      userPrompt,
      temperature
    };
  }

  generateThinkingPrompt(context: ParamGenContext): string {
    const { type, difficulty, topic, count, additionalInfo } = context;
    return `你是一位资深算法竞赛命题人，正在为难度"${difficulty}"的${type}题做设计规划。

主题：${topic.join('、')}
${additionalInfo ? `附加要求：${additionalInfo}\n` : ''}

请按以下 4 步完成设计分析（暂时不要生成完整 JSON）：

【思考步骤】（请按顺序逐项完成）
步骤1 审题：明确题目要求识别的问题类型、输入输出约束
步骤2 抽象建模：把题目抽象为数学模型 / 状态机 / 图论问题
步骤3 边界与数据范围：列出所有边界条件、特殊值、最大/最小情形
步骤4 时空与算法选型：根据数据范围选择算法、给出时空复杂度上限

输出要求：
- 仅输出设计思路与分析文本（中文）
- 不要生成 JSON、不要出现\`\`\`标记
- 最后给出"建议时间/内存限制"与"建议测试数据覆盖维度"两个小节`;
  }
}
