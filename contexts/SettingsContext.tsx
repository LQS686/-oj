'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { settingsApi } from '@/lib/api/settings'
import { defaultSettings, type SystemSettings } from '@/lib/settings-defaults'
import type { PublicSettings } from '@/lib/settings'

interface SettingsContextType {
  settings: SystemSettings
  /** 空库待创建首个管理员（与 register API 首用户例外对齐） */
  needsBootstrap: boolean
  loading: boolean
  refreshSettings: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

/** 把接口/首屏注入的公开设置合并进完整设置对象（缺省字段回退默认值） */
function mergePublicSettings(
  prev: SystemSettings,
  data: Partial<PublicSettings>
): { settings: SystemSettings; needsBootstrap: boolean } {
  const merged: SystemSettings = {
    ...defaultSettings,
    ...data,
    // 公开接口未返回的字段保持默认；注册开关必须以接口为准
    allowRegistration: data.allowRegistration === true,
    judge: { ...defaultSettings.judge },
  }
  // 防御：若 API 返回空字符串（绕过后端校验的脏数据），回退到默认品牌信息
  merged.siteName = (merged.siteName && merged.siteName.trim()) || defaultSettings.siteName
  merged.siteDescription =
    (merged.siteDescription && merged.siteDescription.trim()) || defaultSettings.siteDescription
  // 保留调用方已有的判题配置（公开接口不下发 judge 细节）
  merged.judge = prev.judge
  return { settings: merged, needsBootstrap: data.needsBootstrap === true }
}

export function SettingsProvider({
  children,
  /** SSR 注入的公开设置：有值时首屏即为正确品牌/注册开关，无需再发一次请求 */
  initialSettings,
}: {
  children: ReactNode
  initialSettings?: PublicSettings
}) {
  const [settings, setSettings] = useState<SystemSettings>(() =>
    initialSettings
      ? mergePublicSettings(defaultSettings, initialSettings).settings
      : {
          ...defaultSettings,
          // 与公开 API fail-closed 对齐：加载完成前默认关闭注册，避免闪现错误入口
          allowRegistration: false,
          judge: { ...defaultSettings.judge },
        }
  )
  const [needsBootstrap, setNeedsBootstrap] = useState(initialSettings?.needsBootstrap === true)
  const [loading, setLoading] = useState(!initialSettings)

  const fetchSettings = useCallback(async () => {
    try {
      const settingsData = await settingsApi.getPublicSettings()
      setSettings((prev) => mergePublicSettings(prev, settingsData).settings)
      setNeedsBootstrap(settingsData.needsBootstrap === true)
    } catch {
      // fail-closed：保持关闭注册
      setSettings((prev) => ({ ...prev, allowRegistration: false }))
      setNeedsBootstrap(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // 首个渲染已由 SSR 注入正确值时不再补发请求；未注入时（如独立使用 Provider）保持原行为
  useDeferredEffect(() => {
    if (initialSettings) return
    void fetchSettings()
  }, [fetchSettings, initialSettings])

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
    [settings, needsBootstrap, loading, fetchSettings]
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
