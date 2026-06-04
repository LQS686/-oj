
import { GenerationMode, SimilarContext, PromptGenerator, PromptResult } from '../core/types';
import { PROBLEM_QUALITY_GATES, THINKING_STEP_FRAME, buildDifficultyContext, renderTestCaseDimensions } from '../core/quality-gates';

export class SimilarPromptGenerator implements PromptGenerator {
  generate(context: SimilarContext): PromptResult {
    if (context.mode !== GenerationMode.SIMILAR) {
      throw new Error('Invalid context mode for SimilarPromptGenerator');
    }

    const { textInput } = context;
    // Similar 模式：仿写，需要一定随机性以产生新背景
    const temperature = 0.7;

    const systemPrompt = `你是一位资深算法竞赛命题人，擅长根据给定题目"仿写"出同算法但异背景的新题目。

核心原则：
1. 同算法 — 新题必须使用与原题相同的核心算法/数据结构/状态转移
2. 异背景 — 故事场景、变量含义、问题描述必须完全不同于原题（避免抄袭嫌疑）
3. 同难度 — 新题难度与原题处于同一档位
4. 不可暴露 — 不要在新题描述中提及"类似"、"参考"、"X 题"等字样

${THINKING_STEP_FRAME}`;

    const userPrompt = `请根据以下原题，仿写一道"同算法 + 异背景"的新题目。

【原题目】
"""
${textInput}
"""

【任务步骤】
1. 识别原题核心算法（如：区间 DP / 二分图匹配 / 线段树 / 最短路 ...）
2. 估算原题难度档位（"入门" | "普及-" | "普及" | "普及+" | "提高" | "提高+" | "省选" | "NOI"）
3. 创建一个**完全不同**的故事背景（生活/数学/游戏/天文/历史等任意领域均可）
4. 沿用相同核心算法，但场景、变量名、问题表述都需重写
5. 设计完整测试数据覆盖边界

${buildDifficultyContext('提高')}  // 占位，实际档位由 AI 识别后填入下方 difficulty 字段

【质量门禁】（不可违反）
${PROBLEM_QUALITY_GATES.map(g => `- ${g}`).join('\n')}

【字段定义】
1. title: 简洁有创意的中文题目名（4-10 字）
2. description: 全新故事背景的题目描述，Markdown 格式，简体中文
3. input: 输入格式描述（中文）
4. output: 输出格式描述（中文）
5. samples: 至少 2 组样例 [{input, output, explanation?}]
6. test_cases: 至少 15 组测试数据，必须覆盖以下 10 个维度的至少 9 个：
${renderTestCaseDimensions()}
7. difficulty: 字符串，与原题同一档位（"入门" | "普及-" | "普及" | "普及+" | "提高" | "提高+" | "省选" | "NOI"）
8. tags: 至少 1 个中文标签
9. hint: 数据范围提示，不要直接透露算法
10. time_limit: 整数毫秒
11. memory_limit: 整数 MB
12. solution_cpp: 完整 C++17 标程
13. solution_python: 完整 Python3 标程

【输出格式】
仅返回一个 JSON 对象：
{
  "problems": [ /* 1 个 problem 对象 */ ]
}

不要添加任何 markdown 标记（\`\`\`json 等），不要在 JSON 外添加任何解释文字。`;

    return {
      systemPrompt,
      userPrompt,
      temperature
    };
  }

  generateThinkingPrompt(context: SimilarContext): string {
    const { textInput } = context;
    return `你是一位资深算法竞赛命题人，正在分析以下原题并设计仿写思路：

"""
${textInput}
"""

${THINKING_STEP_FRAME}

请输出：
- 原题核心算法（1 句话）
- 原题难度档位（"入门" | "普及-" | "普及" | "普及+" | "提高" | "提高+" | "省选" | "NOI"）
- 新题背景方向（建议 2-3 个候选场景，从中选 1）
- 新题核心解法（与原题一致，但用新场景下的术语表达）
- 时空复杂度与边界规划

注意：仅输出分析文本，不要生成 JSON、不要添加 \`\`\` 标记。`;
  }
}
