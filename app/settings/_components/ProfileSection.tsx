'use client'

import { motion } from 'framer-motion'
import { User } from 'lucide-react'
import AvatarUploader from '@/components/AvatarUploader'
import type { SettingsFormData, SettingsUser } from '../_types'

interface ProfileSectionProps {
  user: SettingsUser | null
  formData: SettingsFormData
  loading: boolean
  onFormDataChange: (data: SettingsFormData) => void
  onAvatarUpdate: (url: string) => void
  onSubmit: () => void
}

/** 个人资料 Tab：头像 + 用户名 + 昵称 + 简介 */
export function ProfileSection({
  user,
  formData,
  loading,
  onFormDataChange,
  onAvatarUpdate,
  onSubmit,
}: ProfileSectionProps) {
  return (
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
        <label className="block text-sm font-medium text-muted-foreground mb-4">头像</label>
        <AvatarUploader currentAvatar={user?.avatar} onAvatarUpdate={onAvatarUpdate} />
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">用户名</label>
          <input
            type="text"
            value={user?.username || ''}
            disabled
            className="input opacity-60 cursor-not-allowed"
          />
          <p className="mt-2 text-xs text-muted-foreground">用户名不可修改</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">昵称</label>
          <input
            type="text"
            value={formData.nickname}
            onChange={e => onFormDataChange({ ...formData, nickname: e.target.value })}
            className="input"
            placeholder="请输入昵称"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">个人简介</label>
          <textarea
            rows={4}
            value={formData.bio}
            onChange={e => onFormDataChange({ ...formData, bio: e.target.value })}
            className="input resize-none"
            placeholder="介绍一下你自己..."
            maxLength={500}
          />
          <p className="mt-2 text-xs text-muted-foreground">{formData.bio.length}/500</p>
        </div>

        <div className="pt-4">
          <button onClick={onSubmit} disabled={loading} className="btn btn-primary min-w-[140px]">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                保存中...
              </span>
            ) : (
              '保存修改'
            )}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
