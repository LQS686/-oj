'use client'

import { motion } from 'framer-motion'
import { Mail, Lock, Shield, Eye, EyeOff } from 'lucide-react'
import type { EmailChangeState, SettingsFormData, SettingsUser, ShowPasswordsState } from '../_types'

interface AccountSectionProps {
  user: SettingsUser | null
  formData: SettingsFormData
  emailChange: EmailChangeState
  showPasswords: ShowPasswordsState
  loading: boolean
  onFormDataChange: (data: SettingsFormData) => void
  onEmailChange: (data: EmailChangeState) => void
  onShowPasswordsChange: (data: ShowPasswordsState) => void
  onSendVerificationCode: () => void
  onConfirmEmailChange: () => void
  onCancelEmailChange: () => void
  onPasswordChange: () => void
}

/** 账号安全 Tab：邮箱更换 + 密码修改 */
export function AccountSection({
  user,
  formData,
  emailChange,
  showPasswords,
  loading,
  onFormDataChange,
  onEmailChange,
  onShowPasswordsChange,
  onSendVerificationCode,
  onConfirmEmailChange,
  onCancelEmailChange,
  onPasswordChange,
}: AccountSectionProps) {
  return (
    <motion.div
      key="account"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
        <Shield className="w-5 h-5 text-primary-light" />
        <h2 className="text-xl font-bold text-foreground">账号安全</h2>
      </div>

      <div className="space-y-8">
        {/* 邮箱地址 */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">邮箱地址</label>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="input pl-12 opacity-60 cursor-not-allowed"
              />
            </div>
          </div>

          {emailChange.step === 'input' ? (
            <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/15">
              <p className="text-sm text-muted-foreground mb-3">更改邮箱需要验证您的身份</p>
              <div className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="新邮箱地址"
                    value={emailChange.newEmail}
                    onChange={e => onEmailChange({ ...emailChange, newEmail: e.target.value })}
                    className="input pl-12"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type={showPasswords.emailPassword ? 'text' : 'password'}
                    placeholder="当前密码"
                    value={emailChange.currentPassword}
                    onChange={e =>
                      onEmailChange({ ...emailChange, currentPassword: e.target.value })
                    }
                    className="input pl-12 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onShowPasswordsChange({ ...showPasswords, emailPassword: !showPasswords.emailPassword })
                    }
                    aria-label={showPasswords.emailPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPasswords.emailPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <div className="pt-2">
                  <button
                    onClick={onSendVerificationCode}
                    disabled={emailChange.loading}
                    className="btn btn-primary min-w-[140px]"
                  >
                    {emailChange.loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        发送中...
                      </span>
                    ) : (
                      '发送验证码'
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-secondary/10 rounded-lg border border-secondary/25">
              <p className="text-sm text-secondary-light mb-3">
                验证码已发送至 <span className="font-medium">{emailChange.newEmail}</span>
              </p>
              <div className="space-y-3">
                <div className="relative">
                  <svg
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <input
                    type="text"
                    placeholder="请输入6位验证码"
                    value={emailChange.verificationCode}
                    onChange={e =>
                      onEmailChange({
                        ...emailChange,
                        verificationCode: e.target.value.replace(/\D/g, '').slice(0, 6),
                      })
                    }
                    className="input pl-12"
                    maxLength={6}
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={onConfirmEmailChange}
                    disabled={emailChange.loading}
                    className="btn btn-primary min-w-[140px]"
                  >
                    {emailChange.loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        确认中...
                      </span>
                    ) : (
                      '确认更改'
                    )}
                  </button>
                  <button
                    onClick={onCancelEmailChange}
                    disabled={emailChange.loading}
                    className="btn btn-outline min-w-[100px]"
                  >
                    取消
                  </button>
                  {emailChange.countdown > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {emailChange.countdown}秒后可重新发送
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 修改密码 */}
        <div className="pt-4 border-t border-border">
          <h3 className="font-semibold text-foreground mb-4">修改密码</h3>
          <div className="space-y-4">
            <PasswordInput
              placeholder="当前密码"
              value={formData.currentPassword}
              visible={showPasswords.current}
              onToggle={() =>
                onShowPasswordsChange({ ...showPasswords, current: !showPasswords.current })
              }
              onChange={v => onFormDataChange({ ...formData, currentPassword: v })}
            />
            <PasswordInput
              placeholder="新密码（至少6位）"
              value={formData.newPassword}
              visible={showPasswords.new}
              onToggle={() => onShowPasswordsChange({ ...showPasswords, new: !showPasswords.new })}
              onChange={v => onFormDataChange({ ...formData, newPassword: v })}
            />
            <PasswordInput
              placeholder="确认新密码"
              value={formData.confirmPassword}
              visible={showPasswords.confirm}
              onToggle={() =>
                onShowPasswordsChange({ ...showPasswords, confirm: !showPasswords.confirm })
              }
              onChange={v => onFormDataChange({ ...formData, confirmPassword: v })}
            />
            <div className="pt-2">
              <button
                onClick={onPasswordChange}
                disabled={loading}
                className="btn btn-primary min-w-[140px]"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    修改中...
                  </span>
                ) : (
                  '修改密码'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

interface PasswordInputProps {
  placeholder: string
  value: string
  visible: boolean
  onToggle: () => void
  onChange: (value: string) => void
}

/** 密码输入框：带显隐切换 */
function PasswordInput({ placeholder, value, visible, onToggle, onChange }: PasswordInputProps) {
  return (
    <div className="relative">
      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
      <input
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input pl-12 pr-12"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? '隐藏密码' : '显示密码'}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  )
}
