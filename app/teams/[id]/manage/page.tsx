'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { Settings, Users, Mail, ArrowLeft, ClipboardList, AlertCircle } from 'lucide-react'

export default function TeamManagePage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    checkPermission()
  }, [user, params.id])

  const checkPermission = async () => {
    try {
      const response = await fetchWithAuth(`/api/teams/${params.id}`)

      const data = await response.json()

      if (!data.success) {
        setError('获取团队信息失败')
        setLoading(false)
        return
      }

      const currentMember = data.data.members.find((m: any) => m.userId === user?.id)
      if (!currentMember) {
        setError('您不是团队成员')
        setLoading(false)
        return
      }

      const admin = ['owner', 'admin'].includes(currentMember.role)
      setIsAdmin(admin)

      if (!admin) {
        setError('只有管理员可以访问管理页面')
      }
    } catch (err) {
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center card-static rounded-2xl p-12 max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <p className="text-error text-lg mb-6">{error}</p>
          <button
            onClick={() => router.push(`/teams/${params.id}`)}
            className="btn-primary btn"
          >
            返回团队详情
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <button
          onClick={() => router.push(`/teams/${params.id}`)}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary-light mb-6 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          返回团队详情
        </button>

          <div className="card-static rounded-2xl p-8">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">团队管理</h1>
              <p className="text-muted-foreground text-sm">管理团队设置和内容</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={() => router.push(`/teams/${params.id}/members`)}
              className="card p-6 text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6 text-primary-light" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-foreground text-lg mb-1 group-hover:text-primary-light transition-colors">成员管理</div>
                  <div className="text-sm text-muted-foreground">
                    查看成员列表、管理权限、查看成员活动统计
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push(`/teams/${params.id}/invites`)}
              className="card p-6 text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Mail className="w-6 h-6 text-purple-400" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-foreground text-lg mb-1 group-hover:text-purple-400 transition-colors">邀请管理</div>
                  <div className="text-sm text-muted-foreground">
                    创建邀请码、查看邀请记录、管理邀请链接
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push(`/teams/${params.id}/requests`)}
              className="card p-6 text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-secondary/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ClipboardList className="w-6 h-6 text-secondary-light" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-foreground text-lg mb-1 group-hover:text-secondary-light transition-colors">申请管理</div>
                  <div className="text-sm text-muted-foreground">
                    审批加入申请、查看申请记录、管理申请状态
                  </div>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={() => router.push(`/teams/${params.id}/assignments`)}
              className="card p-6 text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ClipboardList className="w-6 h-6 text-primary-light" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-foreground text-lg mb-1 group-hover:text-primary-light transition-colors">
                    作业与训练
                  </div>
                  <div className="text-sm text-muted-foreground">
                    管理团队作业、查看完成情况，帮助同学按阶段完成训练计划。
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push(`/teams/${params.id}/points`)}
              className="card p-6 text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-secondary/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Settings className="w-6 h-6 text-secondary-light" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-foreground text-lg mb-1 group-hover:text-secondary-light transition-colors">
                    积分与激励
                  </div>
                  <div className="text-sm text-muted-foreground">
                    查看积分规则与明细，通过积分商城配置激励方案，提升课堂参与度。
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
