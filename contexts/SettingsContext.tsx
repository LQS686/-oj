'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { settingsApi } from '@/lib/api'
import type { SystemSettings } from '@/lib/settings'

const defaultSettings: SystemSettings = {
  siteName: 'OJ Platform',
  siteDescription: '在线评测系统',
  allowRegistration: true,
  allowGuestSubmission: false,
  defaultLanguage: 'cpp',
  maxSubmissionSize: 65536,
  smtpHost: '',
  smtpPort: 465,
  smtpUser: '',
  smtpFrom: '',
  smtpPassword: '',
  smtpSecure: true
}

interface SettingsContextType {
  settings: SystemSettings
  loading: boolean
  refreshSettings: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)

  const fetchSettings = useCallback(async () => {
    try {
      const settingsData = await settingsApi.getPublicSettings()
      setSettings({ ...defaultSettings, ...settingsData })
    } catch (error) {
      console.error('获取系统设置失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const value = useMemo(() => ({
    settings,
    loading,
    refreshSettings: fetchSettings,
  }), [settings, loading, fetchSettings])

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

export { defaultSettings }
