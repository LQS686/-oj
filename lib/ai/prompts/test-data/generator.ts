
import { GenerationMode, TestDataGenContext, PromptGenerator, PromptResult } from '../core/types';
import { TEST_DATA_QUALITY_GATES, THINKING_STEP_FRAME, renderTestCaseDimensions } from '../core/quality-gates';

export class TestDataGenPromptGenerator implements PromptGenerator {
  generate(context: TestDataGenContext): PromptResult {
    if (context.mode !== GenerationMode.TEST_DATA_GEN) {
      throw new Error('Invalid context mode for TestDataGenPromptGenerator');
    }

    const { title, description, inputDescription, outputDescription, count, hasSolution } = context;
    // TestDataGen：结构化数据生成，需要一定随机性以覆盖多样场景
    const temperature = 0.3;
    // 用户传入 count 过低时自动上调到 15（保证覆盖度）
    const finalCount = Math.max(count, 15);

    const systemPrompt = `你是一位资深的算法测试数据生成器，专为编程竞赛题目生成高质量的 input / output 对。

核心原则：
1. 数据真实性 — 每一组 test_cases 的 input 都必须满足题目输入格式，output 都必须是 input 经过题目算法计算的真实结果
2. 边界覆盖 — 必须覆盖最小值、最大值、边界条件、特殊值、随机典型、全相同、严格单调、极端比例、倒数边界、随机压力 10 类
3. 纯数据 — input / output 字符串中不能包含中文字符或注释
4. 难度匹配 — 至少 1 组数据应接近数据范围上限（用于压力测试）
5. 数量充分 — 默认 15 组起步（用户可指定更多），覆盖度优先于紧凑度`;

    let outputRequirement: string
    let exampleJson: string

    if (hasSolution) {
      // 有标程：output 字段可以空字符串（前端会用标程计算），但建议仍给出供校验
      outputRequirement = `4. 你需要生成 input 和 output 两个字段：
   - input 必须严格遵循输入格式
   - output 必须是 input 通过题目算法计算后的真实结果（用于前端交叉校验）
   - 即使前端会用标程重算，你提供的 output 也应与之完全一致
5. 至少 1 组数据应接近数据范围上限（用于压力测试）`
      exampleJson = `{
  "test_cases": [
    { "input": "5\\n1 2 3 4 5", "output": "15" },
    { "input": "3\\n10 20 30", "output": "60" }
  ]
}`
    } else {
      // 无标程：output 必须是真实计算结果
      outputRequirement = `4. output 必须是 input 通过题目算法计算后的**真实结果**（这是关键 — 绝对不能输出空字符串、占位符、待定符号）
5. 在生成 output 前，务必在心中完整执行一遍算法，确保结果正确
6. 至少 1 组数据应接近数据范围上限（用于压力测试）`
      exampleJson = `{
  "test_cases": [
    { "input": "5\\n1 2 3 4 5", "output": "15" },
    { "input": "3\\n10 20 30", "output": "60" }
  ]
}`
    }

    const userPrompt = `请为以下题目生成 ${finalCount} 组测试数据${count < 15 ? `（用户请求 ${count} 组，但已自动上调到 15 组以保证覆盖度）` : ''}。

【题目信息】
标题：${title}
描述：
${description}

【输入格式】
${inputDescription}

【输出格式】
${outputDescription}

【要求】
1. 生成 ${finalCount} 组测试数据${count >= 15 ? '（数量严格匹配）' : '（用户原要求' + count + '组，已上调至 15 组以保证覆盖度）'}
2. 必须覆盖以下 10 个维度的至少 9 个：
${renderTestCaseDimensions()}
3. 严格遵循输入格式（行数、列数、字段顺序、值域）
${outputRequirement}

【质量门禁】（不可违反）
${TEST_DATA_QUALITY_GATES.map(g => `- ${g}`).join('\n')}

【输出格式】
仅返回一个 JSON 对象：
${exampleJson}

注意：
- 字符串中的换行必须用 \\n 转义（不要写裸换行）
- 不要添加任何 markdown 标记（\`\`\`json 等）
- 不要在 JSON 外添加任何解释文字`;

    return {
      systemPrompt,
      userPrompt,
      temperature
    };
  }

  generateThinkingPrompt(context: TestDataGenContext): string {
    const { title, description, inputDescription, outputDescription, count } = context;
    return `你是一位资深的算法测试数据规划师，正在为以下题目规划 ${count} 组测试数据。

题目：${title}
描述：${description}
输入格式：${inputDescription}
输出格式：${outputDescription}

${THINKING_STEP_FRAME}

请输出：
- 数据范围分析（每行/字段的合法值域）
- ${count} 组测试数据的维度规划（仅列类别与意图，如"n=1 的最小值情形"、"n=10^5 压力测试"）
- 关键边界条件清单
- 若有特殊数据格式（如浮点精度、负数、字符串），列出注意事项

注意：仅输出规划文本，不要生成 JSON、不要添加 \`\`\` 标记。`;
  }
}
