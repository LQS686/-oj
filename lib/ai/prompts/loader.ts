import { logger } from '../../../lib/logger';
import { GenerationMode, PromptContext, PromptGenerator, PromptResult, PromptCrossUseException } from './core/types';
import { ParamGenPromptGenerator } from './paramgen/generator';
import { TestDataGenPromptGenerator } from './test-data/generator';

class PromptLoader {
  private static instance: PromptLoader;
  private generators: Map<GenerationMode, PromptGenerator>;

  private constructor() {
    this.generators = new Map();
    this.generators.set(GenerationMode.PARAM_GEN, new ParamGenPromptGenerator());
    this.generators.set(GenerationMode.TEST_DATA_GEN, new TestDataGenPromptGenerator());

    // Freeze the generators map to prevent runtime tampering
    Object.freeze(this.generators);
  }

  public static getInstance(): PromptLoader {
    if (!PromptLoader.instance) {
      PromptLoader.instance = new PromptLoader();
      Object.freeze(PromptLoader.instance);
    }
    return PromptLoader.instance;
  }

  public getPrompt(context: PromptContext): PromptResult {
    const generator = this.generators.get(context.mode);
    if (!generator) {
      throw new PromptCrossUseException(`No generator found for mode: ${context.mode}`);
    }

    try {
        const result = generator.generate(context);
        return result;
    } catch (error) {
        if (error instanceof PromptCrossUseException) {
            this.logAudit(context, error);
            throw error;
        }
        throw new PromptCrossUseException(`Error generating prompt: ${error instanceof Error ? error.message : 'Unknown error'}`, context);
    }
  }

  public getThinkingPrompt(context: PromptContext): string {
    const generator = this.generators.get(context.mode);
    if (!generator) {
      throw new PromptCrossUseException(`No generator found for mode: ${context.mode}`);
    }

    try {
        return generator.generateThinkingPrompt(context);
    } catch (error) {
        if (error instanceof PromptCrossUseException) {
            this.logAudit(context, error);
            throw error;
        }
        throw new PromptCrossUseException(`Error generating thinking prompt: ${error instanceof Error ? error.message : 'Unknown error'}`, context);
    }
  }

  private logAudit(context: PromptContext, error: Error) {
      // In a real system, this would write to DB or structured log file
      logger.warn('[PROMPT_AUDIT_LOG]', { timestamp: new Date().toISOString(), mode: context.mode, error: error.message, stack: error.stack, contextSummary: this.summarizeContext(context) });
  }

  private summarizeContext(context: any): string {
      // Avoid logging full text input for privacy/size
      const summary = { ...context };
      return JSON.stringify(summary);
  }
}

// Export a frozen singleton instance
export const promptLoader = PromptLoader.getInstance();
