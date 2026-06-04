
import { GenerationMode, CloneContext, PromptGenerator, PromptResult } from '../core/types';
import { CLONE_QUALITY_GATES, THINKING_STEP_FRAME, renderTestCaseDimensions } from '../core/quality-gates';

export class ClonePromptGenerator implements PromptGenerator {
  generate(context: CloneContext): PromptResult {
    if (context.mode !== GenerationMode.CLONE) {
      throw new Error('Invalid context mode for ClonePromptGenerator');
    }

    const { textInput, optimizeDescription } = context;
    // Clone 模式：结构化提取，几乎不需要随机性
    const temperature = 0.1;

    const systemPrompt = `你是一个严格的数据提取引擎，专门用于将非结构化的算法题目文本转换为标准 JSON。

核心原则：
1. 严格提取 — 仅基于用户输入文本中明确存在的信息；找不到的字段才允许根据上下文合理补全
2. 不可编造 — 不要凭空添加原题不存在的样例、约束、背景
3. 忠实还原 — 描述性文本尽量贴近原文表述，不要重写为完全不同的风格（除非 optimizeDescription=true）
4. 结构稳定 — 输出 JSON 结构与下方 Schema 完全一致

${THINKING_STEP_FRAME}`;

    const userPrompt = `请将以下算法题目文本转换为标准 JSON。

${optimizeDescription ? '【优化模式】题目描述可重写以使其更清晰专业（保留核心逻辑）。' : '【忠实提取】保持题目描述的原始表述，仅清理明显格式问题。'}

【输入文本】
"""
${textInput}
"""

【质量门禁】（不可违反）
${CLONE_QUALITY_GATES.map(g => `- ${g}`).join('\n')}

【提取规则】
1. title: 从第一行或标题中提取。移除"B3837"、"[GESP...]"、"P1000"、"#101"等题号前缀。找不到则生成简短中文摘要。
2. description: ${optimizeDescription ? '重写使其清晰专业，可使用 Markdown 格式。' : '提取主体描述，移除"输入"、"输出"、"样例"等区段。'}
3. input: 提取输入格式描述（中文），不要复制样例数据本身。
4. output: 提取输出格式描述（中文），不要复制样例数据本身。
5. samples: 提取样例 [{input, output, explanation?}]。若原题未给样例，可基于题意生成 1-2 组。
6. test_cases: 无论如何必须生成 15 组以上测试数据，覆盖以下 10 个维度的至少 9 个：
${renderTestCaseDimensions()}
7. difficulty: 估算难度，必须是以下之一："入门" | "普及-" | "普及" | "普及+" | "提高" | "提高+" | "省选" | "NOI"。
8. tags: 至少 1 个标签，根据算法/数据结构判断。
9. hint: 数据范围提示，如"1 <= n <= 10^5"。原题有时限/内存信息也可一并写入。
10. time_limit: 整数毫秒，默认 1000；按算法复杂度合理设置。
11. memory_limit: 整数 MB，默认 128。
12. solution_cpp: 完整 C++17 标程，以 #include <bits/stdc++.h> 开头；变量名清晰、无编译错误。
13. solution_python: 完整 Python3 标程，逻辑与 C++ 版本一致。

【Few-shot 示例】（参考结构，不要复制内容）
输入：B3837 [GESP202309 一级] 买苹果。小明去超市买苹果，每个苹果 3 元，输入一个整数 n 表示买的苹果数，输出总金额。

输出（示意）：
{
  "problems": [{
    "title": "买苹果",
    "description": "小明去超市买苹果，每个苹果 3 元。给定购买的苹果数 n，输出总金额。",
    "input": "一个整数 n（1 <= n <= 100）",
    "output": "一个整数，表示总金额",
    "samples": [{ "input": "5", "output": "15", "explanation": "5 个苹果，每个 3 元，共 15 元" }],
    "test_cases": [
      { "input": "1", "output": "3" },
      { "input": "100", "output": "300" },
      { "input": "0", "output": "0" },
      { "input": "33", "output": "99" },
      { "input": "87", "output": "261" }
    ],
    "difficulty": "入门",
    "tags": ["入门", "模拟"],
    "hint": "1 <= n <= 100",
    "time_limit": 1000,
    "memory_limit": 128,
    "solution_cpp": "#include <bits/stdc++.h>\\nusing namespace std;\\nint main(){int n;cin>>n;cout<<n*3;}\\n",
    "solution_python": "n=int(input())\\nprint(n*3)\\n"
  }]
}

【输出格式】
仅返回一个 JSON 对象，结构：
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

  generateThinkingPrompt(context: CloneContext): string {
    const { textInput } = context;
    return `你是一个严格的算法题目分析器，正在分析以下文本：

"""
${textInput}
"""

${THINKING_STEP_FRAME}

请输出：
- 核心算法识别（1 句话）
- 数据约束分析（1-2 句话）
- 边界情况枚举（列表）
- 建议的难度档位（"入门" | "普及-" | "普及" | "普及+" | "提高" | "提高+" | "省选" | "NOI" 之一）
- 5 组测试数据维度规划（不要生成 JSON）

注意：仅输出分析文本，不要生成 JSON、不要添加 \`\`\` 标记。`;
  }
}
