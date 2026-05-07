import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { logger } from '@/lib/logger'
import { getSystemSettings, saveSystemSettings, defaultSettings } from '@/lib/settings'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    const settings = await getSystemSettings()
    return NextResponse.json({
      success: true,
      data: settings
    })
  } catch (error) {
    logger.error('获取设置失败', error)
    return NextResponse.json(
      { success: false, error: '获取设置失败' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request)
    if (!auth.isAdmin) {
      return NextResponse.json(
        { success: false, error: auth.error || '需要管理员权限' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const saved = await saveSystemSettings(body)

    if (!saved) {
      return NextResponse.json(
        { success: false, error: '保存设置失败' },
        { status: 500 }
      )
    }

    const newSettings = await getSystemSettings()
    
    return NextResponse.json({
      success: true,
      message: '设置已保存',
      data: newSettings
    })
  } catch (error) {
    logger.error('保存设置失败', error)
    return NextResponse.json(
      { success: false, error: '保存设置失败' },
      { status: 500 }
    )
  }
}
