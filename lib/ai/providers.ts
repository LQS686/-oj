/**
 * AI 服务商字典（国产主流 + 国外主流）
 *
 * 字段说明：
 *  - slug:      服务商唯一标识（对应 AiProvider.slug）
 *  - name:      显示名称
 *  - baseUrl:   OpenAI 兼容 API 入口
 *  - anthropicBaseUrl: 可选，Anthropic 兼容 API 入口
 *  - apiFormat: 'openai' | 'anthropic' | 'both'
 *  - supportsListModels: 是否提供 GET /v1/models 用于自动发现
 *  - defaultModels: 预设模型清单（用户可手动添加或在自动发现后挑选）
 *
 * ⚠️ DeepSeek v4 注意：
 *  - deepseek-v4-flash 与 deepseek-v4-pro 是新模型 ID
 *  - 旧 ID deepseek-chat / deepseek-reasoner 将于 2026/07/24 弃用
 *  - 思考模式通过 thinking: { type: "enabled" } 与 reasoning_effort: "high" 控制
 */

export type ModelType = 'generation' | 'thinking'
export type ApiFormat = 'openai' | 'anthropic' | 'both'

export interface ProviderModelMeta {
  name: string
  model: string
  type: ModelType
  description?: string
  /** DeepSeek v4 系列支持 thinking 参数控制思考模式 */
  supportsThinkingParam?: boolean
  /** 是否已弃用（前端展示警告） */
  deprecated?: boolean
  /** 推荐参数（写入 model.params 字段） */
  recommendedParams?: Record<string, any>
}

export interface ProviderMeta {
  slug: string
  name: string
  baseUrl: string
  anthropicBaseUrl?: string
  apiFormat: ApiFormat
  supportsListModels: boolean
  defaultModels: ProviderModelMeta[]
}

export const PROVIDERS: Record<string, ProviderMeta> = {
  // ============== 国外主流 ==============
  openai: {
    slug: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiFormat: 'openai',
    supportsListModels: true,
    defaultModels: [
      { name: 'GPT-4o', model: 'gpt-4o', type: 'generation' },
      { name: 'GPT-4o Mini', model: 'gpt-4o-mini', type: 'generation' },
      { name: 'o1 Preview', model: 'o1-preview', type: 'thinking' },
      { name: 'o1 Mini', model: 'o1-mini', type: 'thinking' }
    ]
  },
  anthropic: {
    slug: 'anthropic',
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com',
    anthropicBaseUrl: 'https://api.anthropic.com',
    apiFormat: 'anthropic',
    supportsListModels: false,
    defaultModels: [
      { name: 'Claude Sonnet 4.5', model: 'claude-sonnet-4-5', type: 'generation' },
      { name: 'Claude Haiku 4.5', model: 'claude-haiku-4-5', type: 'generation' },
      { name: 'Claude Opus 4', model: 'claude-opus-4', type: 'generation' }
    ]
  },

  // ============== 国产主流 ==============
  deepseek: {
    slug: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    anthropicBaseUrl: 'https://api.deepseek.com/anthropic',
    apiFormat: 'both',
    supportsListModels: true,
    defaultModels: [
      // v4 系列（新）— 支持 thinking: { type: "enabled" } + reasoning_effort
      { name: 'DeepSeek V4 Flash (高性价比)', model: 'deepseek-v4-flash', type: 'generation', supportsThinkingParam: true },
      { name: 'DeepSeek V4 Pro (高质量)',     model: 'deepseek-v4-pro',   type: 'generation', supportsThinkingParam: true }
      // 旧 ID 兼容别名（deepseek-chat / deepseek-reasoner）已于 2026/07/24 弃用，已从字典中完全移除
    ]
  },
  dashscope: {
    slug: 'dashscope',
    name: '通义千问 (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiFormat: 'openai',
    supportsListModels: false,
    defaultModels: [
      { name: '通义千问 Turbo',   model: 'qwen-turbo',   type: 'generation' },
      { name: '通义千问 Plus',    model: 'qwen-plus',    type: 'generation' },
      { name: '通义千问 Max',     model: 'qwen-max',     type: 'generation' },
      { name: '通义千问 Long',    model: 'qwen-long',    type: 'generation' },
      { name: 'QwQ 推理增强',     model: 'qwq-plus',     type: 'thinking' }
    ]
  },
  zhipu: {
    slug: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiFormat: 'openai',
    supportsListModels: false,
    defaultModels: [
      { name: 'GLM-4 Flash',     model: 'glm-4-flash',     type: 'generation' },
      { name: 'GLM-4 Air',       model: 'glm-4-air',       type: 'generation' },
      { name: 'GLM-4 Plus',      model: 'glm-4-plus',      type: 'generation' },
      { name: 'GLM-Zero Preview', model: 'glm-zero-preview', type: 'thinking' }
    ]
  },
  moonshot: {
    slug: 'moonshot',
    name: '月之暗面 Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiFormat: 'openai',
    supportsListModels: true,
    defaultModels: [
      { name: 'Moonshot V1 8k',   model: 'moonshot-v1-8k',   type: 'generation' },
      { name: 'Moonshot V1 32k',  model: 'moonshot-v1-32k',  type: 'generation' },
      { name: 'Moonshot V1 128k', model: 'moonshot-v1-128k', type: 'generation' },
      { name: 'Kimi K2 0711 Preview', model: 'kimi-k2-0711-preview', type: 'generation' }
    ]
  },
  baichuan: {
    slug: 'baichuan',
    name: '百川',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    apiFormat: 'openai',
    supportsListModels: false,
    defaultModels: [
      { name: '百川 2 Turbo', model: 'baichuan2-turbo', type: 'generation' },
      { name: '百川 3 Turbo', model: 'baichuan3-turbo', type: 'generation' },
      { name: '百川 4',       model: 'baichuan4',       type: 'generation' }
    ]
  },
  yi: {
    slug: 'yi',
    name: '零一万物 Yi',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    apiFormat: 'openai',
    supportsListModels: false,
    defaultModels: [
      { name: 'Yi Large',  model: 'yi-large',  type: 'generation' },
      { name: 'Yi Medium', model: 'yi-medium', type: 'generation' },
      { name: 'Yi Vision', model: 'yi-vision', type: 'generation' }
    ]
  },
  stepfun: {
    slug: 'stepfun',
    name: 'StepFun 阶跃星辰',
    baseUrl: 'https://api.stepfun.com/v1',
    apiFormat: 'openai',
    supportsListModels: false,
    defaultModels: [
      { name: 'Step-1 8k',   model: 'step-1-8k',   type: 'generation' },
      { name: 'Step-1 32k',  model: 'step-1-32k',  type: 'generation' },
      { name: 'Step-1V 8k',  model: 'step-1v-8k',  type: 'generation' }
    ]
  }
}

