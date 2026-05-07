import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const SETTINGS_KEY = 'system_settings'

const defaultSettings = {
  siteName: 'OJ Platform',
  siteDescription: '在线评测系统',
  allowRegistration: true,
  allowGuestSubmission: false,
  defaultLanguage: 'cpp',
  maxSubmissionSize: 65536,
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpFrom: ''
}

let memorySettings: Record<string, unknown> | null = null

export type SystemSettings = typeof defaultSettings

export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const setting = await prisma.systemConfig.findUnique({
      where: { key: SETTINGS_KEY }
    })
    if (setting && setting.value && typeof setting.value === 'object') {
      return { ...defaultSettings, ...(setting.value as Record<string, unknown>) } as SystemSettings
    }
  } catch (error) {
    logger.error('获取系统设置失败', error)
  }
  
  if (memorySettings) {
    return { ...defaultSettings, ...memorySettings } as SystemSettings
  }
  
  return defaultSettings
}

export function getSystemSettingsSync(): SystemSettings {
  if (memorySettings) {
    return { ...defaultSettings, ...memorySettings } as SystemSettings
  }
  return defaultSettings
}

export async function saveSystemSettings(settings: Partial<SystemSettings>): Promise<boolean> {
  try {
    const currentSettings = await getSystemSettings()
    const newSettings = { ...currentSettings, ...settings }
    
    await prisma.systemConfig.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: newSettings },
      create: { key: SETTINGS_KEY, value: newSettings }
    })
    
    memorySettings = newSettings
    return true
  } catch (error) {
    logger.error('保存系统设置失败', error)
    memorySettings = { ...await getSystemSettings(), ...settings } as Record<string, unknown>
    return true
  }
}

export function setMemorySettings(settings: Record<string, unknown>) {
  memorySettings = settings
}

export { defaultSettings }
