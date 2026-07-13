'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shield, AlertCircle, Info } from 'lucide-react'
import type { ClassMember, ClassPermissions } from '@/types/models'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { useClass } from '@/hooks/useClass'

type Permissions = ClassPermissions

const permissionDescriptions: Record<keyof Permissions, { title: string; description: string }> = {
  canViewProblems: {
    title: '查看题目',
    description: '允许成员查看班级共享的题目',
  },
  canSubmit: {
    title: '提交代码',
    description: '允许成员提交代码到题目',
  },
  canViewNotes: {
    title: '查看笔记',
    description: '允许成员查看班级笔记',
  },
  canCreateNotes: {
    title: '创建笔记',
    description: '允许成员创建和发布笔记',
  },
  canManageAssignments: {
    title: '管理作业',
    description: '允许成员创建、编辑和删除作业',
  },
  canInviteMembers: {
    title: '邀请成员',
    description: '允许成员通过用户名邀请新成员',
  },
  canManageMembers: {
    title: '管理成员',
    description: '允许成员管理其他成员的权限（仅管理员）',
  },
  canViewStats: {
    title: '查看统计',
    description: '允许成员查看班级统计数据',
  },
}

function roleLabel(role?: string) {
  if (role === 'owner') return '所有者'
  if (role === 'assistant') return '管理员'
  return '普通成员'
}

export default function MemberPermissionsPage() {
  const params = useParams()
  const router = useRouter()
  const classId = params.id as string
  const memberId = params.memberId as string
  const { classData } = useClass(classId)

  const [permissions, setPermissions] = useState<Permissions>({
    canViewProblems: true,
    canSubmit: true,
    canViewNotes: true,
    canCreateNotes: false,
    canManageAssignments: false,
    canInviteMembers: false,
    canManageMembers: false,
    canViewStats: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [memberInfo, setMemberInfo] = useState<ClassMember | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('')

  useEffect(() => {
    fetchMemberInfo()
  }, [classId, memberId])

  const fetchMemberInfo = async () => {
    try {
      const response = await fetchWithAuth(`/api/classes/${classId}`)

      if (response.status === 401) {
        router.push('/login')
        return
      }

      if (response.ok) {
        const data = await response.json()
        const member = data.data.members?.find((m: ClassMember) => m.id === memberId)

        if (member) {
          setMemberInfo(member)
          if (member.permissions) {
            setPermissions(member.permissions)
          }
        }

        const currentMember = data.data.members?.find(
          (m: ClassMember) => m.userId === data.data.currentUserId
        )
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
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSavePermissions = async () => {
    if (!confirm('确定要修改该成员的权限吗？')) {
      return
    }

    setSaving(true)

    try {
      const response = await fetchWithAuth(
        `/api/classes/${classId}/members/${memberId}/permissions`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions }),
        }
      )

      if (response.status === 401) {
        router.push('/login')
        return
      }

      if (response.ok) {
        alert('权限更新成功！')
        router.push(`/classes/${classId}/members`)
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
    return <PageLoading label="加载权限配置中..." />
  }

  if (currentUserRole !== 'assistant' && currentUserRole !== 'owner') {
    return (
      <ClassWorkspaceShell
        classId={classId}
        className={classData?.name}
        title="权限配置"
        icon={Shield}
      >
        <div className="card-static rounded-lg p-8 text-center border border-border">
          <AlertCircle className="w-10 h-10 text-error mx-auto mb-3" />
          <p className="text-error mb-4">权限不足</p>
          <Link href={`/classes/${classId}/members`} className="btn btn-primary">
            返回成员列表
          </Link>
        </div>
      </ClassWorkspaceShell>
    )
  }

  if (!memberInfo) {
    return (
      <ClassWorkspaceShell classId={classId} className={classData?.name} title="权限配置" icon={Shield}>
        <p className="text-error text-center py-8">成员不存在</p>
      </ClassWorkspaceShell>
    )
  }

  const memberName = memberInfo.nickname || memberInfo.username

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title="配置成员权限"
      description={`${memberName} · ${roleLabel(memberInfo.role)}`}
      icon={Shield}
      width="narrow"
      actions={
        <Link href={`/classes/${classId}/members`} className="btn btn-ghost btn-sm">
          成员列表
        </Link>
      }
    >
      <div className="rounded-lg border border-border bg-muted/30 p-4 mb-4 flex gap-3">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>所有者拥有所有权限，无法修改</li>
          <li>管理员权限由所有者分配</li>
          <li>修改权限后将立即生效</li>
        </ul>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">权限项</h2>
        </div>

        <div className="divide-y divide-border">
          {(Object.keys(permissionDescriptions) as Array<keyof Permissions>).map((key) => {
            const permission = permissionDescriptions[key]
            const isDisabled =
              memberInfo.role === 'owner' ||
              (memberInfo.role === 'assistant' && key === 'canManageMembers')

            return (
              <div
                key={key}
                className={`px-4 py-3 flex items-center justify-between gap-4 ${
                  isDisabled ? 'bg-muted/50' : 'hover:bg-muted'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-medium text-foreground">{permission.title}</h3>
                    {isDisabled && (
                      <span className="tag text-xs">
                        {memberInfo.role === 'owner' ? '所有者默认拥有' : '管理员默认拥有'}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{permission.description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleTogglePermission(key)}
                  disabled={isDisabled}
                  className={`
                    relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
                    transition-colors focus:outline-none focus:ring-2 focus:ring-primary
                    ${permissions[key] ? 'bg-primary' : 'bg-muted'}
                    ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <span
                    className={`
                      pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow
                      transition duration-200
                      ${permissions[key] ? 'translate-x-5' : 'translate-x-0'}
                    `}
                  />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Link href={`/classes/${classId}/members`} className="btn btn-ghost">
          取消
        </Link>
        <button
          type="button"
          onClick={handleSavePermissions}
          disabled={saving || memberInfo.role === 'owner'}
          className="btn btn-primary"
        >
          {saving ? '保存中...' : '保存权限'}
        </button>
      </div>

      {memberInfo.role === 'owner' && (
        <p className="mt-3 text-center text-sm text-muted-foreground">所有者拥有所有权限，无法修改</p>
      )}
    </ClassWorkspaceShell>
  )
}