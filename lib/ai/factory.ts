import { OpenAI } from 'openai'
import { AiConfig } from './config'

export function createAiClient(config: AiConfig, isThinking = false) {
  const apiKey = isThinking ? (config.thinkingApiKey || config.apiKey) : config.apiKey
  const baseURL = isThinking ? (config.thinkingBaseUrl || config.baseUrl) : config.baseUrl
  
  // Default Base URLs if not provided
  let finalBaseUrl = baseURL
  if (!finalBaseUrl) {
    const provider = isThinking ? (config.thinkingProvider || config.provider) : config.provider
    switch (provider) {
        case 'openai': finalBaseUrl = 'https://api.openai.com/v1'; break;
        case 'deepseek': finalBaseUrl = 'https://api.deepseek.com'; break; // DeepSeek often uses root or /v1
        case 'moonshot': finalBaseUrl = 'https://api.moonshot.cn/v1'; break;
        case 'aliyun': finalBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'; break;
        // Add more defaults
    }
  }

  if (!apiKey) {
    throw new Error(`${isThinking ? 'Thinking' : 'Generation'} Model API Key is missing`)
  }

  return new OpenAI({
    apiKey: apiKey,
    baseURL: finalBaseUrl,
    dangerouslyAllowBrowser: false
  })
}

export function getModelName(config: AiConfig, isThinking = false) {
    return isThinking ? (config.thinkingModel || 'o1-preview') : config.model
}
