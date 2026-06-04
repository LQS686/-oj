'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shield, AlertCircle, Info, ArrowLeft } from 'lucide-react'
import type { TeamMember, TeamPermissions } from '@/types/models'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'

type Permissions = TeamPermissions

const permissionDescriptions: Record<keyof Permissions, { title: string; description: string }> = {
  canViewProblems: {
    title: '查看题目',
    description: '允许成员查看团队共享的题目'
  },
  canSubmit: {
    title: '提交代码',
    description: '允许成员提交代码到题目'
  },
  canViewNotes: {
    title: '查看笔记',
    description: '允许成员查看团队笔记'
  },
  canCreateNotes: {
    title: '创建笔记',
    description: '允许成员创建和发布笔记'
  },
  canManageAssignments: {
    title: '管理作业',
    description: '允许成员创建、编辑和删除作业'
  },
  canInviteMembers: {
    title: '邀请成员',
    description: '允许成员创建邀请码并邀请新成员'
  },
  canManageMembers: {
    title: '管理成员',
    description: '允许成员管理其他成员的权限（仅管理员）'
  },
  canViewStats: {
    title: '查看统计',
    description: '允许成员查看团队统计数据'
  }
}

export default function MemberPermissionsPage() {
  const params = useParams()
  const router = useRouter()
  const [permissions, setPermissions] = useState<Permissions>({
    canViewProblems: true,
    canSubmit: true,
    canViewNotes: true,
    canCreateNotes: false,
    canManageAssignments: false,
    canInviteMembers: false,
    canManageMembers: false,
    canViewStats: false
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [memberInfo, setMemberInfo] = useState<TeamMember | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('')

  useEffect(() => {
    fetchMemberInfo()
  }, [])

  const fetchMemberInfo = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    try {
      const response = await fetchWithAuth(`/api/teams/${params.id}`)

      if (response.ok) {
        const data = await response.json()
        const member = data.data.members?.find((m: TeamMember) => m.id === params.memberId)
        
        if (member) {
          setMemberInfo(member)
          if (member.permissions) {
            setPermissions(member.permissions)
          }
        }

        const currentMember = data.data.members?.find((m: TeamMember) => m.userId === data.data.currentUserId)
        if (currentMember) {
          setCurrentUserRole(currentMember.role)
        }
      } else {
        alert('获取成员信息失败')
      }
    } catch (error) {
      console.error('获取成员信息失败:', error)
      alert('获取成员信息失败')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePermission = (key: keyof Permissions) => {
    setPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const handleSavePermissions = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/login')
      return
    }

    if (!confirm('确定要修改该成员的权限吗？')) {
      return
    }

    setSaving(true)

    try {
      const response = await fetchWithAuth(
        `/api/teams/${params.id}/members/${params.memberId}/permissions`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ permissions })
        }
      )

      if (response.ok) {
        alert('权限更新成功！')
        router.push(`/teams/${params.id}/members`)
      } else {
        const data = await response.json()
        alert(data.error || '权限更新失败')
      }
    } catch (error) {
      logger.error('权限更新失败', error)
      alert('权限更新失败')
    } finally {
      setSaving(false)
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
          <p className="text-muted-foreground text-lg">加载权限配置中...</p>
        </div>
      </div>
    )
  }

  if (currentUserRole !== 'admin' && currentUserRole !== 'owner') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center card-static rounded-2xl p-12 max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <p className="text-error text-lg mb-6">权限不足</p>
          <button
            onClick={() => router.push(`/teams/${params.id}/members`)}
            className="btn btn-primary"
          >
            返回成员列表
          </button>
        </div>
      </div>
    )
  }

  if (!memberInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-error">成员不存在</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-2 text-sm mb-6">
          <Link
            href={`/teams/${params.id}`}
            className="text-muted-foreground hover:text-primary-light transition-colors"
          >
            团队详情
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <Link
            href={`/teams/${params.id}/members`}
            className="text-muted-foreground hover:text-primary-light transition-colors"
          >
            成员管理
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">权限配置</span>
        </div>

        <div className="card-static rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">配置成员权限</h1>
              <p className="text-muted-foreground text-sm">
                成员: {memberInfo.username || memberInfo.nickname}
                {' · '}
                角色: {memberInfo.role === 'owner' ? '所有者' : memberInfo.role === 'admin' ? '管理员' : '普通成员'}
              </p>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 mb-6 border border-primary/20">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Info className="w-5 h-5 text-primary-light" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-2">权限说明</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 所有者拥有所有权限，无法修改</li>
                <li>• 管理员权限由所有者分配</li>
                <li>• 修改权限后将立即生效</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="card-static rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">权限配置</h2>
          </div>

          <div className="divide-y divide-border">
            {(Object.keys(permissionDescriptions) as Array<keyof Permissions>).map((key) => {
              const permission = permissionDescriptions[key]
              const isDisabled = memberInfo.role === 'owner' || 
                               (memberInfo.role === 'admin' && key === 'canManageMembers')

              return (
                <div key={key} className={`px-6 py-4 ${isDisabled ? 'bg-muted/30' : 'hover:bg-muted/30'} transition-colors`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-foreground">
                          {permission.title}
                        </h3>
                        {isDisabled && (
                          <span className="tag text-xs">
                            {memberInfo.role === 'owner' ? '所有者默认拥有' : '管理员默认拥有'}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {permission.description}
                      </p>
                    </div>

                    <div className="ml-4">
                      <button
                        onClick={() => handleTogglePermission(key)}
                        disabled={isDisabled}
                        className={`
                          relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
                          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background
                          ${permissions[key] ? 'bg-primary' : 'bg-muted'}
                          ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        <span
                          className={`
                            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
                            transition duration-200 ease-in-out
                            ${permissions[key] ? 'translate-x-5' : 'translate-x-0'}
                          `}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-4">
          <button
            onClick={() => router.push(`/teams/${params.id}/members`)}
            className="btn btn-ghost"
          >
            取消
          </button>
          <button
            onClick={handleSavePermissions}
            disabled={saving || memberInfo.role === 'owner'}
            className={`btn ${memberInfo.role === 'owner' ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'btn-primary'}`}
          >
            {saving ? '保存中...' : '保存权限'}
          </button>
        </div>

        {memberInfo.role === 'owner' && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            所有者拥有所有权限，无法修改
          </div>
        )}
      </div>
    </div>
  )
}
