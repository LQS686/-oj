import { NextResponse } from 'next/server'
import { getSystemSettings } from '@/lib/settings'

export async function GET() {
  try {
    const settings = await getSystemSettings()
    
    return NextResponse.json({
      success: true,
      data: {
        siteName: settings.siteName,
        siteDescription: settings.siteDescription,
        allowRegistration: settings.allowRegistration,
        defaultLanguage: settings.defaultLanguage
      }
    })
  } catch (error) {
    return NextResponse.json({
      success: true,
      data: {
        siteName: 'OJ Platform',
        siteDescription: '在线评测系统',
        allowRegistration: true,
        defaultLanguage: 'cpp'
      }
    })
  }
}
