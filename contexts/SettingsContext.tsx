'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { settingsApi } from '@/lib/api/settings'
import { defaultSettings, type SystemSettings } from '@/lib/settings-defaults'

interface SettingsContextType {
  settings: SystemSettings
  /** 空库待创建首个管理员（与 register API 首用户例外对齐） */
  needsBootstrap: boolean
  loading: boolean
  refreshSettings: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>({
    ...defaultSettings,
    // 与公开 API fail-closed 对齐：加载完成前默认关闭注册，避免闪现错误入口
    allowRegistration: false,
    judge: { ...defaultSettings.judge },
  })
  const [needsBootstrap, setNeedsBootstrap] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchSettings = useCallback(async () => {
    try {
      const settingsData = await settingsApi.getPublicSettings()
      const merged: SystemSettings = {
        ...defaultSettings,
        ...settingsData,
        // 公开接口未返回的字段保持默认；注册开关必须以 API 为准
        allowRegistration: settingsData.allowRegistration === true,
        judge: { ...defaultSettings.judge },
      }
      // 防御：若 API 返回空字符串（绕过后端校验的脏数据），回退到默认品牌信息
      merged.siteName = (merged.siteName && merged.siteName.trim()) || defaultSettings.siteName
      merged.siteDescription =
        (merged.siteDescription && merged.siteDescription.trim()) || defaultSettings.siteDescription
      setSettings(merged)
      setNeedsBootstrap(settingsData.needsBootstrap === true)
    } catch {
      // fail-closed：保持关闭注册
      setSettings((prev) => ({ ...prev, allowRegistration: false }))
      setNeedsBootstrap(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useDeferredEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  // 切回标签页时刷新，避免管理员关闭注册后本页仍显示入口
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchSettings()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchSettings])

  const value = useMemo(
    () => ({
      settings,
      needsBootstrap,
      loading,
      refreshSettings: fetchSettings,
    }),
    [settings, needsBootstrap, loading, fetchSettings],
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
