
import { GenerationMode, ParamGenContext, PromptGenerator, PromptResult } from '../core/types';
import { fillTemplate, PROBLEM_JSON_TEMPLATE } from './json-template';
import { DIFFICULTY_PROFILES, Difficulty } from '../core/quality-gates';

export class ParamGenPromptGenerator implements PromptGenerator {
  generate(context: ParamGenContext): PromptResult {
    if (context.mode !== GenerationMode.PARAM_GEN) {
      throw new Error('Invalid context mode for ParamGenPromptGenerator');
    }

    const { type, difficulty, topic, additionalInfo } = context;
    // 业务决策（2026-06）：单次 AI 调用固定生成 1 道题，count 变量已废弃
    // ParamGen 创作题：保留一定随机性以激发灵感
    // 注：原 0.8 过高，JSON 严格输出场景下 0.5 配合 retry 降温度更稳定
    const temperature = 0.5;

    // 根据难度档位取该档位 time/memory 范围的中位值（不再硬编码 1000/256）
    const profile = DIFFICULTY_PROFILES[difficulty as Difficulty]
    const timeMin = profile?.timeLimitRange?.[0] ?? 1000
    const timeMax = profile?.timeLimitRange?.[1] ?? 1500
    const memMin = profile?.memoryLimitRange?.[0] ?? 128
    const memMax = profile?.memoryLimitRange?.[1] ?? 256
    const timeLimit = Math.round((timeMin + timeMax) / 2)
    const memoryLimit = Math.round((memMin + memMax) / 2)

    const systemPrompt = `你是一位资深的算法竞赛 JSON 填空机器人。

# 角色与原则
- 严格按用户给出的 JSON 模板输出
- 把所有 <...> 占位符替换成题目内容，其他字符（字段名、嵌套层级、引号、逗号、换行）原样保留
- 字段名拼写、大小写、嵌套层级必须 1:1 一致
- 禁止添加 / 删除模板中的字段，禁止在 JSON 之外添加任何解释、markdown 标记（\`\`\`json 等）、think 块

# 全局约束（不可违反）
1. **业务决策（2026-06）**：单次 AI 调用只生成 1 道题；顶层必须是长度为 1 的 JSON 数组 [ { ... } ]，严禁输出多个对象的数组或顶层对象
2. **字段名 snake_case**：与模板完全一致，包括 test_cases / time_limit / memory_limit / solution_cpp / solution_python / solution_article（不要写成 camelCase）
3. **JSON 转义**：中文标点、字符串、代码中可能含双引号 / 反引号 / 换行，**必须用 \\" 和 \\n 转义**，否则 JSON 非法
4. **内容完整性**：字段内容必须完整闭合，禁止中途截断；test_cases 必须包含 **15 个对象**（不是 3 个），覆盖 10 个维度（最小值 / 最大值 / 边界 / 反例 / 随机 / 全相同 / 单调 / 极端比例 / 倒数边界 / 随机压力）；标程代码可在标准编译器下编译运行

# 字段填充指引
- 算法主题（来自用户 topic 数组）：决定题目考察的算法 / 数据结构 / 编程语法，是出题核心
  - "基础语法"类（变量 / if / 循环 / 数组基础 / 函数 / 递归入门 等）：用于入门档，**不需要**涉及高级算法；只需用 C++/Python 基础语法就能解决
  - 其余主题（动态规划 / 图论 / 数据结构 / 数学 等）：按对应算法类别出题
- 附加要求（来自用户 additionalInfo）：仅作为题目背景故事 / 元素融入 description / samples 的叙事层，**不得**改变算法核心、数据范围、输入输出格式
- title：4-10 字中文题目名
- description：Markdown 格式，简体中文，含背景 / 要求 / 约束；如用户给了附加要求，将背景故事 / 元素自然地写入 description 的背景段
- samples：至少 2 组，explanation 用中文
- test_cases：至少 15 组，每组 { "input": "...", "output": "..." }
- tags：**2-4 个**中文标签字符串数组；标签必须能精确定位本题用到的算法 / 数据结构 / 思路，参考用户选择的主题（如"动态规划 + 背包"应出 ["动态规划", "背包", "时间优化"] 这种具体标签，而非 ["动态规划", "算法"] 这种通用词）；**禁止**用难度词（"入门" / "普及" / "提高" / "NOI" 等）做标签
- hint：1-2 句数据范围提示
- time_limit / memory_limit：本次出题对应档位「${difficulty}」的推荐值为 time_limit=${timeLimit}ms / memory_limit=${memoryLimit}MB（模板中已预填，请勿随意修改以避免与档位不匹配）
- solution_cpp：C++17 标程（字符串里可能含 \\n 换行；含双引号必须转义为 \\"）
- solution_python：Python3 标程
- solution_article：5 段式 markdown 题解，使用 H2 ## 分隔（不要用 H1 或 H3）：
  1. ## 思路分析 — 为什么选这个算法（结合数据范围 / 题目约束）
  2. ## 算法描述 — 分步骤描述执行过程
  3. ## 复杂度分析 — 时间复杂度 + 空间复杂度（附推导）
  4. ## 参考代码 — 用 \`\`\`cpp 包裹完整 C++17 代码，**内容必须与 solution_cpp 字段完全一致**（不要再写第二份标程；直接复制 solution_cpp 的内容）
  5. ## 关键点说明 — 易错点 / 边界情况 / 常数优化
  - 总字数 800-2500 字（视难度而定），字符串内可能含双引号 / 反引号 / 换行，**必须用 \\" 和 \\n 转义**`;

    const userPrompt = `请根据算法主题「${topic.join('、')}」、难度「${difficulty}」、类型「${type}」，生成 1 道题。

${additionalInfo ? `背景故事 / 元素（请自然地融入题目描述，但不要改变算法核心与数据范围）：${additionalInfo}\n` : ''}

模板仅供参考结构，**请直接输出 JSON，不要写"下面是 JSON"等任何前言**。

# JSON 模板

${fillTemplate(difficulty, timeLimit, memoryLimit)}`;

    return {
      systemPrompt,
      userPrompt,
      temperature
    };
  }

  generateThinkingPrompt(context: ParamGenContext): string {
    const { type, difficulty, topic, additionalInfo } = context;
    return `你是一位资深算法竞赛命题人，正在为难度"${difficulty}"的${type}题做设计规划。

算法主题：${topic.join('、')}
${additionalInfo ? `背景故事 / 元素（请自然地融入题目描述，但不要改变算法核心与数据范围）：${additionalInfo}\n` : ''}

请按以下 4 步完成设计分析（暂时不要生成完整 JSON）：

【思考步骤】（请按顺序逐项完成）
步骤1 审题：明确题目要求识别的问题类型、输入输出约束
步骤2 抽象建模：把题目抽象为数学模型 / 状态机 / 图论问题
步骤3 边界与数据范围：列出所有边界条件、特殊值、最大/最小情形
步骤4 时空与算法选型：根据数据范围选择算法、给出时空复杂度上限

输出要求：
- 业务决策（2026-06）：单次调用只生成 1 道题，无需规划多道
- 仅输出设计思路与分析文本（中文）
- 不要生成 JSON、不要出现\`\`\`标记
- 最后给出"建议时间/内存限制"与"建议测试数据覆盖维度"两个小节`;
  }
}
