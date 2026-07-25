'use client'

import { motion } from 'framer-motion'
import { Bell, Code2, SlidersHorizontal } from 'lucide-react'
import type { NotificationPreferences, Preferences } from '../_types'
import { CODE_LANGUAGE_OPTIONS, NOTIFICATION_ITEMS } from '../_utils'

interface PreferencesSectionProps {
  preferences: Preferences
  loading: boolean
  onNotificationChange: (key: keyof NotificationPreferences, value: boolean) => void
  onDefaultCodeLanguageChange: (value: string) => void
  onSave: () => void
}

/** 偏好：做题默认语言 + 通知开关（合并原通知 Tab） */
export function PreferencesSection({
  preferences,
  loading,
  onNotificationChange,
  onDefaultCodeLanguageChange,
  onSave,
}: PreferencesSectionProps) {
  return (
    <motion.div
      key="preferences"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className="max-w-xl space-y-8"
    >
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-primary-light" />
        <h2 className="text-base font-semibold text-foreground">偏好设置</h2>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Code2 className="w-4 h-4 text-primary-light" />
          做题偏好
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">默认编程语言</label>
          <select
            className="input cursor-pointer max-w-xs"
            value={preferences.defaultCodeLanguage}
            onChange={(e) => onDefaultCodeLanguageChange(e.target.value)}
          >
            {CODE_LANGUAGE_OPTIONS.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            打开题目时若无本地草稿语言记录，将使用此默认值（C / C++ / Python）。
          </p>
        </div>
      </section>

      <section className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
          <Bell className="w-4 h-4 text-primary-light" />
          站内通知
        </div>
        {NOTIFICATION_ITEMS.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-4 py-3.5 border-b border-border/60 last:border-0"
          >
            <div className="min-w-0">
              <div className="font-medium text-foreground text-sm">{item.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={preferences.notifications[item.key]}
                onChange={(e) => onNotificationChange(item.key, e.target.checked)}
              />
              <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
            </label>
          </div>
        ))}
      </section>

      <div className="flex justify-end pt-1">
        <button onClick={onSave} disabled={loading} className="btn btn-primary min-w-[120px]">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              保存中…
            </span>
          ) : (
            '保存偏好'
          )}
        </button>
      </div>
    </motion.div>
  )
}
