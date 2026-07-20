'use client'

import { useState, useEffect } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import type { Preferences, NotificationPreferences, EditorPreferences } from '../_types'
import { DEFAULT_PREFERENCES } from '../_utils'

interface UsePreferencesOptions {
  /** 触发偏好加载的依赖（通常为已登录用户） */
  enabled: boolean
  /** 消息提示回调 */
  showMessage: (type: 'success' | 'error', text: string) => void
}

/**
 * 用户偏好设置 hook：负责加载、修改、保存通知与编辑器偏好。
 */
export function usePreferences({ enabled, showMessage }: UsePreferencesOptions) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [loading, setLoading] = useState(false)

  // 拉取偏好
  useEffect(() => {
    if (!enabled) return
    const fetchPreferences = async () => {
      try {
        const response = await fetchWithCookie('/api/users/preferences')
        const data = await response.json()
        if (data.success && data.data) {
          setPreferences(prev => ({
            notifications: { ...prev.notifications, ...data.data.notifications },
            editor: { ...prev.editor, ...data.data.editor },
          }))
        }
      } catch (error) {
        console.error('获取偏好设置失败:', error)
      }
    }
    fetchPreferences()
  }, [enabled])

  const updateNotification = (key: keyof NotificationPreferences, value: boolean) => {
    setPreferences(prev => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }))
  }

  const updateEditor = (key: keyof EditorPreferences, value: string) => {
    setPreferences(prev => ({
      ...prev,
      editor: { ...prev.editor, [key]: value },
    }))
  }

  const save = async () => {
    setLoading(true)
    try {
      const response = await fetchWithCookie('/api/users/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      })
      const data = await response.json()
      if (data.success) {
        showMessage('success', '偏好设置保存成功')
      } else {
        showMessage('error', data.error || '保存失败')
      }
    } catch (error) {
      showMessage('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  return { preferences, loading, updateNotification, updateEditor, save }
}
