'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { Settings, Users, Mail, ClipboardList, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { useClass } from '@/hooks/useClass'

export default function ClassManagePage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const classId = params.id as string
  const { classData } = useClass(classId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    checkPermission()
  }, [user, classId])

  const checkPermission = async () => {
    try {
      const response = await fetchWithAuth(`/api/classes/${classId}`)
      const data = await response.json()

      if (!data.success) {
        setError('获取班级信息失败')
        setLoading(false)
        return
      }

      const currentMember = data.data.members.find((m: { userId: string }) => m.userId === user?.id)
      if (!currentMember) {
        setError('您不是班级成员')
        setLoading(false)
        return
      }

      const admin = ['owner', 'assistant'].includes(currentMember.role)
      setIsAdmin(admin)

      if (!admin) {
        setError('只有管理员可以访问管理页面')
      }
    } catch {
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <PageLoading label="加载中..." />
  }

  if (error || !isAdmin) {
    return (
      <ClassWorkspaceShell
        classId={classId}
        className={classData?.name}
        title="班级管理"
        icon={Settings}
      >
        <div className="card-static rounded-lg p-8 text-center border border-border">
          <AlertCircle className="w-10 h-10 text-error mx-auto mb-3" />
          <p className="text-error mb-4">{error || '无权限'}</p>
          <Link href={`/classes/${classId}`} className="btn btn-primary">
            返回班级概览
          </Link>
        </div>
      </ClassWorkspaceShell>
    )
  }

  const links = [
    {
      href: `/classes/${classId}/members`,
      icon: Users,
      title: '成员管理',
      desc: '成员列表、权限与活动统计',
    },
    {
      href: `/classes/${classId}/invites`,
      icon: Mail,
      title: '邀请管理',
      desc: '邀请码与邀请链接',
    },
    {
      href: `/classes/${classId}/requests`,
      icon: ClipboardList,
      title: '加入申请',
      desc: '审批学生加入班级',
    },
  ]

  return (
    <ClassWorkspaceShell
      classId={classId}
      className={classData?.name}
      title="班级管理"
      description="教学运营：成员、邀请与入班申请"
      icon={Settings}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card-static rounded-lg p-5 border border-border hover:border-primary transition-colors"
          >
            <item.icon className="w-6 h-6 text-primary mb-3" />
            <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
            <p className="text-sm text-muted-foreground">{item.desc}</p>
          </Link>
        ))}
      </div>
    </ClassWorkspaceShell>
  )
}