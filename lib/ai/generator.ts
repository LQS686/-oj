
import { logger } from '../logger';
import { createAiClient, getModelName } from './factory'
import { getAiConfig, AiConfig } from './config'
import { promptLoader } from './prompts/loader'
import { GenerationMode, PromptContext, GeneratedProblem } from './prompts/core/types'

export interface GenerationParams {
  mode: 'parametric' | 'text_based' | 'test_data'; 
  // Parametric Mode Fields
  type?: string; 
  difficulty?: string; 
  topic?: string[]; 
  count?: number;
  additionalInfo?: string;
  
  // Text Based Mode Fields
  textInput?: string;
  textModeType?: 'clone' | 'similar';
  optimizeDescription?: boolean;

  // Test Data Gen Fields
  title?: string;
  description?: string;
  inputDescription?: string;
  outputDescription?: string;
  
  // Optional: Target problem ID for background auto-saving
  targetProblemId?: string;
  
  // Optional: Solution code for running test cases
  solutionCode?: string;
  solutionLanguage?: string;

  // ✅ New: Specific Model ID to use
  modelId?: string;
}

export interface GenerationResult {
  problems: GeneratedProblem[]; // Kept for compatibility, but might be empty for test_data
  testCases?: any[]; // New field for test data gen
  thought?: string;
  tokensUsed: number;
}

