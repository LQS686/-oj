import { User, Lock, SlidersHorizontal } from 'lucide-react'
import type { Preferences, SettingsUser } from './_types'

/** 设置页左侧 Tab：资料 / 安全 / 偏好（通知+做题） */
export const SETTINGS_TABS = [
  { id: 'profile', label: '个人资料', icon: User, desc: '头像、昵称与简介' },
  { id: 'account', label: '账号安全', icon: Lock, desc: '邮箱与密码' },
  { id: 'preferences', label: '偏好设置', icon: SlidersHorizontal, desc: '通知与做题偏好' },
] as const

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id']

export function isSettingsTabId(value: string | null): value is SettingsTabId {
  return value === 'profile' || value === 'account' || value === 'preferences'
}

/** 通知项配置 */
export const NOTIFICATION_ITEMS = [
  { key: 'submissionComplete' as const, label: '提交评测完成', desc: '代码评测完成时发送站内通知' },
  { key: 'contestReminder' as const, label: '竞赛提醒', desc: '竞赛开始前发送提醒' },
  { key: 'systemAnnouncement' as const, label: '系统公告', desc: '首页收到新公告时的实时提示' },
]

/** 做题默认语言（与评测机一致） */
export const CODE_LANGUAGE_OPTIONS = [
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'python', label: 'Python' },
] as const

export type CodeLanguageValue = (typeof CODE_LANGUAGE_OPTIONS)[number]['value']

export const DEFAULT_PREFERENCES: Preferences = {
  notifications: {
    submissionComplete: true,
    contestReminder: false,
    systemAnnouncement: true,
  },
  defaultCodeLanguage: 'cpp',
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

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isCodeLanguage(value: unknown): value is CodeLanguageValue {
  return (
    typeof value === 'string' &&
    CODE_LANGUAGE_OPTIONS.some((o) => o.value === value)
  )
}

/** 将 API 偏好归一为当前 Preferences（仅接受 cpp / c / python） */
export function normalizePreferences(raw: Record<string, unknown> | null | undefined): Preferences {
  const base = structuredClone(DEFAULT_PREFERENCES)
  if (!raw || typeof raw !== 'object') return base

  const notifications = raw.notifications
  if (notifications && typeof notifications === 'object') {
    const n = notifications as Record<string, unknown>
    if (typeof n.submissionComplete === 'boolean') {
      base.notifications.submissionComplete = n.submissionComplete
    }
    if (typeof n.contestReminder === 'boolean') {
      base.notifications.contestReminder = n.contestReminder
    }
    if (typeof n.systemAnnouncement === 'boolean') {
      base.notifications.systemAnnouncement = n.systemAnnouncement
    }
  }

  if (isCodeLanguage(raw.defaultCodeLanguage)) {
    base.defaultCodeLanguage = raw.defaultCodeLanguage
  }

  return base
}

/**
 * 将更新后的用户信息同步到 localStorage。
 * 不存 role，防止 XSS 窃取越权。
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
