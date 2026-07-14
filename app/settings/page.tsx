'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Mail, Lock, Bell, Globe, Check, X, Settings, Shield, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import AvatarUploader from '@/components/AvatarUploader'
import { fetchWithAuth } from '@/lib/api/base'

interface NotificationPreferences {
 submissionComplete: boolean
 commentReply: boolean
 contestReminder: boolean
 systemAnnouncement: boolean
}

interface EditorPreferences {
 defaultLanguage: string
 theme: string
}

interface Preferences {
 notifications: NotificationPreferences
 editor: EditorPreferences
}

export default function SettingsPage() {
 const { user: contextUser, setUser } = useUser()
 const [user, setUserLocal] = useState<any>(null)
 const [activeTab, setActiveTab] = useState('profile')
 const [loading, setLoading] = useState(false)
 const [preferencesLoading, setPreferencesLoading] = useState(false)
 const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
 
 const [formData, setFormData] = useState({
 nickname: '',
 bio: '',
 currentPassword: '',
 newPassword: '',
 confirmPassword: ''
 })

 const [emailChange, setEmailChange] = useState({
 newEmail: '',
 currentPassword: '',
 verificationCode: '',
 step: 'input' as 'input' | 'verify',
 loading: false,
 countdown: 0
 })

 const [showPasswords, setShowPasswords] = useState({
 current: false,
 new: false,
 confirm: false,
 emailPassword: false,
 })

 const [preferences, setPreferences] = useState<Preferences>({
 notifications: {
 submissionComplete: true,
 commentReply: true,
 contestReminder: false,
 systemAnnouncement: true
 },
 editor: {
 defaultLanguage: 'C++',
 theme: 'light'
 }
 })

 // 邮箱验证码倒计时定时器、消息提示定时器的引用，用于卸载时清理
 const emailCountdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
 const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
 bio: contextUser.bio || ''
 }))
 }
 }, [contextUser])

 useEffect(() => {
 const fetchPreferences = async () => {
 try {
 const response = await fetchWithAuth('/api/users/preferences')
 const data = await response.json()
 if (data.success && data.data) {
 setPreferences(prev => ({
 notifications: { ...prev.notifications, ...data.data.notifications },
 editor: { ...prev.editor, ...data.data.editor }
 }))
 }
 } catch (error) {
 console.error('获取偏好设置失败:', error)
 }
 }
 
 if (contextUser) {
 fetchPreferences()
 }
 }, [contextUser])

 const showMessage = (type: 'success' | 'error', text: string) => {
 setMessage({ type, text })
 if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
 messageTimerRef.current = setTimeout(() => {
 setMessage(null)
 messageTimerRef.current = null
 }, 3000)
 }

 const handleProfileSubmit = async () => {
 setLoading(true)
 try {
 const response = await fetchWithAuth('/api/users/profile', {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 nickname: formData.nickname,
 bio: formData.bio
 })
 })

 const data = await response.json()

 if (data.success) {
 showMessage('success', '资料更新成功')
 const updatedUser = { ...user, ...data.data }
 setUserLocal(updatedUser)
 setUser(updatedUser)
 localStorage.setItem('user', JSON.stringify({ id: updatedUser.id, username: updatedUser.username, nickname: updatedUser.nickname, avatar: updatedUser.avatar, role: updatedUser.role }))
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
 const response = await fetchWithAuth('/api/users/profile/password', {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 currentPassword: formData.currentPassword,
 newPassword: formData.newPassword
 })
 })

 const data = await response.json()

 if (data.success) {
 showMessage('success', '密码修改成功')
 setFormData(prev => ({
 ...prev,
 currentPassword: '',
 newPassword: '',
 confirmPassword: ''
 }))
 } else {
 showMessage('error', data.error || '修改失败')
 }
 } catch (error) {
 showMessage('error', '网络错误')
 } finally {
 setLoading(false)
 }
 }

 const handleNotificationChange = (key: keyof NotificationPreferences, value: boolean) => {
 setPreferences(prev => ({
 ...prev,
 notifications: {
 ...prev.notifications,
 [key]: value
 }
 }))
 }

 const handleEditorChange = (key: keyof EditorPreferences, value: string) => {
 setPreferences(prev => ({
 ...prev,
 editor: {
 ...prev.editor,
 [key]: value
 }
 }))
 }

 const handleSavePreferences = async () => {
 setPreferencesLoading(true)
 try {
 const response = await fetchWithAuth('/api/users/preferences', {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(preferences)
 })

 const data = await response.json()

 if (data.success) {
 showMessage('success', '偏好设置保存成功')
 } else {
 showMessage('error', data.error || '保存失败')
 }
 } catch (error) {
 showMessage('error', '网络错误')
 } finally {
 setPreferencesLoading(false)
 }
 }

 const handleSendVerificationCode = async () => {
 if (!emailChange.newEmail || !emailChange.currentPassword) {
 showMessage('error', '请填写新邮箱和当前密码')
 return
 }

 const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 if (!emailRegex.test(emailChange.newEmail)) {
 showMessage('error', '请输入有效的邮箱地址')
 return
 }

 if (emailChange.newEmail.toLowerCase() === user?.email?.toLowerCase()) {
 showMessage('error', '新邮箱不能与当前邮箱相同')
 return
 }

 setEmailChange(prev => ({ ...prev, loading: true }))
 try {
 const response = await fetchWithAuth('/api/users/profile/email', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 newEmail: emailChange.newEmail,
 currentPassword: emailChange.currentPassword
 })
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
 const response = await fetchWithAuth('/api/users/profile/email', {
 method: 'PATCH',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 code: emailChange.verificationCode
 })
 })

 const data = await response.json()

 if (data.success) {
 showMessage('success', '邮箱更改成功')
 const updatedUser = { ...user, email: data.newEmail }
 setUserLocal(updatedUser)
 setUser(updatedUser)
 localStorage.setItem('user', JSON.stringify({ id: updatedUser.id, username: updatedUser.username, nickname: updatedUser.nickname, avatar: updatedUser.avatar, role: updatedUser.role }))
 setEmailChange({
 newEmail: '',
 currentPassword: '',
 verificationCode: '',
 step: 'input',
 loading: false,
 countdown: 0
 })
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
 setEmailChange({
 newEmail: '',
 currentPassword: '',
 verificationCode: '',
 step: 'input',
 loading: false,
 countdown: 0
 })
 }

 const tabs = [
 { id: 'profile', label: '个人资料', icon: User, desc: '管理您的个人信息' },
 { id: 'account', label: '账号安全', icon: Lock, desc: '密码与安全设置' },
 { id: 'notifications', label: '通知设置', icon: Bell, desc: '通知偏好管理' },
 { id: 'preferences', label: '偏好设置', icon: Globe, desc: '自定义您的体验' },
 ]

 return (
 <div className="min-h-screen">
 <div className="container mx-auto px-4 py-8 max-w-6xl">
 <div className="flex items-center gap-4 mb-8">
 <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
 <Settings className="w-6 h-6 text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">设置</h1>
 <p className="text-muted-foreground text-sm mt-0.5">管理您的账户设置和偏好</p>
 </div>
 </div>

 {message && (
 <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 card-static ${
 message.type === 'success' 
 ? 'border-l-4 border-l-secondary bg-secondary/10' 
 : 'border-l-4 border-l-error bg-error/10'
 }`}>
 <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
 message.type === 'success' ? 'bg-secondary/20' : 'bg-error/20'
 }`}>
 {message.type === 'success' 
 ? <Check className="w-4 h-4 text-secondary-light" /> 
 : <X className="w-4 h-4 text-red-400" />
 }
 </div>
 <span className="text-foreground font-medium">{message.text}</span>
 </div>
 )}

 <div className="grid lg:grid-cols-4 gap-6">
