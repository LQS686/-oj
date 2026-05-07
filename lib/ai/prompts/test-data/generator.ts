
import { GenerationMode, TestDataGenContext, PromptGenerator, PromptResult } from '../core/types';

export class TestDataGenPromptGenerator implements PromptGenerator {
  generate(context: TestDataGenContext): PromptResult {
    if (context.mode !== GenerationMode.TEST_DATA_GEN) {
      throw new Error('Invalid context mode for TestDataGenPromptGenerator');
    }

    const { title, description, inputDescription, outputDescription, count, hasSolution } = context;
    const temperature = 0.5;
    
    const systemPrompt = `你是一个专业的算法测试数据生成器。
你的任务是为给定的编程题目生成高质量的测试数据。
你必须严格按照指定的JSON格式返回结果。`;

    let outputRequirement = `4. 确保所有输出根据题目描述和输出格式是正确的`;
    let exampleJson = `{
  "test_cases": [
    { "input": "1 2", "output": "3" },
    { "input": "10 20", "output": "30" }
  ]
}`;

    if (hasSolution) {
      outputRequirement = `4. 你只需要生成"input"字段，"output"字段可以是空字符串""，因为会由标程计算输出。专注于生成多样化和有技巧性的输入。`;
      exampleJson = `{
  "test_cases": [
    { "input": "1 2", "output": "" },
    { "input": "10 20", "output": "" }
  ]
}`;
    }

    const userPrompt = `请为以下题目生成 ${count} 组测试数据。

【题目信息】
标题：${title}
描述：
${description}

【输入格式】
${inputDescription}

【输出格式】
${outputDescription}

【要求】
1. 生成 ${count} 组测试数据
2. 覆盖边界情况（最小值、最大值、边界条件）
3. 确保所有输入严格遵循输入格式
${outputRequirement}
5. 输入/输出数据不能包含中文字符
6. 不要在input或output字符串中换行，除非题目明确需要多行输出

【JSON格式】
返回一个JSON对象：
${exampleJson}

直接返回JSON对象，不要添加markdown标记。`;

    return {
      systemPrompt,
      userPrompt,
      temperature
    };
  }

  generateThinkingPrompt(context: TestDataGenContext): string {
    const { title, description, inputDescription, outputDescription, count } = context;
    return `为题目"${title}"设计 ${count} 组测试数据。

题目描述：
${description}

输入格式：
${inputDescription}

输出格式：
${outputDescription}

要求：
1. 分析输入约束和边界情况
2. 规划 ${count} 组测试数据，覆盖：
   - 简单/小数据
   - 边界情况（最小/最大约束）
   - 随机典型数据
   - 特殊/技巧性数据
3. 验证逻辑确保输出正确

暂时只输出设计思路，不要生成JSON。`;
  }
}
