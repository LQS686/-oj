import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'
import { decrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { getProviderMeta, resolveBaseUrl, inferModelType } from '@/lib/ai/providers'

/**
 * GET /api/admin/ai/providers/[id]/discover-models
 *
 * 调用服务商的 GET /v1/models 列出可用模型。
 * 兼容 OpenAI 标准响应格式：{ data: [{ id: string, owned_by?: string }, ...] }
 *
 * 返回模型结构：
 *  - model: API 模型 ID
 *  - name: 显示名（默认与 model 相同）
 *  - type: 'generation' | 'thinking'（根据 ID 关键字推断）
 *  - supportsThinkingParam: 是否支持 DeepSeek v4 风格 thinking 参数
 *  - deprecated: 是否已弃用（前端展示警告）
 *  - description: 来自 owned_by 或其他元信息
 *
 * 错误码：
 *  - MISSING_API_KEY   400  服务商未配置 apiKey
 *  - INVALID_API_KEY   400  服务商返回 401
 *  - NOT_SUPPORTED     200  success=true, data=[], reason=NOT_SUPPORTED
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getUserFromRequest(request)
    if (!user || !user.isAdmin) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' }
      }, { status: 403 })
    }

    const { id } = await params

    const provider = await prisma.aiProvider.findUnique({ where: { id } })
    if (!provider) {
      return NextResponse.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Provider not found' }
      }, { status: 404 })
    }

    if (!provider.apiKey) {
      return NextResponse.json({
        success: false,
        error: { code: 'MISSING_API_KEY', message: 'Provider has no API Key configured' }
      }, { status: 400 })
    }

    // 解密 API Key — 缺 AI_CONFIG_ENCRYPTION_KEY 时返回 400 友好提示
    let apiKey: string
    try {
      apiKey = decrypt(provider.apiKey)
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.includes('AI_CONFIG_ENCRYPTION_KEY')) {
        logger.warn('[discover-models] 拒绝执行：AI_CONFIG_ENCRYPTION_KEY 未配置', { providerId: id })
        return NextResponse.json({
          success: false,
          error: {
            code: 'MISSING_ENCRYPTION_KEY',
            message: '服务端 AI_CONFIG_ENCRYPTION_KEY 未配置，无法解密 API Key。请先在 .env 中设置 32 字节密钥后重启服务。'
          }
        }, { status: 400 })
      }
      // 其他解密错误 — 视为 500
      throw err
    }

    const meta = getProviderMeta(provider.slug)
    // baseUrl 优先级：DB 字段 > 字典默认
    const baseUrl = provider.baseUrl || resolveBaseUrl(provider.slug, 'openai', null)

    if (!baseUrl) {
      return NextResponse.json({
        success: true,
        data: [],
        reason: 'NOT_SUPPORTED',
        message: '该服务商未配置 baseUrl'
      })
    }

    if (meta && !meta.supportsListModels) {
      // 字典标记为不支持 /v1/models，但仍尝试一次，失败则降级
      logger.info(`[discover-models] provider=${provider.slug} 在字典中标记为不支持自动发现，但仍尝试调用`)
    }

    // 调用服务商的 /v1/models
    const url = `${baseUrl.replace(/\/$/, '')}/models`
    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      })
    } catch (e: any) {
      logger.warn(`[discover-models] fetch failed for ${provider.slug}`, { error: e?.message })
      return NextResponse.json({
        success: true,
        data: [],
        reason: 'NOT_SUPPORTED',
        message: `无法访问 ${url}：${e?.message || '网络错误'}`
      })
    }

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        success: false,
        error: { code: 'INVALID_API_KEY', message: 'API Key 无效或无权限' }
      }, { status: 400 })
    }

    if (!res.ok) {
      return NextResponse.json({
        success: true,
        data: [],
        reason: 'NOT_SUPPORTED',
        message: `服务商返回 ${res.status}`
      })
    }

    let json: any
    try {
      json = await res.json()
    } catch (e: any) {
      return NextResponse.json({
        success: true,
        data: [],
        reason: 'NOT_SUPPORTED',
        message: `响应不是有效 JSON：${e?.message}`
      })
    }

    // 兼容 OpenAI 标准格式：{ data: [...] }
    // 兼容自定义格式：{ models: [...] } 或裸数组
    let rawModels: any[] = []
    if (Array.isArray(json)) {
      rawModels = json
    } else if (Array.isArray(json.data)) {
      rawModels = json.data
    } else if (Array.isArray(json.models)) {
      rawModels = json.models
    } else {
      return NextResponse.json({
        success: true,
        data: [],
        reason: 'NOT_SUPPORTED',
        message: '响应格式不包含 models 数组'
      })
    }

    // 转换为统一结构
    const models = rawModels
      .filter(m => m && (m.id || m.model || m.name))
      .map(m => {
        const id = m.id || m.model || m.name
        return {
          model: id,
          name: m.name || id,
          type: inferModelType(id),
          supportsThinkingParam: provider.slug === 'deepseek' &&
            (id.includes('v4') || id.includes('flash') || id.includes('pro')),
          deprecated: provider.slug === 'deepseek' &&
            (id === 'deepseek-chat' || id === 'deepseek-reasoner'),
          description: m.owned_by || m.description || ''
        }
      })

    // 过滤已添加的 model
    const existing = await prisma.aiModel.findMany({
      where: { providerId: id },
      select: { model: true }
    })
    const existingSet = new Set(existing.map(e => e.model))
    const newModels = models.filter(m => !existingSet.has(m.model))

    return NextResponse.json({
      success: true,
      data: newModels,
      total: models.length,
      filtered: models.length - newModels.length
    })
  } catch (error: any) {
    logger.error('Discover Models Error', { error: error?.message, stack: error?.stack })
    // 不把原始 error.message 直接暴露给前端 — 技术性错误统一为友好中文
    const friendly = '发现模型失败：服务端内部错误，请稍后重试或联系管理员'
    return NextResponse.json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: friendly }
    }, { status: 500 })
  }
}
