
import { GenerationMode, ParamGenContext, PromptGenerator, PromptResult } from '../core/types';

export class ParamGenPromptGenerator implements PromptGenerator {
  generate(context: ParamGenContext): PromptResult {
    if (context.mode !== GenerationMode.PARAM_GEN) {
      throw new Error('Invalid context mode for ParamGenPromptGenerator');
    }

    const { type, difficulty, topic, count, additionalInfo } = context;
    const temperature = 0.7;
    
    const systemPrompt = `你是一个专业的算法竞赛题目设计专家。你的任务是根据用户需求生成高质量的编程竞赛题目。
你必须严格按照指定的JSON格式返回结果，不要添加任何markdown格式标记。

返回格式要求：
- 返回一个JSON对象，包含一个"problems"数组
- 每个problem对象必须严格遵循以下结构`;

    const userPrompt = `请生成 ${count} 道难度为"${difficulty}"的${type}题目，主题涉及：${topic.join('、')}。
${additionalInfo ? `附加要求：${additionalInfo}` : ''}

【难度等级定义】
- "入门": 入门级别，基础语法和简单逻辑
- "普及-": 普及偏易，简单算法如排序、模拟
- "普及": 普及难度，标准算法如DP、BFS/DFS、贪心
- "普及+": 普及偏难，复杂DP、图论、数据结构
- "提高": 提高难度，高级算法和优化
- "提高+": 提高偏难，省选级别
- "省选": 省选难度，高级算法和复杂优化
- "NOI": NOI级别，竞赛难题

请确保生成的题目严格符合"${difficulty}"难度等级。

【语言要求】
- 所有描述性文本（title, description, input, output, hint）必须使用简体中文
- 样例和测试数据的input/output中不能包含中文字符
- JSON的键名必须使用英文

【JSON格式规范】
返回一个JSON对象，格式如下：

{
  "problems": [
    {
      "title": "题目名称（中文）",
      "description": "题目描述（中文，可使用Markdown格式）",
      "input": "输入格式描述（中文）",
      "output": "输出格式描述（中文）",
      "samples": [
        {
          "input": "样例输入（纯数据，无中文）",
          "output": "样例输出（纯数据，无中文）",
          "explanation": "样例解释（中文，可选）"
        }
      ],
      "test_cases": [
        {
          "input": "测试输入（纯数据）",
          "output": "测试输出（纯数据）"
        }
      ],
      "difficulty": "${difficulty}",
      "tags": ["标签1", "标签2"],
      "hint": "提示（主要说明数据范围，不要直接透露算法）",
      "time_limit": 1000,
      "memory_limit": 256,
      "solution_cpp": "C++标程代码",
      "solution_python": "Python标程代码"
    }
  ]
}

【字段说明】
1. title: 简洁有创意的题目名称
2. description: 详细的题目描述，包括背景故事、问题要求等
3. input: 输入格式说明，包括各参数含义和取值范围
4. output: 输出格式说明
5. samples: 至少2组样例，包含input、output和可选的explanation
6. test_cases: 至少5组测试数据，覆盖边界情况
7. difficulty: 必须是"${difficulty}"
8. tags: 相关标签数组，如["动态规划", "DP", "贪心"]
9. hint: 主要是数据范围提示，如"1 <= N <= 10^5"
10. time_limit: 时间限制（毫秒），根据算法复杂度设置
11. memory_limit: 内存限制（MB）
12. solution_cpp: C++标准解法代码
13. solution_python: Python标准解法代码

【注意事项】
- 样例和测试数据的input/output必须是纯数据，不能有中文
- 测试数据要覆盖各种边界情况
- 时间限制要合理，通常1000-3000ms
- 内存限制通常128-512MB

请直接返回JSON对象，不要添加\`\`\`json等markdown标记。`;

    return {
      systemPrompt,
      userPrompt,
      temperature
    };
  }

  generateThinkingPrompt(context: ParamGenContext): string {
    const { type, difficulty, topic, count, additionalInfo } = context;
    return `你是一个专业的算法竞赛题目设计专家。
任务：设计 ${count} 道${difficulty}难度的${type}题目。
主题：${topic.join('、')}
附加要求：${additionalInfo || '无'}

请分析需求，设计算法逻辑、边界情况和难度曲线。
为每道题目提供详细的设计大纲，包括核心思路和解法分析。
同时考虑合适的时空限制。
验证设计的题目严格符合"${difficulty}"难度等级。
暂时不要生成完整JSON，只需要输出设计思路。`;
  }
}
