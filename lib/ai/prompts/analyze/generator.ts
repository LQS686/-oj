/**
 * lib/ai/prompts/analyze/generator.ts
 *
 * Analyze 模式的 PromptGenerator 实现（薄包装 buildAnalyzePrompt）
 *
 * 注：analyze 模式的实际调用路径是 queue.ts → analyzeProblem() → buildAnalyzePrompt()，
 * 不经过 promptLoader.getPrompt。此 generator 仅用于 loader 注册表的类型完整性
 * 与未来可能的 thinking 步骤扩展。
 */
import {
  GenerationMode,
  type AnalyzeContext,
  type PromptGenerator,
  type PromptResult,
} from '../core/types'
import { buildAnalyzePrompt } from '@/lib/ai/analyzers/prompts/analyze-prompt'

export class AnalyzePromptGenerator implements PromptGenerator {
  generate(context: AnalyzeContext): PromptResult {
    if (context.mode !== GenerationMode.ANALYZE) {
      throw new Error('Invalid context mode for AnalyzePromptGenerator')
    }
    const { systemPrompt, userPrompt } = buildAnalyzePrompt(context.problem)
    // 分析任务温度偏低（只读评估，无需创造性）
    return {
      systemPrompt,
      userPrompt,
      temperature: 0.2,
    }
  }

  generateThinkingPrompt(_context: AnalyzeContext): string {
    // Analyze 模式不使用 thinking 步骤（只读分析，无需命题规划）
    return ''
  }
}
