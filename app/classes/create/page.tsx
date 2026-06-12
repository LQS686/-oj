'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Upload, Users, Globe, Lock, Check } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { canCreateClass } from '@/lib/permissions'

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
    maxMembers: 50
  })

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground text-xl font-semibold mb-2">请先登录</p>
          <p className="text-muted-foreground mb-6">登录后即可创建班级</p>
          <Link href="/login" className="btn btn-primary">
            前往登录
          </Link>
        </div>
      </div>
    )
  }

  if (!canCreateClass(user)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground text-xl font-semibold mb-2">权限不足</p>
          <p className="text-muted-foreground mb-6">只有教师和管理员可以创建班级</p>
          <Link href="/classes" className="btn btn-primary">
            返回班级列表
          </Link>
        </div>
      </div>
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
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (data.success) {
        router.push(`/classes/${data.data.id}`)
      } else {
        setError(data.error || '创建失败')
      }
    } catch (err) {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link
          href="/classes"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary-light transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          返回班级列表
        </Link>

        <div className="card-static rounded-2xl p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
              <Users className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">创建班级</h1>
              <p className="text-muted-foreground mt-1">建立你的学习班级，与伙伴一起进步</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 card-static rounded-xl border border-error/30 bg-error/5">
              <p className="text-error">{error}</p>
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
              <p className="text-sm text-muted-foreground mt-1.5">
                {formData.name.length} / 20
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                班级描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="介绍一下你的班级..."
                rows={4}
                className="input min-h-[120px] resize-none"
                maxLength={500}
              />
              <p className="text-sm text-muted-foreground mt-1.5">
                {formData.description.length} / 500
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                班级头像（URL）
              </label>
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
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/20"
                    onError={(e) => {
                      e.currentTarget.src = ''
                      setFormData({ ...formData, avatar: '' })
                      setError('头像加载失败，请检查URL')
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1.5">
                留空则使用默认头像
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                最大成员数
              </label>
              <input
                type="number"
                value={formData.maxMembers}
                onChange={(e) => setFormData({ ...formData, maxMembers: parseInt(e.target.value) || 50 })}
                min="2"
                max="200"
                className="input"
              />
              <p className="text-sm text-muted-foreground mt-1.5">
                班级可容纳的最大人数（2-200）
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                班级可见性
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isPublic: true })}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    formData.isPublic
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      formData.isPublic ? 'bg-primary text-white' : 'bg-muted/50 text-muted-foreground'
                    }`}>
                      <Globe className="w-5 h-5" />
                    </div>
                    <div className="font-medium text-foreground">公开班级</div>
                    {formData.isPublic && (
                      <Check className="w-5 h-5 text-primary ml-auto" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    公开班级会在班级列表中展示，其他用户可以申请加入
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isPublic: false })}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    !formData.isPublic
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      !formData.isPublic ? 'bg-primary text-white' : 'bg-muted/50 text-muted-foreground'
                    }`}>
                      <Lock className="w-5 h-5" />
                    </div>
                    <div className="font-medium text-foreground">私有班级</div>
                    {!formData.isPublic && (
                      <Check className="w-5 h-5 text-primary ml-auto" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    私有班级不会在列表中显示，只能通过邀请加入
                  </p>
                </button>
              </div>
            </div>

            <div className="card-static rounded-xl p-5 border border-primary/20 bg-primary/5">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Check className="w-4 h-4 text-primary-light" />
                温馨提示
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary-light mt-0.5">•</span>
                  创建班级后，你将自动成为班级创建人（Owner）
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-light mt-0.5">•</span>
                  你可以邀请其他用户加入班级，并设置管理员
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-light mt-0.5">•</span>
                  班级名称在全站范围内必须唯一
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-light mt-0.5">•</span>
                  创建后可以在班级管理页面修改班级信息
                </li>
              </ul>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="btn btn-outline flex-1"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary flex-1"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    创建中...
                  </>
                ) : (
                  '创建班级'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
