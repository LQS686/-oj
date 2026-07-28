'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { settingsApi } from '@/lib/api/settings'
import { defaultSettings, type SystemSettings } from '@/lib/settings-defaults'

interface SettingsContextType {
  settings: SystemSettings
  loading: boolean
  refreshSettings: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>({
    ...defaultSettings,
    judge: { ...defaultSettings.judge },
  })
  const [loading, setLoading] = useState(true)

  const fetchSettings = useCallback(async () => {
    try {
      const settingsData = await settingsApi.getPublicSettings()
      const merged: SystemSettings = {
        ...defaultSettings,
        ...settingsData,
        judge: { ...defaultSettings.judge },
      }
      // 防御：若 API 返回空字符串（绕过后端校验的脏数据），回退到默认品牌信息
      merged.siteName = (merged.siteName && merged.siteName.trim()) || defaultSettings.siteName
      merged.siteDescription =
        (merged.siteDescription && merged.siteDescription.trim()) || defaultSettings.siteDescription
      setSettings(merged)
    } catch {
      // 使用默认设置
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  const value = useMemo(
    () => ({
      settings,
      loading,
      refreshSettings: fetchSettings,
    }),
    [settings, loading, fetchSettings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