function safeJsonParse(content: string): any {
  // 1. Try direct parse
  try {
    return JSON.parse(content);
  } catch (e) {
    // Fall through
  }

  // 2. Remove Markdown code blocks
  let sanitized = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  
  // 3. Try parsing sanitized
  try {
    return JSON.parse(sanitized);
  } catch (e) {
    // Fall through
  }

  // 4. Fix bad escapes in the sanitized string
  // Replace \' with ' (JSON strings use double quotes, single quotes don't need escape)
  let repaired = sanitized.replace(/\\'/g, "'");
  // Escape invalid backslashes (e.g. \d -> \\d)
  // JSON allows: " \ / b f n r t u
  // We match backslash followed by NOT one of those.
  repaired = repaired.replace(/\\([^"\\/bfnrtu])/g, "\\\\$1");
  
  try {
    return JSON.parse(repaired);
  } catch (e) {
    // Fall through
  }

  // 5. Fix missing commas in arrays and objects
  // This handles cases where the AI forgets to add commas between array elements
  let commaFixed = repaired;
  
  // Fix missing commas between array elements
  // Match pattern: } followed by whitespace followed by {
  commaFixed = commaFixed.replace(/\}\s*{/g, '}, {');
  // Match pattern: ] followed by whitespace followed by [ (unlikely but possible)
  commaFixed = commaFixed.replace(/\]\s*\[/g, '], [');
  // Match pattern: " followed by whitespace followed by " (for string elements in arrays)
  commaFixed = commaFixed.replace(/"\s*"/g, '", "');
  // Match pattern: number followed by whitespace followed by {
  commaFixed = commaFixed.replace(/([0-9])\s*{/g, '$1, {');
  // Match pattern: number followed by whitespace followed by "
  commaFixed = commaFixed.replace(/([0-9])\s*"/g, '$1, "');
  // Match pattern: number followed by whitespace followed by number
  commaFixed = commaFixed.replace(/([0-9])\s+([0-9])/g, '$1, $2');
  // Match pattern: } followed by whitespace followed by "
  commaFixed = commaFixed.replace(/\}\s*"/g, '}, "');
  // Match pattern: " followed by whitespace followed by {
  commaFixed = commaFixed.replace(/"\s*{/g, '", {');
  // Match pattern: number followed by whitespace followed by ]
  commaFixed = commaFixed.replace(/([0-9])\s*\]/g, '$1, ]');
  // Match pattern: } followed by whitespace followed by ]
  commaFixed = commaFixed.replace(/\}\s*\]/g, '}, ]');
  // Match pattern: " followed by whitespace followed by ]
  commaFixed = commaFixed.replace(/"\s*\]/g, '", ]');
  
  try {
    return JSON.parse(commaFixed);
  } catch (e) {
    // Fall through
  }
  
  // 6. More aggressive comma fixing for complex cases
  // This handles cases where multiple elements are missing commas
  let aggressiveFixed = commaFixed;
  
  // Split by common array element separators and rejoin with commas
  // This is a more aggressive approach for severely malformed JSON
  if (aggressiveFixed.includes('[')) {
    // Find the start and end of the array
    const arrayStart = aggressiveFixed.indexOf('[');
    const arrayEnd = aggressiveFixed.lastIndexOf(']');
    
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      const beforeArray = aggressiveFixed.substring(0, arrayStart + 1);
      const arrayContent = aggressiveFixed.substring(arrayStart + 1, arrayEnd);
      const afterArray = aggressiveFixed.substring(arrayEnd);
      
      // Split array content by whitespace and braces, then filter out empty strings
      const elements = arrayContent.split(/\s*[\{\}]\s*/).filter(el => el.trim() !== '');
      
      // Reconstruct the array with proper commas
      if (elements.length > 0) {
        let reconstructedArray = '[';
        for (let i = 0; i < elements.length; i++) {
          if (i > 0) reconstructedArray += ', ';
          // Add back braces if they were present
          if (arrayContent.includes('{' + elements[i]) || arrayContent.includes(elements[i] + '}')) {
            reconstructedArray += '{' + elements[i] + '}';
          } else {
            reconstructedArray += elements[i];
          }
        }
        reconstructedArray += ']';
        
        // Reconstruct the entire JSON
        aggressiveFixed = beforeArray + reconstructedArray + afterArray;
        
        try {
          return JSON.parse(aggressiveFixed);
        } catch (e) {
          // Fall through
        }
      }
    }
  }
  
  try {
    return JSON.parse(aggressiveFixed);
  } catch (e) {
    // Fall through
  }

  // 7. Try extracting JSON from text (if LLM added chatter)
  const firstOpen = content.search(/[\{\[]/);
  // Find last '}' or ']'
  let lastClose = -1;
  for (let i = content.length - 1; i >= 0; i--) {
      if (content[i] === '}' || content[i] === ']') {
          lastClose = i;
          break;
      }
  }

  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
      const extracted = content.substring(firstOpen, lastClose + 1);
      try {
          return JSON.parse(extracted);
      } catch (e) {
           // Try repairing the extracted segment
           let repairedExtracted = extracted.replace(/\\'/g, "'");
           repairedExtracted = repairedExtracted.replace(/\\([^"\\/bfnrtu])/g, "\\\\$1");
           // Also fix commas in extracted segment
           repairedExtracted = repairedExtracted.replace(/\}\s*{/g, '}, {');
           repairedExtracted = repairedExtracted.replace(/\]\s*\[/g, '], [');
           repairedExtracted = repairedExtracted.replace(/"\s*"/g, '", "');
           repairedExtracted = repairedExtracted.replace(/([0-9])\s*{/g, '$1, {');
           repairedExtracted = repairedExtracted.replace(/([0-9])\s*"/g, '$1, "');
           repairedExtracted = repairedExtracted.replace(/([0-9])\s+([0-9])/g, '$1, $2');
           repairedExtracted = repairedExtracted.replace(/\}\s*"/g, '}, "');
           repairedExtracted = repairedExtracted.replace(/"\s*{/g, '", {');
           repairedExtracted = repairedExtracted.replace(/([0-9])\s*\]/g, '$1, ]');
           repairedExtracted = repairedExtracted.replace(/\}\s*\]/g, '}, ]');
           repairedExtracted = repairedExtracted.replace(/"\s*\]/g, '", ]');
           
           // Try parsing with basic fixes
           try {
               return JSON.parse(repairedExtracted);
           } catch (e) {
               // Try aggressive comma fixing on extracted segment
               if (repairedExtracted.includes('[')) {
                   const arrayStart = repairedExtracted.indexOf('[');
                   const arrayEnd = repairedExtracted.lastIndexOf(']');
                   
                   if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
                       const beforeArray = repairedExtracted.substring(0, arrayStart + 1);
                       const arrayContent = repairedExtracted.substring(arrayStart + 1, arrayEnd);
                       const afterArray = repairedExtracted.substring(arrayEnd);
                       
                       const elements = arrayContent.split(/\s*[\{\}]\s*/).filter(el => el.trim() !== '');
                       
                       if (elements.length > 0) {
                           let reconstructedArray = '[';
                           for (let i = 0; i < elements.length; i++) {
                               if (i > 0) reconstructedArray += ', ';
                               if (arrayContent.includes('{' + elements[i]) || arrayContent.includes(elements[i] + '}')) {
                                   reconstructedArray += '{' + elements[i] + '}';
                               } else {
                                   reconstructedArray += elements[i];
                               }
                           }
                           reconstructedArray += ']';
                           
                           const aggressiveFixedExtracted = beforeArray + reconstructedArray + afterArray;
                           return JSON.parse(aggressiveFixedExtracted);
                       }
                   }
               }
               
               // If all else fails, throw the error
               throw e;
           }
      }
  }

  throw new Error('Failed to parse JSON from AI response');
}

function mapToContext(params: GenerationParams): PromptContext {
    if (params.mode === 'test_data') {
        return {
            mode: GenerationMode.TEST_DATA_GEN,
            title: params.title || '',
            description: params.description || '',
            inputDescription: params.inputDescription || '',
            outputDescription: params.outputDescription || '',
            count: params.count || 5,
            hasSolution: !!params.solutionCode && !!params.solutionLanguage
        };
    } else if (params.mode === 'text_based') {
        if (params.textModeType === 'similar') {
            return {
                mode: GenerationMode.SIMILAR,
                textInput: params.textInput || ''
            };
        } else {
            // Default to Clone
            return {
                mode: GenerationMode.CLONE,
                textInput: params.textInput || '',
                optimizeDescription: params.optimizeDescription || false
            };
        }
    } else {
        return {
            mode: GenerationMode.PARAM_GEN,
            type: params.type || 'programming',
            difficulty: params.difficulty || '入门',
            topic: params.topic || [],
            count: params.count || 1,
            additionalInfo: params.additionalInfo
        };
    }
}

async function runThinkingStep(config: AiConfig, context: PromptContext): Promise<{ content: string, tokens: number }> {
    const client = createAiClient(config, true)
    const model = getModelName(config, true)
    
    // Use Loader to get isolated thinking prompt
    const prompt = promptLoader.getThinkingPrompt(context);

    const response = await client.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7 + (config.thinkingLevel * 0.1)
    })

    return {
        content: response.choices[0].message.content || '',
        tokens: response.usage?.total_tokens || 0
    }
}

export async function generateProblems(params: GenerationParams, userId?: string): Promise<GenerationResult> {
  const config = await getAiConfig(userId, params.modelId)
  const context = mapToContext(params);
  
  let thoughtProcess = ''
  let totalTokens = 0

  if (config.enableThinking && context.mode !== GenerationMode.TEST_DATA_GEN) {
    try {
        logger.info('Starting Thinking Process...')
        const thinkingResult = await runThinkingStep(config, context)
        thoughtProcess = thinkingResult.content
        totalTokens += thinkingResult.tokens
        logger.info('Thinking Complete.')
    } catch (e) {
        logger.error('Thinking Model Failed, falling back to direct generation', e)
    }
  }

  // Use Loader to get isolated generation prompt
  const { systemPrompt, userPrompt, temperature } = promptLoader.getPrompt(context);

  const client = createAiClient(config, false)
  const model = getModelName(config, false)

  let finalUserPrompt = userPrompt;
  
  // Do NOT include thought process for CLONE mode
  // The thought process often contains sample analysis like "n=3 output ABC",
  // which confuses the LLM into thinking "3" is the input description.
  // For CLONE mode, we want pure extraction from the user input.
  if (thoughtProcess && context.mode !== GenerationMode.CLONE) {
      finalUserPrompt += `\n\nRefer to the following design analysis when generating the problems:\n${thoughtProcess}`
  }

  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: finalUserPrompt },
      ],
      temperature: temperature,
      response_format: { type: 'json_object' }, 
    });

    totalTokens += response.usage?.total_tokens || 0

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No content received from AI');
    }

    let parsed: any;
    try {
      parsed = safeJsonParse(content);
    } catch (e: any) {
      logger.error('JSON Parse Failed', { error: e.message });
      throw new Error(`Invalid JSON format from AI: ${e.message}`);
    }

    // Special handling for Test Data Gen
    if (context.mode === GenerationMode.TEST_DATA_GEN) {
        let testCases = [];
        if (parsed.test_cases && Array.isArray(parsed.test_cases)) {
            testCases = parsed.test_cases;
        } else if (Array.isArray(parsed)) {
            testCases = parsed;
        }

        return {
            problems: [],
            testCases: testCases,
            thought: thoughtProcess,
            tokensUsed: totalTokens
        }
    }

    let problems: GeneratedProblem[] = [];
    if (Array.isArray(parsed)) {
      problems = parsed;
    } else if (parsed.problems && Array.isArray(parsed.problems)) {
      problems = parsed.problems;
    } else {
      const values = Object.values(parsed);
      for (const val of values) {
        if (Array.isArray(val)) {
            problems = val as GeneratedProblem[];
            break;
        }
      }
    }
    
    if (problems.length === 0) {
        throw new Error('Invalid JSON structure returned by AI');
    }

    // Post-processing to handle potential field naming mismatches if LLM hallucinates
    const normalizedProblems = problems.map(p => ({
        ...p,
        input: p.input || (p as any).input_description || 'No input description',
        output: p.output || (p as any).output_description || 'No output description',
        time_limit: p.time_limit || 1000,
        memory_limit: p.memory_limit || 128
    }));

    return {
        problems: normalizedProblems,
        thought: thoughtProcess,
        tokensUsed: totalTokens
    };

  } catch (error) {
    logger.error('AI Generation Error', error);
    throw error;
  }
}
