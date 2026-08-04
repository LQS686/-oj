'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence } from 'motion/react'
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
  isSettingsTabId,
  persistUserToStorage,
  type SettingsTabId,
} from './_utils'
import { usePreferences } from './_hooks/usePreferences'
import { SettingsHeader } from './_components/SettingsHeader'
import { MessageBanner } from './_components/MessageBanner'
import { SettingsTabs } from './_components/SettingsTabs'
import { ProfileSection } from './_components/ProfileSection'
import { AccountSection } from './_components/AccountSection'
import { PreferencesSection } from './_components/PreferencesSection'
import { EducationalPageShell, PageLoading, RouteSuspenseFallback } from '@/components/common'
import { loginPath } from '@/lib/navigation'

function SettingsPageContent() {
  const { user: contextUser, setUser, isLoading: authLoading } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUserLocal] = useState<SettingsUser | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTabId>(() => {
    const tab = searchParams.get('tab')
    return isSettingsTabId(tab) ? tab : 'profile'
  })
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

  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
    messageTimerRef.current = setTimeout(() => {
      setMessage(null)
      messageTimerRef.current = null
    }, 3000)
  }

  const {
    preferences,
    loading: preferencesLoading,
    updateNotification,
    updateDefaultCodeLanguage,
    save: savePreferences,
  } = usePreferences({ enabled: !!contextUser, showMessage })

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current)
        messageTimerRef.current = null
      }
    }
  }, [])

  useDeferredEffect(() => {
    const tab = searchParams.get('tab')
    if (isSettingsTabId(tab)) setActiveTab(tab)
  }, [searchParams])

  const handleTabChange = (tab: SettingsTabId) => {
    setActiveTab(tab)
    router.replace(tab === 'profile' ? '/settings' : `/settings?tab=${tab}`, { scroll: false })
  }

  useDeferredEffect(() => {
    if (contextUser) {
      setUserLocal(contextUser)
      setFormData((prev) => ({
        ...prev,
        nickname: contextUser.nickname || '',
        bio: contextUser.bio || '',
      }))
    }
  }, [contextUser])

  useEffect(() => {
    if (authLoading) return
    if (!contextUser) {
      router.replace(loginPath('/settings'))
    }
  }, [authLoading, contextUser, router])

  const handleProfileSubmit = async () => {
    const nickname = formData.nickname.trim()
    if (nickname.length > 32) {
      showMessage('error', '昵称不能超过 32 个字符')
      return
    }
    setLoading(true)
    try {
      const response = await fetchWithCookie('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, bio: formData.bio }),
      })
      const data = await response.json()
      if (data.success) {
        showMessage('success', '资料已更新')
        const updatedUser = { ...user, ...data.data } as SettingsUser
        setUserLocal(updatedUser)
        setUser(updatedUser)
        persistUserToStorage(updatedUser)
      } else {
        showMessage('error', data.error || '更新失败')
      }
    } catch {
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
    if (formData.newPassword.length < 8) {
      showMessage('error', '密码长度至少为 8 位，且需包含字母和数字')
      return
    }
    if (!/[a-zA-Z]/.test(formData.newPassword) || !/[0-9]/.test(formData.newPassword)) {
      showMessage('error', '密码必须同时包含字母和数字')
      return
    }
    if (formData.newPassword.length > 128) {
      showMessage('error', '密码长度不能超过 128 位')
      return
    }
    if (
      ['12345678', 'password', '123456789', '1234567890', 'qwerty', 'abc123', '111111', '1234567', '12345', '123456', 'password1', 'qwerty123'].includes(
        formData.newPassword.toLowerCase()
      )
    ) {
      showMessage('error', '密码过于简单，请使用更强的密码')
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
        showMessage('success', '密码已更新')
        setFormData((prev) => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }))
      } else {
        showMessage('error', data.error || '修改失败')
      }
    } catch {
      showMessage('error', '网络错误')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitEmailChange = async () => {
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

    setEmailChange((prev) => ({ ...prev, loading: true }))
    try {
      const response = await fetchWithCookie('/api/users/profile/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newEmail: emailChange.newEmail,
          password: emailChange.currentPassword,
        }),
      })
      const data = await response.json()
      if (data.success) {
        const newEmail =
          typeof data.data?.newEmail === 'string' ? data.data.newEmail : emailChange.newEmail
        showMessage('success', data.data?.message || '邮箱修改成功，请重新登录')
        const updatedUser = { ...user, email: newEmail } as SettingsUser
        setUserLocal(updatedUser)
        setUser(updatedUser)
        persistUserToStorage(updatedUser)
        setEmailChange(INITIAL_EMAIL_CHANGE)
      } else {
        showMessage('error', data.error || '邮箱更改失败')
        setEmailChange((prev) => ({ ...prev, loading: false }))
      }
    } catch {
      showMessage('error', '网络错误')
      setEmailChange((prev) => ({ ...prev, loading: false }))
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
    showMessage('success', '头像已更新')
  }

  if (authLoading || !contextUser) {
    return <PageLoading label="加载设置中..." />
  }

  return (
    <EducationalPageShell title="个人设置" width="standard">
      <SettingsHeader />
      <MessageBanner message={message} />

      {/* 单一卡片：侧栏 + 内容，避免多层卡片嵌套 */}
      <div className="card-static overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[11.5rem_minmax(0,1fr)]">
          <div className="lg:border-r border-border p-3 lg:p-4 lg:bg-muted/20">
            <SettingsTabs activeTab={activeTab} onTabChange={handleTabChange} />
          </div>

          <div className="p-5 md:p-6 min-w-0">
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
                  onSubmitEmailChange={handleSubmitEmailChange}
                  onCancelEmailChange={handleCancelEmailChange}
                  onPasswordChange={handlePasswordChange}
                />
              )}

              {activeTab === 'preferences' && (
                <PreferencesSection
                  preferences={preferences}
                  loading={preferencesLoading}
                  onNotificationChange={updateNotification}
                  onDefaultCodeLanguageChange={updateDefaultCodeLanguage}
                  onSave={savePreferences}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </EducationalPageShell>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<RouteSuspenseFallback label="加载设置中..." />}>
      <SettingsPageContent />
    </Suspense>
  )
}
