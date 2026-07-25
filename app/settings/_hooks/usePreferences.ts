'use client'

import { useState, useEffect } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import type { Preferences, NotificationPreferences } from '../_types'
import { DEFAULT_PREFERENCES, normalizePreferences } from '../_utils'

const DEFAULT_LANG_STORAGE_KEY = 'dsoj_default_code_language'

function persistDefaultCodeLanguage(lang: string) {
  try {
    localStorage.setItem(DEFAULT_LANG_STORAGE_KEY, lang)
  } catch {
    // ignore quota / private mode
  }
}

interface UsePreferencesOptions {
  enabled: boolean
  showMessage: (type: 'success' | 'error', text: string) => void
}

/**
 * 用户偏好：通知开关 + 默认做题语言（与 API 白名单对齐）
 */
export function usePreferences({ enabled, showMessage }: UsePreferencesOptions) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const fetchPreferences = async () => {
      try {
        const response = await fetchWithCookie('/api/users/preferences')
        const data = await response.json()
        if (data.success && data.data) {
          const next = normalizePreferences(data.data)
          setPreferences(next)
          persistDefaultCodeLanguage(next.defaultCodeLanguage)
        }
      } catch (error) {
        console.error('获取偏好设置失败:', error)
      }
    }
    void fetchPreferences()
  }, [enabled])

  const updateNotification = (key: keyof NotificationPreferences, value: boolean) => {
    setPreferences((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }))
  }

  const updateDefaultCodeLanguage = (value: string) => {
    setPreferences((prev) => ({ ...prev, defaultCodeLanguage: value }))
  }

  const save = async () => {
    setLoading(true)
    try {
      const response = await fetchWithCookie('/api/users/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notifications: preferences.notifications,
          defaultCodeLanguage: preferences.defaultCodeLanguage,
        }),
      })
      const data = await response.json()
      if (data.success) {
        const next = data.data
          ? normalizePreferences(data.data)
          : preferences
        setPreferences(next)
        persistDefaultCodeLanguage(next.defaultCodeLanguage)
        showMessage('success', '偏好已保存')
      } else {
        showMessage('error', data.error || '保存失败')
      }
    } catch {
      showMessage('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  return {
    preferences,
    loading,
    updateNotification,
    updateDefaultCodeLanguage,
    save,
  }
}
