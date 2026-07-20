'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Globe, Lock, Check, Megaphone, X } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'

const defaultForm = () => ({
  name: '',
  announcement: '',
  avatar: '',
  isPublic: true,
  maxMembers: 50,
})

export default function CreateClassModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  /** 创建成功并跳转前可选刷新列表 */
  onCreated?: () => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState(defaultForm)

  const resetForm = useCallback(() => {
    setFormData(defaultForm())
    setError('')
  }, [])

  useEffect(() => {
    if (!open) return
    resetForm()
  }, [open, resetForm])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim()) {
      setError('请输入班级名称')
      return
    }
    if (formData.name.trim().length < 2) {
      setError('班级名称至少需要 2 个字符')
      return
    }
    if (formData.name.trim().length > 20) {
      setError('班级名称不能超过 20 个字符')
      return
    }
    if (formData.maxMembers < 2 || formData.maxMembers > 200) {
      setError('班级人数限制应在 2–200 之间')
      return
    }

    try {
      setLoading(true)
      const response = await fetchWithCookie('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          announcement: formData.announcement.trim() || null,
          avatar: formData.avatar.trim() || undefined,
          isPublic: formData.isPublic,
          maxMembers: formData.maxMembers,
        }),
      })
      const data = await response.json()
      if (data.success && data.data?.id) {
        onCreated?.()
        onClose()
        router.push(`/classes/${data.data.id}`)
      } else {
        setError(data.error || data.message || '创建失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden bg-black/60 p-4 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card-static rounded-xl w-full max-w-lg max-h-[min(90dvh,calc(100dvh-2rem))] flex flex-col shadow-xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-class-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 id="create-class-title" className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-light" />
            创建班级
          </h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:bg-muted" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                班级名称 <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="2–20 个字符，全站唯一"
                className="input w-full"
                maxLength={20}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">{formData.name.length} / 20</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Megaphone className="w-4 h-4 text-muted-foreground" />
                班级公告
              </label>
              <textarea
                value={formData.announcement}
                onChange={(e) => setFormData({ ...formData, announcement: e.target.value })}
                placeholder="选填，成员在班级概览可见"
                rows={3}
                className="input w-full resize-none"
                maxLength={2000}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">头像 URL</label>
              <input
                type="url"
                value={formData.avatar}
                onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                placeholder="选填"
                className="input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">最大成员数</label>
              <input
                type="number"
                value={formData.maxMembers}
                onChange={(e) => setFormData({ ...formData, maxMembers: parseInt(e.target.value, 10) || 50 })}
                min={2}
                max={200}
                className="input w-full max-w-[8rem]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">可见性</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isPublic: true })}
                  className={`p-3 rounded-lg border text-left text-sm transition-colors ${
                    formData.isPublic ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Globe className="w-4 h-4" />
                    公开
                    {formData.isPublic && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">列表展示，可申请加入</p>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isPublic: false })}
                  className={`p-3 rounded-lg border text-left text-sm transition-colors ${
                    !formData.isPublic ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Lock className="w-4 h-4" />
                    私有
                    {!formData.isPublic && <Check className="w-4 h-4 text-primary ml-auto" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">仅邀请加入</p>
                </button>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error">{error}</div>
            )}
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? '创建中…' : '创建班级'}
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost">
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}