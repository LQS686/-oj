import { User, Lock, Bell, Globe } from 'lucide-react'
import type { SettingsUser } from './_types'

/** 设置页左侧 Tab 定义 */
export const SETTINGS_TABS = [
  { id: 'profile', label: '个人资料', icon: User, desc: '管理您的个人信息' },
  { id: 'account', label: '账号安全', icon: Lock, desc: '密码与安全设置' },
  { id: 'notifications', label: '通知设置', icon: Bell, desc: '通知偏好管理' },
  { id: 'preferences', label: '偏好设置', icon: Globe, desc: '自定义您的体验' },
] as const

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id']

/** 通知项配置：key 与 Preferences.notifications 字段对应 */
export const NOTIFICATION_ITEMS = [
  { key: 'submissionComplete' as const, label: '提交评测完成', desc: '当代码评测完成时通知我' },
  { key: 'contestReminder' as const, label: '竞赛提醒', desc: '竞赛开始前提醒我' },
  { key: 'systemAnnouncement' as const, label: '系统公告', desc: '接收平台系统公告' },
]

/** 默认编程语言选项 */
export const LANGUAGE_OPTIONS = ['C++', 'C', 'Java', 'Python', 'JavaScript'] as const

/** 编辑器主题选项 */
export const THEME_OPTIONS = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'high-contrast', label: '高对比度' },
] as const

/** 偏好设置默认值 */
export const DEFAULT_PREFERENCES = {
  notifications: {
    submissionComplete: true,
    contestReminder: false,
    systemAnnouncement: true,
  },
  editor: {
    defaultLanguage: 'C++',
    theme: 'light',
  },
}

/** 邮箱更换流程的初始状态 */
export const INITIAL_EMAIL_CHANGE = {
  newEmail: '',
  currentPassword: '',
  verificationCode: '',
  step: 'input' as const,
  loading: false,
  countdown: 0,
}

/** 邮箱正则：用于校验新邮箱格式 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 将更新后的用户信息同步到 localStorage。
 * 修复 P0：不存 role 到 localStorage，防止 XSS 窃取越权。
 */
export function persistUserToStorage(user: SettingsUser | null) {
  if (!user) return
  localStorage.setItem(
    'user',
    JSON.stringify({
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
    })
  )
}
