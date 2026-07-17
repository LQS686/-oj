import { Clock, MemoryStick, AlertCircle, CheckCircle2, LogIn } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getStatusConfig } from '@/lib/status'
import { formatDateTime } from '@/lib/utils'
import type { Submission } from '@/types/models'
import type { UserData } from '@/lib/api/auth'

interface SubmissionListProps {
 submissions: Submission[]
 loading: boolean
 error: string | null
 user: UserData | null
 fromAssignment: string | null
 classId: string | null
 onSelect: (submission: Submission) => void
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
 <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
 <Clock className="w-6 h-6 text-muted-foreground" />
 </div>
 {user ? (
 <p className="text-muted-foreground">你还没有提交过这道题目</p>
 ) : (
 <div className="space-y-3">
 <p className="text-muted-foreground">请登录后查看提交记录</p>
 <Link
 href={`/login?redirect=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : '')}`}
 className="btn btn-primary btn-sm inline-flex items-center gap-2"
 >
 <LogIn className="w-4 h-4" />
 登录
 </Link>
 </div>
 )}
 </div>
 )
 }



 return (
 <div className="card-static rounded-lg overflow-hidden">
 {submissions.map((sub) => {
 const statusConfig = getStatusConfig(sub.status)

 return (
 <div
 key={sub.id}
 className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border hover:bg-primary/5 transition-colors cursor-pointer"
 onClick={() => {
 if (fromAssignment && classId) {
 onSelect(sub)
 } else {
 router.push(`/submission/${sub.id}`)
 }
 }}
 >
 {/* 状态 */}
 <div className="col-span-2 flex items-center">
 <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusConfig.className}`}>
 <span className={`${statusConfig.iconBg} p-0.5 rounded`}>
 {statusConfig.icon}
 </span>
 {sub.status}
 </span>
 </div>

 {/* 详情：语言 + 分数 + 通过测试 */}
 <div className="col-span-5 flex items-center gap-4 text-sm text-muted-foreground">
 <span className="font-mono">{sub.language}</span>
 <div className="flex items-center gap-1.5">
 <span className="font-semibold text-foreground">{sub.score}</span>
 <span>分</span>
 </div>
 <div className="flex items-center gap-1.5">
 <CheckCircle2 className="w-4 h-4" />
 <span>{sub.passedTests}/{sub.totalTests}</span>
 </div>
 </div>

 {/* 耗时 + 内存 */}
 <div className="col-span-2 flex items-center gap-3 text-sm text-muted-foreground">
 <div className="flex items-center gap-1.5">
 <Clock className="w-4 h-4" />
 <span>{sub.time}ms</span>
 </div>
 <div className="flex items-center gap-1.5">
 <MemoryStick className="w-4 h-4" />
 <span>{sub.memory}KB</span>
 </div>
 </div>

 {/* 提交时间 */}
 <div className="col-span-3 flex items-center justify-end text-sm text-muted-foreground">
 {formatDateTime(sub.submittedAt)}
 </div>
 </div>
 )
 })}
 </div>
 )
}
