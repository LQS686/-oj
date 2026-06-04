import { NextResponse } from 'next/server'
import { listProviders } from '@/lib/ai/providers'

/**
 * GET /api/ai/providers-presets
 *
 * 公共端点（无需鉴权），返回 AI 服务商预设清单。
 * 用于前端「添加服务商」下拉预设选择。
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: listProviders()
  })
}
