'use client'

import { useState, useCallback, useEffect } from 'react'
import { Users, Globe, Lock, Check, Megaphone, AlertCircle, Edit } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { CreateModalShell } from '@/components/common'
import { useDialog } from '@/components/common/DialogProvider'

const defaultForm = () => ({
  name: '',
  announcement: '',
  avatar: '',
  isPublic: true,
  maxMembers: 50,
})

export default function AdminCreateClassModal({
  open,
  onClose,
  onCreated,
  onSaved,
  /** 传入则为编辑模式 */
  classId = null,
}: {
  open: boolean
  onClose: () => void
  onCreated?: () => void
  onSaved?: () => void
  classId?: string | null
}) {
  const dialog = useDialog()
  const isEdit = !!classId

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState(defaultForm)

  const resetForm = useCallback(() => {
    setFormData(defaultForm())
    setError('')
    setSubmitting(false)
    setLoading(false)
  }, [])

  const applyClass = useCallback((cls: Record<string, unknown>) => {
    setFormData({
      name: typeof cls.name === 'string' ? cls.name : '',
      announcement:
        typeof cls.announcement === 'string'
          ? cls.announcement
          : typeof cls.description === 'string'
            ? cls.description
            : '',
      avatar: typeof cls.avatar === 'string' ? cls.avatar : '',
      isPublic: cls.isPublic !== false,
      maxMembers: typeof cls.maxMembers === 'number' ? cls.maxMembers : 50,
    })
  }, [])

  useEffect(() => {
    if (!open) return

    if (!isEdit || !classId) {
      resetForm()
      return
    }

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await fetchWithCookie(`/api/admin/classes/${classId}`)
        const data = await response.json()
        if (cancelled) return
        if (!response.ok || !data.success) {
          const msg = data.error?.message || data.error || data.message || '获取班级失败'
          await dialog.alert({
            tone: 'error',
            message: typeof msg === 'string' ? msg : '获取班级失败',
          })
          onClose()
          return
        }
        applyClass(data.data)
      } catch (err) {
        logger.error('AdminCreateClassModal load failed', err)
        if (!cancelled) {
          await dialog.alert({ tone: 'error', message: '网络错误，请稍后重试' })
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, isEdit, classId, resetForm, applyClass, dialog, onClose])

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
      setSubmitting(true)
      if (isEdit && classId) {
        const response = await fetchWithCookie(`/api/admin/classes/${classId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name.trim(),
            description: formData.announcement.trim() || null,
            announcement: formData.announcement.trim() || null,
            avatar: formData.avatar.trim() || null,
            isPublic: formData.isPublic,
            maxMembers: formData.maxMembers,
          }),
        })
        const data = await response.json()
        if (data.success) {
          onSaved?.()
          onClose()
        } else {
          setError(data.error || data.message || '保存失败')
        }
      } else {
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
        if (data.success) {
          onCreated?.()
          onClose()
        } else {
          setError(data.error || data.message || '创建失败')
        }
      }
    } catch (err) {
      logger.error('AdminCreateClassModal submit failed', err)
      setError('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CreateModalShell
      open={open}
      onClose={onClose}
      title={isEdit ? '编辑班级' : '创建班级'}
      icon={isEdit ? Edit : Users}
      labelledById={isEdit ? 'admin-edit-class-title' : 'admin-create-class-title'}
      variant="admin"
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          加载中…
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
            {error && (
              <div className="p-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                班级名称 <span className="text-error">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input w-full"
                placeholder="2–20 个字符，全站唯一"
                maxLength={20}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">最大成员数</label>
                <input
                  type="number"
                  value={formData.maxMembers}
                  onChange={(e) =>
                    setFormData({ ...formData, maxMembers: parseInt(e.target.value, 10) || 50 })
                  }
                  min={2}
                  max={200}
                  className="input w-full max-w-[8rem]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">可见性</label>
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
            </div>
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-border shrink-0">
            <button type="submit" disabled={submitting} className="btn btn-primary flex-1">
              {submitting ? (isEdit ? '保存中…' : '创建中…') : isEdit ? '保存' : '创建班级'}
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost">
              取消
            </button>
          </div>
        </form>
      )}
    </CreateModalShell>
  )
}
