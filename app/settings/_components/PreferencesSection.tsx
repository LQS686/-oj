'use client'

import { motion } from 'framer-motion'
import { Globe } from 'lucide-react'
import type { EditorPreferences, Preferences } from '../_types'
import { LANGUAGE_OPTIONS, THEME_OPTIONS } from '../_utils'

interface PreferencesSectionProps {
  preferences: Preferences
  loading: boolean
  onEditorChange: (key: keyof EditorPreferences, value: string) => void
  onSave: () => void
}

/** 偏好设置 Tab：默认编程语言 + 编辑器主题 + 保存按钮 */
export function PreferencesSection({
  preferences,
  loading,
  onEditorChange,
  onSave,
}: PreferencesSectionProps) {
  return (
    <motion.div
      key="preferences"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
        <Globe className="w-5 h-5 text-primary-light" />
        <h2 className="text-xl font-bold text-foreground">偏好设置</h2>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">默认编程语言</label>
          <select
            className="input cursor-pointer"
            value={preferences.editor.defaultLanguage}
            onChange={e => onEditorChange('defaultLanguage', e.target.value)}
          >
            {LANGUAGE_OPTIONS.map(lang => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            代码编辑器主题
          </label>
          <select
            className="input cursor-pointer"
            value={preferences.editor.theme}
            onChange={e => onEditorChange('theme', e.target.value)}
          >
            {THEME_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-4">
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
      </div>
    </motion.div>
  )
}
