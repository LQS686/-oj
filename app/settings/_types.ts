import type { UserData } from '@/lib/api'

/** 通知偏好 */
export interface NotificationPreferences {
  submissionComplete: boolean
  contestReminder: boolean
  systemAnnouncement: boolean
}

/** 编辑器偏好 */
export interface EditorPreferences {
  defaultLanguage: string
  theme: string
}

/** 用户偏好设置（通知 + 编辑器） */
export interface Preferences {
  notifications: NotificationPreferences
  editor: EditorPreferences
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
  verificationCode: string
  step: 'input' | 'verify'
  loading: boolean
  countdown: number
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
