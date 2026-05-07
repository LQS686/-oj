
import { GenerationMode, CloneContext, PromptGenerator, PromptResult } from '../core/types';

export class ClonePromptGenerator implements PromptGenerator {
  generate(context: CloneContext): PromptResult {
    if (context.mode !== GenerationMode.CLONE) {
      throw new Error('Invalid context mode for ClonePromptGenerator');
    }

    const { textInput, optimizeDescription } = context;
    const temperature = 0.1; 
    
    const systemPrompt = `你是一个严格的数据提取引擎。
你的唯一任务是将用户提供的算法题目文本转换为标准JSON格式。
不要编造内容。不要添加对话文本。只返回JSON对象。`;

    const userPrompt = `分析以下文本并提取算法题目详情。

【输入文本】
${textInput}

【提取规则】
1. "title": 从第一行或标题中提取。移除"B3837"、"[GESP...]"、"#"等前缀。如果找不到标题，生成简短的中文摘要。

2. "description": ${optimizeDescription ? '重写题目描述使其清晰专业（Markdown格式）。' : '提取主要问题描述，移除"输入"、"输出"、"样例"等部分。'}

3. "input": 提取输入格式描述（中文文本）。不要复制样例数据！

4. "output": 提取输出格式描述（中文文本）。不要复制样例数据！

5. "samples": 提取或生成样例，格式：[{"input": "...", "output": "...", "explanation": "..."}]
   - input/output中不能有中文字符
   - 至少2组样例

6. "test_cases": 生成5组隐藏测试数据，覆盖边界情况。

7. "difficulty": 估算难度，必须是以下之一：
   "入门", "普及-", "普及", "普及+", "提高", "提高+", "省选", "NOI"

8. "tags": 相关标签数组，如["模拟", "数组", "DP"]

9. "hint": 数据范围提示，如"1 <= n <= 100"

10. "time_limit": 时间限制（毫秒），默认1000

11. "memory_limit": 内存限制（MB），默认128

12. "solution_cpp": C++标准解法代码

13. "solution_python": Python标准解法代码

【JSON格式】
返回一个JSON对象：
{
  "problems": [
    {
      "title": "题目名称",
      "description": "题目描述",
      "input": "输入格式描述",
      "output": "输出格式描述",
      "samples": [...],
      "test_cases": [...],
      "difficulty": "难度",
      "tags": [...],
      "hint": "提示",
      "time_limit": 1000,
      "memory_limit": 128,
      "solution_cpp": "...",
      "solution_python": "..."
    }
  ]
}

直接返回JSON对象，不要添加markdown标记。`;

    return {
      systemPrompt,
      userPrompt,
      temperature
    };
  }

  generateThinkingPrompt(context: CloneContext): string {
    const { textInput } = context;
    return `分析这道题目：
${textInput}

1. 核心逻辑是什么？
2. 数据约束是什么？
3. 设计5组测试数据。
暂时只输出分析思路，不要生成JSON。`;
  }
}
