import type { UserData } from '@/lib/api/auth'

/** 通知偏好 */
export interface NotificationPreferences {
  submissionComplete: boolean
  contestReminder: boolean
  systemAnnouncement: boolean
}

/** 用户偏好（与 /api/users/preferences 白名单对齐） */
export interface Preferences {
  notifications: NotificationPreferences
  /** 做题页默认语言：cpp / c / python */
  defaultCodeLanguage: string
}

/** 表单数据：资料 + 密码修改 */
export interface SettingsFormData {
  nickname: string
  bio: string
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

/** 邮箱更换流程状态 */
export interface EmailChangeState {
  newEmail: string
  currentPassword: string
  loading: boolean
}

/** 各密码输入框的显隐状态 */
export interface ShowPasswordsState {
  current: boolean
  new: boolean
  confirm: boolean
  emailPassword: boolean
}

/** 顶部消息提示 */
export interface SettingsMessage {
  type: 'success' | 'error'
  text: string
}

/** 用于本地存储与上下文同步的用户信息 */
export type SettingsUser = UserData
