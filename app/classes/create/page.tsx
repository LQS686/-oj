'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Globe, Lock, Check } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { canCreateClass } from '@/lib/permissions'
import { EducationalPageShell } from '@/components/common'

export default function CreateClassPage() {
  const router = useRouter()
  const { user } = useUser()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user && !canCreateClass(user)) {
      toast.error('权限不足：只有教师和管理员可以创建班级')
      router.push('/classes')
    }
  }, [user, router])

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    avatar: '',
    isPublic: true,
    maxMembers: 50,
  })

  if (!user) {
    return (
      <EducationalPageShell title="创建班级" icon={Users} backHref="/classes" backLabel="返回班级列表" width="narrow">
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <p className="text-foreground font-semibold mb-2">请先登录</p>
          <p className="text-muted-foreground text-sm mb-6">登录后即可创建班级</p>
          <Link href="/login" className="btn btn-primary">
            前往登录
          </Link>
        </div>
      </EducationalPageShell>
    )
  }

  if (!canCreateClass(user)) {
    return (
      <EducationalPageShell title="创建班级" icon={Users} backHref="/classes" backLabel="返回班级列表" width="narrow">
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <p className="text-foreground font-semibold mb-2">权限不足</p>
          <p className="text-muted-foreground text-sm mb-6">只有教师和管理员可以创建班级</p>
          <Link href="/classes" className="btn btn-primary">
            返回班级列表
          </Link>
        </div>
      </EducationalPageShell>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim()) {
      setError('请输入班级名称')
      return
    }

    if (formData.name.length < 2) {
      setError('班级名称至少需要2个字符')
      return
    }

    if (formData.name.length > 20) {
      setError('班级名称不能超过20个字符')
      return
    }

    if (formData.maxMembers < 2 || formData.maxMembers > 200) {
      setError('班级人数限制应在2-200之间')
      return
    }

    try {
      setLoading(true)

      const response = await fetchWithAuth('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (data.success) {
        router.push(`/classes/${data.data.id}`)
      } else {
        setError(data.error || '创建失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <EducationalPageShell
      title="创建班级"
      description="建立学习班级，与伙伴一起进步"
      icon={Users}
      backHref="/classes"
      backLabel="返回班级列表"
      width="narrow"
    >
      <div className="bg-card rounded-lg border border-border p-6 md:p-8">
        {error && (
          <div className="mb-6 p-4 rounded-lg border border-error/30 bg-error/5">
            <p className="text-error text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              班级名称 <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="输入班级名称（2-20个字符）"
              className="input"
              maxLength={20}
              required
            />
            <p className="text-sm text-muted-foreground mt-1.5">{formData.name.length} / 20</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">班级描述</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="介绍一下你的班级..."
              rows={4}
              className="input min-h-[120px] resize-none"
              maxLength={500}
            />
            <p className="text-sm text-muted-foreground mt-1.5">{formData.description.length} / 500</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">班级头像（URL）</label>
            <div className="flex gap-4">
              <input
                type="url"
                value={formData.avatar}
                onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                placeholder="https://example.com/avatar.png"
                className="input flex-1"
              />
              {formData.avatar ? (
                <img
                  src={formData.avatar}
                  alt="头像预览"
                  className="w-12 h-12 rounded-full object-cover border border-border"
                  onError={(e) => {
                    e.currentTarget.src = ''
                    setFormData({ ...formData, avatar: '' })
                    setError('头像加载失败，请检查URL')
                  }}
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1.5">留空则使用默认头像</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">最大成员数</label>
            <input
              type="number"
              value={formData.maxMembers}
              onChange={(e) => setFormData({ ...formData, maxMembers: parseInt(e.target.value, 10) || 50 })}
              min={2}
              max={200}
              className="input"
            />
            <p className="text-sm text-muted-foreground mt-1.5">班级可容纳的最大人数（2-200）</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-3">班级可见性</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isPublic: true })}
                className={`p-4 rounded-lg border text-left transition-colors ${
                  formData.isPublic
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      formData.isPublic ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                  </div>
                  <div className="font-medium text-foreground text-sm">公开班级</div>
                  {formData.isPublic && <Check className="w-4 h-4 text-primary ml-auto" />}
                </div>
                <p className="text-xs text-muted-foreground">在班级列表展示，用户可申请加入</p>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, isPublic: false })}
                className={`p-4 rounded-lg border text-left transition-colors ${
                  !formData.isPublic
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      !formData.isPublic ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="font-medium text-foreground text-sm">私有班级</div>
                  {!formData.isPublic && <Check className="w-4 h-4 text-primary ml-auto" />}
                </div>
                <p className="text-xs text-muted-foreground">不在列表显示，仅邀请加入</p>
              </button>
            </div>
          </div>

          <div className="rounded-lg p-4 border border-border bg-muted/30">
            <h3 className="text-sm font-semibold text-foreground mb-2">温馨提示</h3>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>创建后你将成为班级所有者（Owner）</li>
              <li>可邀请成员并设置管理员</li>
              <li>班级名称在全站范围内必须唯一</li>
            </ul>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => router.back()} className="btn btn-ghost flex-1">
              取消
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
              {loading ? '创建中...' : '创建班级'}
            </button>
          </div>
        </form>
      </div>
    </EducationalPageShell>
  )
}