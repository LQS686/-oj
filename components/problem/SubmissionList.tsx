import React from 'react'
import { Clock, MemoryStick, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getStatusConfig } from '@/lib/status'

interface SubmissionListProps {
  submissions: any[]
  loading: boolean
  error: string | null
  user: any
  fromAssignment: string | null
  classId: string | null
  onSelect: (submission: any) => void
}

export default function SubmissionList({
  submissions,
  loading,
  error,
  user,
  fromAssignment,
  classId,
  onSelect
}: SubmissionListProps) {
  const router = useRouter()

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="relative w-12 h-12 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
        </div>
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6 text-error" />
        </div>
        <p className="text-error">{error}</p>
      </div>
    )
  }

  if (submissions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">
          {user ? '你还没有提交过这道题目' : '请登录后查看提交记录'}
        </p>
      </div>
    )
  }



  return (
    <div className="space-y-3">
      {submissions.map((sub: any) => {
        const statusConfig = getStatusConfig(sub.status)
        
        return (
          <div
            key={sub.id}
            className="card-static p-4 cursor-pointer hover:bg-primary/5 transition-colors rounded-xl"
            onClick={() => {
              if (fromAssignment && classId) {
                onSelect(sub)
              } else {
                router.push(`/submission/${sub.id}`)
              }
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${statusConfig.className}`}>
                  <span className={`${statusConfig.iconBg} p-0.5 rounded`}>
                    {statusConfig.icon}
                  </span>
                  {sub.status}
                </span>
                <span className="text-sm text-muted-foreground font-mono">
                  {sub.language}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {new Date(sub.submittedAt).toLocaleString('zh-CN')}
              </div>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>{sub.time}ms</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MemoryStick className="w-4 h-4" />
                <span>{sub.memory}KB</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">{sub.score}</span>
                <span>分</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{sub.passedTests}/{sub.totalTests}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