export function getProviderMeta(slug: string): ProviderMeta | undefined {
  return PROVIDERS[slug]
}

/** 返回所有已知服务商，前端用于「添加服务商」下拉预设 */
export function listProviders(): ProviderMeta[] {
  return Object.values(PROVIDERS)
}

/**
 * 根据 provider slug 与协议类型选择 baseUrl
 * @param slug 服务商 slug
 * @param format 'openai' | 'anthropic'，默认 openai
 * @param fallback 自定义 baseUrl（DB 中保存的优先）
 */
export function resolveBaseUrl(
  slug: string,
  format: 'openai' | 'anthropic' = 'openai',
  fallback?: string | null
): string {
  if (fallback) return fallback
  const meta = PROVIDERS[slug]
  if (!meta) return ''
  if (format === 'anthropic' && meta.anthropicBaseUrl) return meta.anthropicBaseUrl
  return meta.baseUrl
}

/** 判断模型 ID 是否属于 thinking 类型 */
export function inferModelType(modelId: string): ModelType {
  const lower = modelId.toLowerCase()
  if (lower.includes('reasoner') || lower.includes('r1') || lower.includes('thinking') || lower.includes('reasoning')) {
    return 'thinking'
  }
  return 'generation'
}

/**
 * SSRF 防护：校验 AI 服务商 baseUrl 不指向内网/元数据端点。
 * 阻止管理员误配或恶意配置导致服务端请求伪造（SSRF）。
 *
 * 注意：此函数为同步校验，拦截字符串形式的内网地址和非标准 IP 编码。
 * 对于 DNS Rebinding 攻击（域名解析到内网），请额外调用 validateAiBaseUrlDns（位于 ./providers-dns）。
 */
export function validateAiBaseUrl(baseUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new Error('baseUrl 格式无效')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`不允许的协议: ${parsed.protocol}（仅允许 http/https）`)
  }

  const host = parsed.hostname.toLowerCase()

  // 禁止 localhost 主机名
  if (host === 'localhost') {
    throw new Error('baseUrl 不允许指向 localhost')
  }

  // 拒绝非标准 IP 编码（十进制/十六进制/八进制），防止绕过 IPv4 检查
  // 例如：2130706433(=127.0.0.1)、0x7f000001(=127.0.0.1)、0177.0.0.1(=127.0.0.1)
  if (/^\d+$/.test(host) && !host.includes('.')) {
    throw new Error(`baseUrl 不允许使用十进制 IP 编码: ${host}`)
  }
  if (host.startsWith('0x') || host.includes('0x')) {
    throw new Error(`baseUrl 不允许使用十六进制 IP 编码: ${host}`)
  }

  // IPv4 检查
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number)
    if (octets.some((o) => o > 255)) {
      throw new Error(`无效的 IPv4 地址: ${host}`)
    }
    // 拒绝八进制编码：以 0 开头且长度 > 1 的八位组（如 0177 = 127）
    const octetStrings = ipv4Match.slice(1)
    if (octetStrings.some((s) => s.length > 1 && s.startsWith('0'))) {
      throw new Error(`baseUrl 不允许使用八进制 IP 编码: ${host}`)
    }
    const [a, b] = octets
    if (
      a === 0 ||                          // 0.0.0.0/8
      a === 10 ||                         // 10.0.0.0/8
      a === 127 ||                        // 127.0.0.0/8 (loopback)
      (a === 169 && b === 254) ||         // 169.254.0.0/16 (link-local / cloud metadata)
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) ||         // 192.168.0.0/16
      (a === 100 && b >= 64 && b <= 127)  // 100.64.0.0/10 (CGNAT)
    ) {
      throw new Error(`baseUrl 不允许指向内网/保留地址: ${host}`)
    }
  }

  // IPv6 检查
  if (host === '::1' || host === '::' || host === '[::1]' || host === '[::]') {
    throw new Error(`baseUrl 不允许指向内网地址: ${host}`)
  }
  if (host.startsWith('fe80') || host.startsWith('fc') || host.startsWith('fd')) {
    throw new Error(`baseUrl 不允许指向内网地址: ${host}`)
  }
}


