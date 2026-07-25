'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Mail, Lock, Shield, Eye, EyeOff, ChevronDown } from 'lucide-react'
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

/** 账号安全：邮箱（可展开更改）+ 修改密码 */
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
  const [emailExpanded, setEmailExpanded] = useState(emailChange.step === 'verify')

  return (
    <motion.div
      key="account"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className="max-w-xl space-y-8"
    >
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-primary-light" />
        <h2 className="text-base font-semibold text-foreground">账号安全</h2>
      </div>

      {/* 邮箱 */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">登录邮箱</h3>
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="input pl-10 opacity-70 cursor-not-allowed"
          />
        </div>

        <button
          type="button"
          onClick={() => setEmailExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm text-primary-light hover:underline"
        >
          更改邮箱
          <ChevronDown
            className={`w-4 h-4 transition-transform ${emailExpanded || emailChange.step === 'verify' ? 'rotate-180' : ''}`}
          />
        </button>

        {(emailExpanded || emailChange.step === 'verify') && (
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            {emailChange.step === 'input' ? (
              <>
                <p className="text-xs text-muted-foreground">
                  更改邮箱需验证当前密码，并向新邮箱发送验证码。
                </p>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="新邮箱地址"
                    value={emailChange.newEmail}
                    onChange={(e) => onEmailChange({ ...emailChange, newEmail: e.target.value })}
                    className="input pl-10"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPasswords.emailPassword ? 'text' : 'password'}
                    placeholder="当前密码"
                    value={emailChange.currentPassword}
                    onChange={(e) =>
                      onEmailChange({ ...emailChange, currentPassword: e.target.value })
                    }
                    className="input pl-10 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onShowPasswordsChange({
                        ...showPasswords,
                        emailPassword: !showPasswords.emailPassword,
                      })
                    }
                    aria-label={showPasswords.emailPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPasswords.emailPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <button
                  onClick={onSendVerificationCode}
                  disabled={emailChange.loading}
                  className="btn btn-primary"
                >
                  {emailChange.loading ? '发送中…' : '发送验证码'}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-foreground">
                  验证码已发送至{' '}
                  <span className="font-medium text-primary-light">{emailChange.newEmail}</span>
                </p>
                <input
                  type="text"
                  placeholder="请输入 6 位验证码"
                  value={emailChange.verificationCode}
                  onChange={(e) =>
                    onEmailChange({
                      ...emailChange,
                      verificationCode: e.target.value.replace(/\D/g, '').slice(0, 6),
                    })
                  }
                  className="input tracking-widest"
                  maxLength={6}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={onConfirmEmailChange}
                    disabled={emailChange.loading}
                    className="btn btn-primary"
                  >
                    {emailChange.loading ? '确认中…' : '确认更改'}
                  </button>
                  <button
                    onClick={() => {
                      onCancelEmailChange()
                      setEmailExpanded(false)
                    }}
                    disabled={emailChange.loading}
                    className="btn btn-ghost"
                  >
                    取消
                  </button>
                  {emailChange.countdown > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {emailChange.countdown}s 后可重新发送
                    </span>
                  )}
                  {emailChange.countdown === 0 && (
                    <button
                      type="button"
                      onClick={onSendVerificationCode}
                      disabled={emailChange.loading}
                      className="text-xs text-primary-light hover:underline"
                    >
                      重新发送
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* 密码 */}
      <section className="space-y-3 pt-2 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground">修改密码</h3>
        <div className="space-y-3 max-w-md">
          <PasswordInput
            placeholder="当前密码"
            value={formData.currentPassword}
            visible={showPasswords.current}
            onToggle={() =>
              onShowPasswordsChange({ ...showPasswords, current: !showPasswords.current })
            }
            onChange={(v) => onFormDataChange({ ...formData, currentPassword: v })}
          />
          <PasswordInput
            placeholder="新密码（至少 6 位）"
            value={formData.newPassword}
            visible={showPasswords.new}
            onToggle={() => onShowPasswordsChange({ ...showPasswords, new: !showPasswords.new })}
            onChange={(v) => onFormDataChange({ ...formData, newPassword: v })}
          />
          <PasswordInput
            placeholder="确认新密码"
            value={formData.confirmPassword}
            visible={showPasswords.confirm}
            onToggle={() =>
              onShowPasswordsChange({ ...showPasswords, confirm: !showPasswords.confirm })
            }
            onChange={(v) => onFormDataChange({ ...formData, confirmPassword: v })}
          />
          <button onClick={onPasswordChange} disabled={loading} className="btn btn-primary">
            {loading ? '修改中…' : '更新密码'}
          </button>
        </div>
      </section>
    </motion.div>
  )
}

function PasswordInput({
  placeholder,
  value,
  visible,
  onToggle,
  onChange,
}: {
  placeholder: string
  value: string
  visible: boolean
  onToggle: () => void
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input pl-10 pr-11"
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? '隐藏密码' : '显示密码'}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}
