'use client'

import { motion } from 'framer-motion'
import { Bell } from 'lucide-react'
import type { NotificationPreferences, Preferences } from '../_types'
import { NOTIFICATION_ITEMS } from '../_utils'

interface NotificationsSectionProps {
  preferences: Preferences
  loading: boolean
  onNotificationChange: (key: keyof NotificationPreferences, value: boolean) => void
  onSave: () => void
}

/** 通知设置 Tab：4 个通知开关 + 保存按钮 */
export function NotificationsSection({
  preferences,
  loading,
  onNotificationChange,
  onSave,
}: NotificationsSectionProps) {
  return (
    <motion.div
      key="notifications"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
        <Bell className="w-5 h-5 text-primary-light" />
        <h2 className="text-xl font-bold text-foreground">通知设置</h2>
      </div>

      <div className="space-y-1">
        {NOTIFICATION_ITEMS.map(item => (
          <div
            key={item.key}
            className="flex items-center justify-between py-4 border-b border-border/50 group hover:bg-primary/5 -mx-2 px-2 rounded-lg transition-colors"
          >
            <div>
              <div className="font-medium text-foreground">{item.label}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{item.desc}</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={preferences.notifications[item.key]}
                onChange={e => onNotificationChange(item.key, e.target.checked)}
              />
              <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        ))}
      </div>

      <div className="pt-6">
        <button onClick={onSave} disabled={loading} className="btn btn-primary min-w-[140px]">
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              保存中...
            </span>
          ) : (
            '保存设置'
          )}
        </button>
      </div>
    </motion.div>
  )
}
