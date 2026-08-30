'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { AdminPageShell } from '@/components/admin'
import AdminObjectiveQuestionForm from '@/components/admin/AdminObjectiveQuestionForm'

export default function AdminEditObjectiveQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  return (
    <AdminPageShell width="wide" className="pb-10">
      {/* 页头：标题 + 返回列表链接 */}
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/objective-questions"
          className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          aria-label="返回客观题列表"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            编辑客观题
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            修改题干、选项与标准答案
          </p>
        </div>
      </header>

      {/* 加载与 404 处理均在表单内部（PageLoading / 提示后返回列表） */}
      <AdminObjectiveQuestionForm mode="edit" questionId={id} />
    </AdminPageShell>
  )
}
