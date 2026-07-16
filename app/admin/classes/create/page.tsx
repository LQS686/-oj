'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { Users, ArrowLeft, Save, Globe, Lock, Check, Megaphone, AlertCircle } from 'lucide-react'

const defaultForm = () => ({
  name: '',
  announcement: '',
  avatar: '',
  isPublic: true,
  maxMembers: 50,
})

export default function CreateClassPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState(defaultForm)

  useEffect(() => {
    const checkPermission = async () => {
      try {
        const response = await fetchWithAuth('/api/admin/classes')
        if (response.status === 403) {
          setDenied(true)
          setTimeout(() => router.push('/403'), 2000)
        }
      } catch (err) {
        logger.error('权限校验失败', err)
      } finally {
        setChecking(false)
      }
    }
    checkPermission()
  }, [router])

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
      const response = await fetchWithAuth('/api/classes', {
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
        router.push('/admin/classes')
      } else {
        setError(data.error || data.message || '创建失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-error text-lg mb-2">需要管理员权限</p>
          <p className="text-muted-foreground">正在跳转...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/admin/classes')}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-primary-light" />
          新建班级
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card-static rounded-lg p-6 space-y-6">
          {error && (
            <div className="bg-error/10 text-error p-4 rounded-xl text-sm flex items-center gap-2 border border-error/20">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                班级名称 <span className="text-error">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input"
                placeholder="2–20 个字符，全站唯一"
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground mt-1">{formData.name.length} / 20</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                <Megaphone className="w-4 h-4 text-muted-foreground" />
                班级公告
              </label>
              <textarea
                value={formData.announcement}
                onChange={(e) => setFormData({ ...formData, announcement: e.target.value })}
                placeholder="选填，成员在班级概览可见"
                rows={3}
                className="input resize-none"
                maxLength={2000}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">头像 URL</label>
              <input
                type="url"
                value={formData.avatar}
                onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                placeholder="选填"
                className="input"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">最大成员数</label>
                <input
                  type="number"
                  value={formData.maxMembers}
                  onChange={(e) => setFormData({ ...formData, maxMembers: parseInt(e.target.value, 10) || 50 })}
                  min={2}
                  max={200}
                  className="input max-w-[8rem]"
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
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary px-8 py-3"
          >
            <Save className="w-5 h-5" />
            {loading ? '创建中...' : '创建班级'}
          </button>
        </div>
      </form>
    </div>
  )
}
