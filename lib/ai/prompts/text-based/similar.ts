
import { GenerationMode, SimilarContext, PromptGenerator, PromptResult } from '../core/types';

export class SimilarPromptGenerator implements PromptGenerator {
  generate(context: SimilarContext): PromptResult {
    if (context.mode !== GenerationMode.SIMILAR) {
      throw new Error('Invalid context mode for SimilarPromptGenerator');
    }

    const { textInput } = context;
    const temperature = 0.7;
    
    const systemPrompt = `你是一个专业的算法竞赛题目设计专家。
你的任务是根据用户提供的题目，生成一道类型和难度相似但故事背景不同的新题目。
你必须严格按照指定的JSON格式返回结果。`;

    const userPrompt = `请分析以下题目，并生成一道类型和难度相似但故事背景完全不同的新题目。

【原题目】
${textInput}

【要求】
1. 识别原题目的核心算法
2. 创建一道使用相似算法的新题目
3. 生成有效的测试数据
4. 难度等级必须是以下之一：
   "入门", "普及-", "普及", "普及+", "提高", "提高+", "省选", "NOI"

【语言要求】
- 所有描述性文本必须使用简体中文
- 样例和测试数据的input/output中不能包含中文字符

【JSON格式】
返回一个JSON对象：
{
  "problems": [
    {
      "title": "题目名称（中文）",
      "description": "题目描述（中文，Markdown格式）",
      "input": "输入格式描述（中文）",
      "output": "输出格式描述（中文）",
      "samples": [
        {
          "input": "样例输入（纯数据）",
          "output": "样例输出（纯数据）",
          "explanation": "样例解释（中文，可选）"
        }
      ],
      "test_cases": [
        {
          "input": "测试输入",
          "output": "测试输出"
        }
      ],
      "difficulty": "难度等级",
      "tags": ["标签1", "标签2"],
      "hint": "数据范围提示",
      "time_limit": 1000,
      "memory_limit": 256,
      "solution_cpp": "C++标程代码",
      "solution_python": "Python标程代码"
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

  generateThinkingPrompt(context: SimilarContext): string {
    const { textInput } = context;
    return `分析以下题目并设计一道相似的新题目：

${textInput}

要求：
1. 识别核心算法和难度
2. 设计新题目的故事背景
3. 规划测试数据
4. 确定合适的时空限制

暂时只输出设计思路，不要生成JSON。`;
  }
}
