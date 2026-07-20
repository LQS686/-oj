'use client'

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import type {
  EmailChangeState,
  SettingsFormData,
  SettingsMessage,
  SettingsUser,
  ShowPasswordsState,
} from './_types'
import {
  EMAIL_REGEX,
  INITIAL_EMAIL_CHANGE,
  persistUserToStorage,
  type SettingsTabId,
} from './_utils'
import { usePreferences } from './_hooks/usePreferences'
import { SettingsHeader } from './_components/SettingsHeader'
import { MessageBanner } from './_components/MessageBanner'
import { SettingsTabs } from './_components/SettingsTabs'
import { ProfileSection } from './_components/ProfileSection'
import { AccountSection } from './_components/AccountSection'
import { NotificationsSection } from './_components/NotificationsSection'
import { PreferencesSection } from './_components/PreferencesSection'

export default function SettingsPage() {
  const { user: contextUser, setUser } = useUser()
  const [user, setUserLocal] = useState<SettingsUser | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTabId>('profile')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<SettingsMessage | null>(null)

  const [formData, setFormData] = useState<SettingsFormData>({
    nickname: '',
    bio: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [emailChange, setEmailChange] = useState<EmailChangeState>(INITIAL_EMAIL_CHANGE)

  const [showPasswords, setShowPasswords] = useState<ShowPasswordsState>({
    current: false,
    new: false,
    confirm: false,
    emailPassword: false,
  })

  // 邮箱验证码倒计时定时器、消息提示定时器的引用，用于卸载时清理
  const emailCountdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
    messageTimerRef.current = setTimeout(() => {
      setMessage(null)
      messageTimerRef.current = null
    }, 3000)
  }

  const { preferences, loading: preferencesLoading, updateNotification, updateEditor, save: savePreferences } =
    usePreferences({ enabled: !!contextUser, showMessage })

  // 组件卸载时清理所有定时器，避免 setState 操作已卸载组件
  useEffect(() => {
    return () => {
      if (emailCountdownTimerRef.current) {
        clearInterval(emailCountdownTimerRef.current)
        emailCountdownTimerRef.current = null
      }
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current)
        messageTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (contextUser) {
      setUserLocal(contextUser)
      setFormData(prev => ({
        ...prev,
        nickname: contextUser.nickname || '',
        bio: contextUser.bio || '',
      }))
    }
  }, [contextUser])

  const handleProfileSubmit = async () => {
    setLoading(true)
    try {
      const response = await fetchWithCookie('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: formData.nickname, bio: formData.bio }),
      })
      const data = await response.json()
      if (data.success) {
        showMessage('success', '资料更新成功')
        const updatedUser = { ...user, ...data.data } as SettingsUser
        setUserLocal(updatedUser)
        setUser(updatedUser)
        persistUserToStorage(updatedUser)
      } else {
        showMessage('error', data.error || '更新失败')
      }
    } catch (error) {
      showMessage('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async () => {
    if (!formData.newPassword || !formData.confirmPassword || !formData.currentPassword) {
      showMessage('error', '请填写所有密码字段')
      return
    }
    if (formData.newPassword !== formData.confirmPassword) {
      showMessage('error', '两次输入的密码不一致')
      return
    }
    if (formData.newPassword.length < 6) {
      showMessage('error', '密码长度至少为6位')
      return
    }

    setLoading(true)
    try {
      const response = await fetchWithCookie('/api/users/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      })
      const data = await response.json()
      if (data.success) {
        showMessage('success', '密码修改成功')
        setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }))
      } else {
        showMessage('error', data.error || '修改失败')
      }
    } catch (error) {
      showMessage('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  const handleSendVerificationCode = async () => {
    if (!emailChange.newEmail || !emailChange.currentPassword) {
      showMessage('error', '请填写新邮箱和当前密码')
      return
    }
    if (!EMAIL_REGEX.test(emailChange.newEmail)) {
      showMessage('error', '请输入有效的邮箱地址')
      return
    }
    if (emailChange.newEmail.toLowerCase() === user?.email?.toLowerCase()) {
      showMessage('error', '新邮箱不能与当前邮箱相同')
      return
    }

    setEmailChange(prev => ({ ...prev, loading: true }))
    try {
      const response = await fetchWithCookie('/api/users/profile/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newEmail: emailChange.newEmail,
          currentPassword: emailChange.currentPassword,
        }),
      })
      const data = await response.json()
      if (data.success) {
        showMessage('success', '验证码已发送至新邮箱')
        setEmailChange(prev => ({ ...prev, step: 'verify', loading: false, countdown: 60 }))

        if (emailCountdownTimerRef.current) clearInterval(emailCountdownTimerRef.current)
        emailCountdownTimerRef.current = setInterval(() => {
          setEmailChange(prev => {
            if (prev.countdown <= 1) {
              if (emailCountdownTimerRef.current) {
                clearInterval(emailCountdownTimerRef.current)
                emailCountdownTimerRef.current = null
              }
              return { ...prev, countdown: 0 }
            }
            return { ...prev, countdown: prev.countdown - 1 }
          })
        }, 1000)
      } else {
        showMessage('error', data.error || '发送验证码失败')
        setEmailChange(prev => ({ ...prev, loading: false }))
      }
    } catch (error) {
      showMessage('error', '网络错误')
      setEmailChange(prev => ({ ...prev, loading: false }))
    }
  }

  const handleConfirmEmailChange = async () => {
    if (!emailChange.verificationCode) {
      showMessage('error', '请输入验证码')
      return
    }

    setEmailChange(prev => ({ ...prev, loading: true }))
    try {
      const response = await fetchWithCookie('/api/users/profile/email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: emailChange.verificationCode }),
      })
      const data = await response.json()
      if (data.success) {
        showMessage('success', '邮箱更改成功')
        const updatedUser = { ...user, email: data.newEmail } as SettingsUser
        setUserLocal(updatedUser)
        setUser(updatedUser)
        persistUserToStorage(updatedUser)
        setEmailChange(INITIAL_EMAIL_CHANGE)
      } else {
        showMessage('error', data.error || '邮箱更改失败')
        setEmailChange(prev => ({ ...prev, loading: false }))
      }
    } catch (error) {
      showMessage('error', '网络错误')
      setEmailChange(prev => ({ ...prev, loading: false }))
    }
  }

  const handleCancelEmailChange = () => {
    setEmailChange(INITIAL_EMAIL_CHANGE)
  }

  const handleAvatarUpdate = (newUrl: string) => {
    const updatedUser = { ...user, avatar: newUrl } as SettingsUser
    setUserLocal(updatedUser)
    setUser(updatedUser)
    persistUserToStorage(updatedUser)
    showMessage('success', '头像更新成功')
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <SettingsHeader />
        <MessageBanner message={message} />

        <div className="grid lg:grid-cols-4 gap-6">
          <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="lg:col-span-3">
            <div className="card-static p-6">
              <AnimatePresence mode="wait">
                {activeTab === 'profile' && (
                  <ProfileSection
                    user={user}
                    formData={formData}
                    loading={loading}
                    onFormDataChange={setFormData}
                    onAvatarUpdate={handleAvatarUpdate}
                    onSubmit={handleProfileSubmit}
                  />
                )}

                {activeTab === 'account' && (
                  <AccountSection
                    user={user}
                    formData={formData}
                    emailChange={emailChange}
                    showPasswords={showPasswords}
                    loading={loading}
                    onFormDataChange={setFormData}
                    onEmailChange={setEmailChange}
                    onShowPasswordsChange={setShowPasswords}
                    onSendVerificationCode={handleSendVerificationCode}
                    onConfirmEmailChange={handleConfirmEmailChange}
                    onCancelEmailChange={handleCancelEmailChange}
                    onPasswordChange={handlePasswordChange}
                  />
                )}

                {activeTab === 'notifications' && (
                  <NotificationsSection
                    preferences={preferences}
                    loading={preferencesLoading}
                    onNotificationChange={updateNotification}
                    onSave={savePreferences}
                  />
                )}

                {activeTab === 'preferences' && (
                  <PreferencesSection
                    preferences={preferences}
                    loading={preferencesLoading}
                    onEditorChange={updateEditor}
                    onSave={savePreferences}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
