/**
 * lib/ai/prompts/test-data/incremental-generator.ts
 *
 * 测试数据增量补充 prompt generator（Task 33.3）
 *
 * 在 TestDataGen 基础上，注入"已覆盖维度"和"缺失维度"信息，
 * 要求 AI 仅生成缺失维度的测试点（追加，不替换原有数据）。
 */
import type {
  TestDataIncrementalContext,
  PromptGenerator,
  PromptResult} from '../core/types';
import {
  GenerationMode
} from '../core/types'
import { TEST_DATA_QUALITY_GATES } from '../core/quality-gates'
import { renderTestCoverageSpec } from '../shared/test-coverage-spec'

export class TestDataIncrementalGenerator implements PromptGenerator {
  generate(context: TestDataIncrementalContext): PromptResult {
    if (context.mode !== GenerationMode.TEST_DATA_INCREMENTAL) {
      throw new Error('Invalid context mode for TestDataIncrementalGenerator')
    }

    const {
      title,
      description,
      inputDescription,
      outputDescription,
      count,
      hasSolution,
      coveredDimensions,
      missingDimensions,
    } = context
    const temperature = 0.3

    const systemPrompt = `你是一位资深的算法测试数据生成器，现在需要为已有测试点的题目**补充缺失维度的测试数据**。

核心原则：
1. **仅生成缺失维度** — 不要重复生成已覆盖维度的测试点
2. 数据真实性 — 每一组 test_cases 的 input 都必须满足题目输入格式，output 都必须是 input 经过题目算法计算的真实结果
3. 边界覆盖 — 重点覆盖缺失的维度，确保补全后 10 维全覆盖
4. 纯数据 — input / output 字符串中不能包含中文字符或注释
5. 增量补充 — 生成的数据将与现有数据合并，不要生成与现有数据重复的测试点

# 已覆盖维度（无需再生成）
${coveredDimensions.length > 0
  ? coveredDimensions.map(d => `   - ${d.id}) ${d.name}`).join('\n')
  : '   （无，当前为空）'}

# 缺失维度（请重点覆盖）
${missingDimensions.length > 0
  ? missingDimensions.map(d => `   - ${d.id}) ${d.name}`).join('\n')
  : '   （无缺失，所有维度已覆盖）'}`

    let outputRequirement: string
    let exampleJson: string

    if (hasSolution) {
      outputRequirement = `4. 你需要生成 input 和 output 两个字段：
   - input 必须严格遵循输入格式
   - output 必须是 input 通过题目算法计算后的真实结果
5. 每个缺失维度至少生成 1-2 组测试点`
      exampleJson = `{
  "test_cases": [
    { "input": "5\\n1 2 3 4 5", "output": "15" }
  ]
}`
    } else {
      outputRequirement = `4. output 必须是 input 通过题目算法计算后的**真实结果**
5. 每个缺失维度至少生成 1-2 组测试点`
      exampleJson = `{
  "test_cases": [
    { "input": "5\\n1 2 3 4 5", "output": "15" }
  ]
}`
    }

    const userPrompt = `请为以下题目**补充** ${count} 组测试数据（增量模式，仅覆盖缺失维度）。

【题目信息】
标题：${title}
描述：
${description}

【输入格式】
${inputDescription}

【输出格式】
${outputDescription}

【10 维测试覆盖框架】
${renderTestCoverageSpec()}

【要求】
1. 仅生成缺失维度的测试点（共 ${missingDimensions.length} 个维度待补全）
2. 严格遵循输入格式
${outputRequirement}

【质量门禁】（不可违反）
${TEST_DATA_QUALITY_GATES.map(g => `- ${g}`).join('\n')}

${TEST_DATA_QUALITY_GATES.length > 0 ? '' : ''}

【输出格式】
仅返回一个 JSON 对象：
${exampleJson}

注意：
- 字符串中的换行必须用 \\n 转义
- 不要添加任何 markdown 标记
- 不要在 JSON 外添加任何解释文字`

    return {
      systemPrompt,
      userPrompt,
      temperature,
    }
  }

  generateThinkingPrompt(context: TestDataIncrementalContext): string {
    const { title, description, coveredDimensions, missingDimensions } = context
    return `你是一位资深的算法测试数据规划师，正在为以下题目规划增量补充测试数据。

题目：${title}
描述：${description}

已覆盖维度：${coveredDimensions.map(d => d.name).join('、') || '无'}
缺失维度：${missingDimensions.map(d => d.name).join('、') || '无'}

请分析每个缺失维度应该生成什么样的测试数据：
- 每个维度的数据特征
- 应该构造的边界值
- 与现有数据的区别点

注意：仅输出规划文本，不要生成 JSON。`
  }
}
