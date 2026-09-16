'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AlertCircle, Check, ImageOff, Loader2 } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { errorLike } from '@/lib/api/errors'
import { BUILTIN_AVATARS } from '@/lib/user/avatar-config'

interface BuiltinAvatarPickerProps {
  currentAvatar?: string | null
  onAvatarUpdate: (url: string) => void
  /** compact：设置页用的紧凑布局 */
  variant?: 'default' | 'compact'
}

/**
 * 内置头像选择器。
 * 用于「自定义头像上传」临时关闭期间，用户从本站内置头像库（public/avatars/）
 * 中选择；选择后立即通过 PUT /api/users/profile 落库。
 */
export default function BuiltinAvatarPicker({
  currentAvatar,
  onAvatarUpdate,
  variant = 'default',
}: BuiltinAvatarPickerProps) {
  const isCompact = variant === 'compact'
  const [selected, setSelected] = useState<string>(currentAvatar ?? '')
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const persist = async (url: string) => {
    if (saving !== null || url === selected) return
    setError(null)
    setSaving(url)
    try {
      const res = await fetchWithCookie('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: url }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || '头像保存失败')
      setSelected(url)
      onAvatarUpdate(url)
    } catch (err: unknown) {
      setError(errorLike(err).message || '头像保存失败')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="w-full">
      <div
        className={
          isCompact
            ? 'flex flex-row gap-4 items-start'
            : 'flex flex-col md:flex-row gap-6 items-start'
        }
      >
        {/* 当前头像预览 */}
        <div
          className={`${
            isCompact ? 'w-20 h-20 border-2' : 'w-28 h-28 border-4'
          } rounded-full overflow-hidden border-border shadow-sm bg-muted flex items-center justify-center shrink-0`}
          role="img"
          aria-label={selected ? '当前头像' : '未设置头像'}
        >
          {selected ? (
            <Image
              src={selected}
              alt="当前头像"
              width={112}
              height={112}
              className="object-cover w-full h-full"
            />
          ) : (
            <span className="text-muted-foreground" aria-hidden="true">
              <ImageOff size={isCompact ? 24 : 36} />
            </span>
          )}
        </div>

        {/* 内置头像网格 */}
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            {!isCompact && <h3 className="text-section-title text-foreground">头像设置</h3>}
            <p className={`text-sm text-muted-foreground ${isCompact ? '' : 'mt-1'}`}>
              当前暂未开放自定义头像上传，请从下方内置头像中选择；如需恢复上传请联系管理员。
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-error text-sm bg-error/10 p-3 rounded-md">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div
            className="grid grid-cols-4 sm:grid-cols-6 gap-3"
            role="group"
            aria-label="内置头像列表"
          >
            {BUILTIN_AVATARS.map((url, index) => {
              const isActive = selected === url
              const isSaving = saving === url
              return (
                <button
                  key={url}
                  type="button"
                  disabled={saving !== null}
                  onClick={() => void persist(url)}
                  aria-pressed={isActive}
                  aria-label={`选择内置头像 ${index + 1}`}
                  title={`内置头像 ${index + 1}`}
                  className={`relative aspect-square rounded-full overflow-hidden border transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed ${
                    isActive
                      ? 'border-primary ring-2 ring-primary'
                      : 'border-border hover:border-primary/60'
                  }`}
                >
                  <Image
                    src={url}
                    alt={`内置头像 ${index + 1}`}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                  {isSaving && (
                    <span
                      className="absolute inset-0 bg-background/60 flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <Loader2 size={16} className="animate-spin text-primary" />
                    </span>
                  )}
                  {isActive && !isSaving && (
                    <span
                      className="absolute bottom-0.5 right-0.5 bg-primary text-primary-foreground rounded-full p-0.5"
                      aria-hidden="true"
                    >
                      <Check size={10} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {selected && (
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void persist('')}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 focus:outline-none"
            >
              {saving === '' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ImageOff size={14} />
              )}
              清除头像（使用默认样式）
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