<div className="lg:col-span-1">
  <div className="card-static p-3">
   <nav className="space-y-1">
    {tabs.map((tab) => {
     const Icon = tab.icon
     const isActive = activeTab === tab.id
     return (
      <button
       key={tab.id}
       onClick={() => setActiveTab(tab.id)}
       className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all group ${
        isActive
         ? 'text-primary-light'
         : 'text-muted-foreground hover:bg-primary/8 hover:text-foreground'
       }`}
      >
       {isActive && (
        <motion.div
         layoutId="settings-tab-indicator"
         className="absolute inset-0 bg-primary/15 border border-primary/25 rounded-lg"
         transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
       )}
       <span className="relative z-10 flex items-center gap-3">
        <Icon className={`w-5 h-5 ${isActive ? 'text-primary-light' : 'group-hover:text-primary-light'}`} />
        <div className="text-left flex-1">
         <div className="font-medium text-sm">{tab.label}</div>
        </div>
        <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'opacity-100' : ''}`} />
       </span>
      </button>
     )
    })}
   </nav>
  </div>
 </div>

<div className="lg:col-span-3">
  <div className="card-static p-6">
   <AnimatePresence mode="wait">
    {activeTab === 'profile' && (
     <motion.div
      key="profile"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
     >
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
       <User className="w-5 h-5 text-primary-light" />
       <h2 className="text-xl font-bold text-foreground">个人资料</h2>
      </div>
 
 <div className="mb-8 pb-8 border-b border-border">
 <label className="block text-sm font-medium text-muted-foreground mb-4">
 头像
 </label>
 <AvatarUploader 
 currentAvatar={user?.avatar}
 onAvatarUpdate={(newUrl) => {
 const updatedUser = { ...user, avatar: newUrl }
 setUserLocal(updatedUser)
 setUser(updatedUser)
 localStorage.setItem('user', JSON.stringify({ id: updatedUser.id, username: updatedUser.username, nickname: updatedUser.nickname, avatar: updatedUser.avatar, role: updatedUser.role }))
 showMessage('success', '头像更新成功')
 }}
 />
 </div>

 <div className="space-y-5">
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">
 用户名
 </label>
 <input
 type="text"
 value={user?.username || ''}
 disabled
 className="input opacity-60 cursor-not-allowed"
 />
 <p className="mt-2 text-xs text-muted-foreground">用户名不可修改</p>
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">
 昵称
 </label>
 <input
 type="text"
 value={formData.nickname}
 onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
 className="input"
 placeholder="请输入昵称"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">
 个人简介
 </label>
 <textarea
 rows={4}
 value={formData.bio}
 onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
 className="input resize-none"
 placeholder="介绍一下你自己..."
 maxLength={500}
 />
 <p className="mt-2 text-xs text-muted-foreground">{formData.bio.length}/500</p>
 </div>

<div className="pt-4">
   <button
    onClick={handleProfileSubmit}
    disabled={loading}
    className="btn btn-primary min-w-[140px]"
   >
    {loading ? (
     <span className="flex items-center gap-2">
      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      保存中...
     </span>
    ) : '保存修改'}
   </button>
  </div>
 </div>
 </motion.div>
 )}

 {activeTab === 'account' && (
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
 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">
 邮箱地址
 </label>
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
 onChange={(e) => setEmailChange({ ...emailChange, newEmail: e.target.value })}
 className="input pl-12"
 />
 </div>
 <div className="relative">
 <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
 <input
 type={showPasswords.emailPassword ? 'text' : 'password'}
 placeholder="当前密码"
 value={emailChange.currentPassword}
 onChange={(e) => setEmailChange({ ...emailChange, currentPassword: e.target.value })}
 className="input pl-12 pr-12"
 />
 <button
 type="button"
 onClick={() => setShowPasswords(prev => ({ ...prev, emailPassword: !prev.emailPassword }))}
 aria-label={showPasswords.emailPassword ? '隐藏密码' : '显示密码'}
 className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
 >
 {showPasswords.emailPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
 </button>
 </div>
 <div className="pt-2">
 <button
 onClick={handleSendVerificationCode}
 disabled={emailChange.loading}
 className="btn btn-primary min-w-[140px]"
 >
 {emailChange.loading ? (
 <span className="flex items-center gap-2">
 <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
 发送中...
 </span>
 ) : '发送验证码'}
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
 <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
 </svg>
 <input
 type="text"
 placeholder="请输入6位验证码"
 value={emailChange.verificationCode}
 onChange={(e) => setEmailChange({ ...emailChange, verificationCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
 className="input pl-12"
 maxLength={6}
 />
 </div>
 <div className="flex items-center gap-3 pt-2">
 <button
 onClick={handleConfirmEmailChange}
 disabled={emailChange.loading}
 className="btn btn-primary min-w-[140px]"
 >
 {emailChange.loading ? (
 <span className="flex items-center gap-2">
 <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
 确认中...
 </span>
 ) : '确认更改'}
 </button>
 <button
 onClick={handleCancelEmailChange}
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

 <div className="pt-4 border-t border-border">
 <h3 className="font-semibold text-foreground mb-4">修改密码</h3>
 <div className="space-y-4">
 <div className="relative">
 <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
 <input
 type={showPasswords.current ? 'text' : 'password'}
 placeholder="当前密码"
 value={formData.currentPassword}
 onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
 className="input pl-12 pr-12"
 />
 <button
 type="button"
 onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
 aria-label={showPasswords.current ? '隐藏密码' : '显示密码'}
 className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
 >
 {showPasswords.current ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
 </button>
 </div>
 <div className="relative">
 <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
 <input
 type={showPasswords.new ? 'text' : 'password'}
 placeholder="新密码（至少6位）"
 value={formData.newPassword}
 onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
 className="input pl-12 pr-12"
 />
 <button
 type="button"
 onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
 aria-label={showPasswords.new ? '隐藏密码' : '显示密码'}
 className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
 >
 {showPasswords.new ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
 </button>
 </div>
 <div className="relative">
 <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
 <input
 type={showPasswords.confirm ? 'text' : 'password'}
 placeholder="确认新密码"
 value={formData.confirmPassword}
 onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
 className="input pl-12 pr-12"
 />
 <button
 type="button"
 onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
 aria-label={showPasswords.confirm ? '隐藏密码' : '显示密码'}
 className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
 >
 {showPasswords.confirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
 </button>
 </div>
<div className="pt-2">
   <button
    onClick={handlePasswordChange}
    disabled={loading}
    className="btn btn-primary min-w-[140px]"
   >
    {loading ? (
     <span className="flex items-center gap-2">
      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      修改中...
     </span>
    ) : '修改密码'}
   </button>
  </div>
 </div>
 </div>
 </div>
 </motion.div>
 )}

 {activeTab === 'notifications' && (
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
 {[
 { key: 'submissionComplete' as const, label: '提交评测完成', desc: '当代码评测完成时通知我' },
 { key: 'commentReply' as const, label: '评论回复', desc: '当有人回复我的评论时通知我' },
 { key: 'contestReminder' as const, label: '竞赛提醒', desc: '竞赛开始前提醒我' },
 { key: 'systemAnnouncement' as const, label: '系统公告', desc: '接收平台系统公告' },
 ].map((item) => (
 <div key={item.key} className="flex items-center justify-between py-4 border-b border-border/50 group hover:bg-primary/5 -mx-2 px-2 rounded-lg transition-colors">
 <div>
 <div className="font-medium text-foreground">{item.label}</div>
 <div className="text-sm text-muted-foreground mt-0.5">{item.desc}</div>
 </div>
 <label className="relative inline-flex items-center cursor-pointer">
 <input 
 type="checkbox" 
 className="sr-only peer" 
 checked={preferences.notifications[item.key]}
 onChange={(e) => handleNotificationChange(item.key, e.target.checked)}
 />
 <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-foreground after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
 </label>
 </div>
 ))}
 </div>

<div className="pt-6">
   <button
    onClick={handleSavePreferences}
    disabled={preferencesLoading}
    className="btn btn-primary min-w-[140px]"
   >
    {preferencesLoading ? (
     <span className="flex items-center gap-2">
      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      保存中...
     </span>
    ) : '保存设置'}
   </button>
  </div>
 </motion.div>
 )}

 {activeTab === 'preferences' && (
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
 <label className="block text-sm font-medium text-muted-foreground mb-2">
 默认编程语言
 </label>
 <select 
 className="input cursor-pointer"
 value={preferences.editor.defaultLanguage}
 onChange={(e) => handleEditorChange('defaultLanguage', e.target.value)}
 >
 <option value="C++">C++</option>
 <option value="C">C</option>
 <option value="Java">Java</option>
 <option value="Python">Python</option>
 <option value="JavaScript">JavaScript</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-muted-foreground mb-2">
 代码编辑器主题
 </label>
 <select 
 className="input cursor-pointer"
 value={preferences.editor.theme}
 onChange={(e) => handleEditorChange('theme', e.target.value)}
 >
 <option value="light">浅色</option>
 <option value="dark">深色</option>
 <option value="high-contrast">高对比度</option>
 </select>
 </div>

 <div className="pt-4">
 <button 
 onClick={handleSavePreferences}
 disabled={preferencesLoading}
 className="btn btn-primary min-w-[140px]"
>
   {preferencesLoading ? (
    <span className="flex items-center gap-2">
     <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
     保存中...
    </span>
   ) : '保存设置'}
  </button>
 </div>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 </div>
 </div>
 </div>
 </div>
 )
}
