'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import AvatarUploader from '@/components/AvatarUploader'
import { getRoleLabel, getRoleColor } from '@/lib/permissions'
import type { SettingsFormData, SettingsUser } from '../_types'

interface ProfileSectionProps {
  user: SettingsUser | null
  formData: SettingsFormData
  loading: boolean
  onFormDataChange: (data: SettingsFormData) => void
  onAvatarUpdate: (url: string) => void
  onSubmit: () => void
}

/** 个人资料：单列紧凑流（头像条 → 字段 → 保存） */
export function ProfileSection({
  user,
  formData,
  loading,
  onFormDataChange,
  onAvatarUpdate,
  onSubmit,
}: ProfileSectionProps) {
  const displayName = formData.nickname.trim() || user?.username || '用户'

  return (
    <motion.div
      key="profile"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className="max-w-xl space-y-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground truncate">{displayName}</h2>
            {user?.role && (
              <span className={`tag text-xs ${getRoleColor(user.role)}`}>
                {getRoleLabel(user.role)}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">@{user?.username}</p>
        </div>
        {user?.id && (
          <Link
            href={`/user/${user.id}`}
            className="inline-flex items-center gap-1 text-sm text-primary-light hover:underline shrink-0"
          >
            主页
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      <AvatarUploader
        currentAvatar={user?.avatar}
        onAvatarUpdate={onAvatarUpdate}
        variant="compact"
      />

      <div className="space-y-4 pt-2 border-t border-border">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">用户名</label>
          <input
            type="text"
            value={user?.username || ''}
            disabled
            className="input opacity-60 cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-muted-foreground">创建后不可修改</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-foreground">昵称</label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formData.nickname.length}/32
            </span>
          </div>
          <input
            type="text"
            value={formData.nickname}
            onChange={(e) => onFormDataChange({ ...formData, nickname: e.target.value })}
            className="input"
            placeholder="展示在排行榜与题解中的名称"
            maxLength={32}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-foreground">个人简介</label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formData.bio.length}/500
            </span>
          </div>
          <textarea
            rows={4}
            value={formData.bio}
            onChange={(e) => onFormDataChange({ ...formData, bio: e.target.value })}
            className="input resize-none"
            placeholder="介绍一下你自己、擅长的算法方向…"
            maxLength={500}
          />
        </div>
      </div>

      <button onClick={onSubmit} disabled={loading} className="btn btn-primary w-full sm:w-auto min-w-[120px]">
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            保存中…
          </span>
        ) : (
          '保存资料'
        )}
      </button>
    </motion.div>
  )
}
