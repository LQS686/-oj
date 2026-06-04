
import { GenerationMode, ParamGenContext, PromptGenerator, PromptResult } from '../core/types';
import {
  PROBLEM_QUALITY_GATES,
  THINKING_STEP_FRAME,
  FEW_SHOT_EXAMPLE,
  buildDifficultyContext,
  renderTestCaseDimensions
} from '../core/quality-gates';

export class ParamGenPromptGenerator implements PromptGenerator {
  generate(context: ParamGenContext): PromptResult {
    if (context.mode !== GenerationMode.PARAM_GEN) {
      throw new Error('Invalid context mode for ParamGenPromptGenerator');
    }

    const { type, difficulty, topic, count, additionalInfo, skipTestCases } = context;
    // ParamGen 创作题：保留一定随机性以激发灵感
    const temperature = 0.8;
    // 测试数据覆盖率要求：仅在生成 test_cases 时需要
    const testCasesRequirement = skipTestCases
      ? `6. test_cases: **本步骤不需要生成测试数据**（会在下一步单独调用 AI 生成）。请直接返回空数组 \`[]\`，不要浪费 token 输出测试点。`
      : `6. test_cases: 【硬性要求】**必须生成 15 组以上测试数据**，绝对不可低于 10 组。每少一组视为质量不合格。
必须覆盖以下 10 个维度的至少 9 个：
${renderTestCaseDimensions()}

**自检步骤**：在输出 JSON 之前，请在思考过程中明确写出"我已经生成了 N 组测试数据，N = ___，覆盖维度包括 a/b/c/.../j"，然后再输出最终 JSON。`

    const systemPrompt = `你是一位资深算法竞赛命题人，擅长为信息学奥赛、CCF GESP、NOI、ACM 等赛事出题。
你的输出将直接被前端展示给用户，因此必须：
1. 题目逻辑严密、难度与目标档位完全匹配
2. 标程代码可在标准编译器（g++ 11+、Python 3.10+）下编译运行
3. 测试数据真实可解，与标程输出完全一致
4. JSON 格式严格合法闭合（不要出现 \\n 未转义、未闭合花括号等）

${THINKING_STEP_FRAME}`;

    const userPrompt = `请生成 ${count} 道难度严格为"${difficulty}"的${type}题${skipTestCases ? '（仅生成题目描述，测试数据将在下一步生成）' : ''}。

${buildDifficultyContext(difficulty)}

【主题要求】
涉及：${topic.join('、')}

${additionalInfo ? `【附加要求】\n${additionalInfo}\n` : ''}

【质量门禁】（不可违反，违反任意一条视为生成失败）
${PROBLEM_QUALITY_GATES.map(g => `- ${g}`).join('\n')}

【字段定义】
1. title: 简洁有创意的中文题目名（建议 4-10 字，可加副标题）
2. description: 详细题目描述，可使用 Markdown（含背景、要求、约束），用简体中文
3. input: 输入格式描述（中文）
4. output: 输出格式描述（中文）
5. samples: 至少 2 组样例，每组 { input, output, explanation? }；explanation 用中文
${testCasesRequirement}
7. difficulty: 必须是字符串 "${difficulty}"（与传入完全一致）
8. tags: 至少 1 个中文标签，与算法/数据结构对应
9. hint: 数据范围提示，1-2 句话，不要直接透露算法
10. time_limit: 时间限制（毫秒），在难度档位建议范围内
11. memory_limit: 内存限制（MB），在难度档位建议范围内
12. solution_cpp: 完整可编译的 C++17 标程，以 #include <bits/stdc++.h> 开头，变量命名清晰
13. solution_python: 完整可运行的 Python3 标程，可使用 sys.stdin.read() 加速

${FEW_SHOT_EXAMPLE}

【输出格式】
仅返回一个 JSON 对象，结构：
{
  "problems": [ /* 上面字段定义的对象，count 个 */ ]
}

不要添加任何 markdown 标记（\`\`\`json 等），不要在 JSON 外添加任何解释文字。`;

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

${buildDifficultyContext(difficulty)}

请按以下 4 步完成设计分析（暂时不要生成完整 JSON）：

${THINKING_STEP_FRAME}

输出要求：
- 仅输出设计思路与分析文本（中文）
- 不要生成 JSON、不要出现\`\`\`标记
- 最后给出"建议时间/内存限制"与"建议测试数据覆盖维度"两个小节`;
  }
}
