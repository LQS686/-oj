/**
 * lib/ai/prompts/similar/generator.ts
 *
 * 相似题生成 prompt generator（Task 28.2）
 *
 * 复用 ParamGen 模板 + 注入原题信息，让 AI 基于已有题目生成变体。
 * 走与 PARAM_GEN 一致的预览-确认流程（Task 28.4）。
 *
 * 设计：
 * - system prompt 在 ParamGen 基础上增加"原题参考"段
 * - user prompt 注入原题完整信息（标题 / 描述 / 输入输出 / 标签 / 难度 / 标程）
 * - 要求 AI 生成"同主题、同难度档位但不同背景/数据"的变体题
 */
import type { SimilarContext, PromptGenerator, PromptResult } from '../core/types';
import { GenerationMode } from '../core/types'
import { fillTemplate, PROBLEM_JSON_TEMPLATE } from '../paramgen/json-template'
import type { Difficulty } from '../core/quality-gates';
import { DIFFICULTY_PROFILES } from '../core/quality-gates'
import {
  JSON_OUTPUT_SPEC,
  SINGLE_PROBLEM_CONSTRAINT,
  TEST_CASE_COVERAGE_REQUIREMENT,
} from '../shared/json-output-spec'
import { SOLUTION_STRUCTURE_SPEC, SOLUTION_CODE_SPEC } from '../shared/solution-structure'

export class SimilarPromptGenerator implements PromptGenerator {
  generate(context: SimilarContext): PromptResult {
    if (context.mode !== GenerationMode.SIMILAR) {
      throw new Error('Invalid context mode for SimilarPromptGenerator')
    }

    const { type, difficulty, topic, additionalInfo, sourceProblem } = context
    const temperature = 0.5

    const profile = DIFFICULTY_PROFILES[difficulty as Difficulty]
    const timeMin = profile?.timeLimitRange?.[0] ?? 1000
    const timeMax = profile?.timeLimitRange?.[1] ?? 1500
    const memMin = profile?.memoryLimitRange?.[0] ?? 128
    const memMax = profile?.memoryLimitRange?.[1] ?? 256
    const timeLimit = Math.round((timeMin + timeMax) / 2)
    const memoryLimit = Math.round((memMin + memMax) / 2)

    const systemPrompt = `你是一位资深的算法竞赛 JSON 填空机器人，现在需要基于一道已有题目生成一道**相似变体题**。

# 角色与原则
${JSON_OUTPUT_SPEC}

# 全局约束（不可违反）
1. ${SINGLE_PROBLEM_CONSTRAINT}
2. ${TEST_CASE_COVERAGE_REQUIREMENT}
3. 相似题要求：与原题**同主题、同难度档位、同算法核心**，但**不同背景故事 / 不同数据范围细节 / 不同输入输出格式细节**
4. 禁止照抄原题：title / description / samples 必须完全重写，不能与原题雷同

# 字段填充指引
${SOLUTION_CODE_SPEC}
${SOLUTION_STRUCTURE_SPEC}

# 相似题生成原则
- 算法核心保持一致（如原题是"最短路"，变体也应是"最短路"相关）
- 背景故事 / 场景必须全新（如原题是"校园路径"，变体可改为"物流配送"）
- 数据范围可在同档位内微调（如原题 n≤10^5，变体可 n≤5×10^4）
- 输入输出格式可以变化（如原题是多组数据，变体可改为单组）
- tags 应与原题相似但可微调（如原题 ["动态规划","背包"]，变体可 ["动态规划","背包","计数"]）`

    const userPrompt = `请基于以下原题信息，生成一道相似变体题。

【原题信息】
标题：${sourceProblem.title}
描述：
${sourceProblem.description}

输入格式：
${sourceProblem.input || '（未提供）'}

输出格式：
${sourceProblem.output || '（未提供）'}

原题标签：${(sourceProblem.tags || []).join('、') || '（无）'}
原题难度：${sourceProblem.difficulty || difficulty}

${sourceProblem.stdCode ? `原题标程（${sourceProblem.stdLang || 'cpp'}）：\n\`\`\`${sourceProblem.stdLang || 'cpp'}\n${sourceProblem.stdCode}\n\`\`\`` : '（无标程）'}

【变体题要求】
- 算法主题：${topic.join('、')}
- 难度档位：${difficulty}
- 类型：${type}
${additionalInfo ? `- 附加要求：${additionalInfo}` : ''}

模板仅供参考结构，**请直接输出 JSON，不要写"下面是 JSON"等任何前言**。

# JSON 模板

${fillTemplate(difficulty, timeLimit, memoryLimit)}`

    return {
      systemPrompt,
      userPrompt,
      temperature,
    }
  }

  generateThinkingPrompt(context: SimilarContext): string {
    const { type, difficulty, topic, sourceProblem } = context
    return `你是一位资深算法竞赛命题人，正在基于一道已有题目设计相似变体。

原题：${sourceProblem.title}（${sourceProblem.difficulty || difficulty}）
原题标签：${(sourceProblem.tags || []).join('、')}
变体主题：${topic.join('、')}
变体难度：${difficulty}
变体类型：${type}

请按以下 4 步完成设计分析（暂时不要生成完整 JSON）：

【思考步骤】
步骤1 原题分析：分析原题考察的算法核心与关键约束
步骤2 变体设计：设计新的背景故事 / 场景，保持算法核心一致
步骤3 边界与数据范围：在原题基础上微调数据范围，确保同档位
步骤4 时空与算法选型：确认变体与原题算法复杂度一致

输出要求：
- 仅输出设计思路与分析文本（中文）
- 不要生成 JSON、不要出现\`\`\`标记`
  }
}
