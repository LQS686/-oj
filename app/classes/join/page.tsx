'use client'

import Link from 'next/link'
import { Users } from 'lucide-react'
import { EducationalPageShell } from '@/components/common'

/** 邀请码加入已下线 */
export default function JoinClassDeprecatedPage() {
  return (
    <EducationalPageShell title="加入班级" icon={Users} backHref="/classes" width="narrow">
      <div className="card-static rounded-lg border border-border p-8 text-center space-y-4">
        <p className="text-foreground font-medium">邀请码加入已取消</p>
        <p className="text-sm text-muted-foreground">
          加入班级请使用：<strong className="text-foreground">管理员按用户名邀请</strong>（在通知中接受），或在
          <strong className="text-foreground">公开班级列表</strong>中提交加入申请。
        </p>
        <Link href="/classes" className="btn btn-primary inline-flex">
          前往班级列表
        </Link>
      </div>
    </EducationalPageShell>
  )
}