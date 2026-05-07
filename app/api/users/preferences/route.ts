import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { getMongoClient } from '@/lib/mongodb-direct'

const ALLOWED_PREFERENCE_KEYS = [
  'theme',
  'language',
  'fontSize',
  'editorTheme',
  'autoSave',
  'tabSize',
  'keyboardShortcuts',
  'notifications',
  'preferredLanguage',
  'defaultTab'
]

const ALLOWED_THEMES = ['light', 'dark', 'system']
const ALLOWED_LANGUAGES = ['zh-CN', 'en-US']
const ALLOWED_FONT_SIZES = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24]
const ALLOWED_EDITOR_THEMES = ['vs-dark', 'vs-light', 'hc-black']
const ALLOWED_TAB_SIZES = [2, 4, 8]

function validatePreferenceValue(key: string, value: any): boolean {
  switch (key) {
    case 'theme':
      return typeof value === 'string' && ALLOWED_THEMES.includes(value)
    case 'language':
    case 'preferredLanguage':
      return typeof value === 'string' && ALLOWED_LANGUAGES.includes(value)
    case 'fontSize':
      return typeof value === 'number' && ALLOWED_FONT_SIZES.includes(value)
    case 'editorTheme':
      return typeof value === 'string' && ALLOWED_EDITOR_THEMES.includes(value)
    case 'autoSave':
      return typeof value === 'boolean'
    case 'tabSize':
      return typeof value === 'number' && ALLOWED_TAB_SIZES.includes(value)
    case 'keyboardShortcuts':
      return typeof value === 'object' && value !== null
    case 'notifications':
      return typeof value === 'object' && value !== null
    case 'defaultTab':
      return typeof value === 'string' && value.length <= 50
    default:
      return false
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const client = await getMongoClient()
    const db = client.db()
    const doc = await db.collection('UserPreferences').findOne({ userId: user.userId })

    return NextResponse.json({
      success: true,
      data: doc?.preferences || {}
    })
  } catch (error: any) {
    console.error('获取偏好设置失败:', error)
    return NextResponse.json(
      { success: false, error: '获取偏好设置失败' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: '请先登录' },
        { status: 401 }
      )
    }

    const body = await request.json()

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: '无效的偏好设置数据' },
        { status: 400 }
      )
    }

    const client = await getMongoClient()
    const db = client.db()
    const existing = await db.collection('UserPreferences').findOne({ userId: user.userId })

    const existingPrefs: Record<string, any> = (existing?.preferences as Record<string, any>) || {}
    const updatedPrefs: Record<string, any> = { ...existingPrefs }

    for (const key of Object.keys(body)) {
      if (!ALLOWED_PREFERENCE_KEYS.includes(key)) {
        continue
      }
      if (!validatePreferenceValue(key, body[key])) {
        return NextResponse.json(
          { success: false, error: `无效的偏好设置值: ${key}` },
          { status: 400 }
        )
      }
      updatedPrefs[key] = body[key]
    }

    await db.collection('UserPreferences').updateOne(
      { userId: user.userId },
      { $set: { preferences: updatedPrefs, updatedAt: new Date() } },
      { upsert: true }
    )

    return NextResponse.json({
      success: true,
      data: updatedPrefs,
      message: '偏好设置更新成功'
    })
  } catch (error: any) {
    console.error('更新偏好设置失败:', error)
    return NextResponse.json(
      { success: false, error: '更新偏好设置失败' },
      { status: 500 }
    )
  }
}
