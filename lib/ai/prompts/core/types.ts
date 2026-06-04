
export enum GenerationMode {
  PARAM_GEN = 'ParamGen',
  CLONE = 'Clone',
  SIMILAR = 'Similar',
  TEST_DATA_GEN = 'TestDataGen'
}

export interface GeneratedProblem {
  title: string;
  description: string;
  input: string; // Changed from input_description
  output: string; // Changed from output_description
  samples: Array<{ input: string; output: string; explanation?: string }>;
  test_cases: Array<{ input: string; output: string }>;
  difficulty: string;
  tags: string[];
  hint?: string;
  time_limit?: number; // New: Recommended time limit in ms
  memory_limit?: number; // New: Recommended memory limit in MB
  solution_cpp?: string;
  solution_python?: string;
}

export interface BaseContext {
  mode: GenerationMode;
}

export interface CloneContext extends BaseContext {
  mode: GenerationMode.CLONE;
  textInput: string;
  optimizeDescription: boolean;
}

export interface SimilarContext extends BaseContext {
  mode: GenerationMode.SIMILAR;
  textInput: string;
}

export interface ParamGenContext extends BaseContext {
  mode: GenerationMode.PARAM_GEN;
  type: string;
  difficulty: string;
  topic: string[];
  count: number;
  additionalInfo?: string;
}

export interface TestDataGenContext extends BaseContext {
  mode: GenerationMode.TEST_DATA_GEN;
  title: string;
  description: string;
  inputDescription: string;
  outputDescription: string;
  count: number;
  hasSolution?: boolean; // New: If true, only ask for inputs
}

export type PromptContext = CloneContext | SimilarContext | ParamGenContext | TestDataGenContext;

export interface PromptResult {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
}

export interface PromptGenerator {
  generate(context: PromptContext): PromptResult;
  generateThinkingPrompt(context: PromptContext): string;
}

export class PromptCrossUseException extends Error {
  constructor(message: string, public context?: any) {
    super(message);
    this.name = 'PromptCrossUseException';
  }
}
