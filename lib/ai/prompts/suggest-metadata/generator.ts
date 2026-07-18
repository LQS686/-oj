/**
 * lib/ai/prompts/suggest-metadata/generator.ts
 *
 * SuggestMetadata 模式的 PromptGenerator 实现（薄包装 buildSuggestMetadataPrompt）
 *
 * 注：suggest_metadata 模式的实际调用路径是 queue.ts → suggestMetadata() → buildSuggestMetadataPrompt()，
 * 不经过 promptLoader.getPrompt。此 generator 仅用于 loader 注册表的类型完整性
 * 与未来可能的 thinking 步骤扩展。
 */
import {
  GenerationMode,
  type SuggestMetadataContext,
  type PromptGenerator,
  type PromptResult,
} from '../core/types'
import { buildSuggestMetadataPrompt } from '@/lib/ai/analyzers/prompts/suggest-metadata-prompt'

export class SuggestMetadataPromptGenerator implements PromptGenerator {
  generate(context: SuggestMetadataContext): PromptResult {
    if (context.mode !== GenerationMode.SUGGEST_METADATA) {
      throw new Error('Invalid context mode for SuggestMetadataPromptGenerator')
    }
    const { systemPrompt, userPrompt } = buildSuggestMetadataPrompt({
      description: context.description,
      samples: context.samples,
      input: context.input,
      output: context.output,
    })
    // 元数据建议温度偏低（确定性输出，无需创造性）
    return {
      systemPrompt,
      userPrompt,
      temperature: 0.2,
    }
  }

  generateThinkingPrompt(_context: SuggestMetadataContext): string {
    // SuggestMetadata 模式不使用 thinking 步骤
    return ''
  }
}
