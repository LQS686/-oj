'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { fetchWithCookie } from '@/lib/api/base'
import { useUser } from '@/contexts/UserContext'
import { formatDateTime } from '@/lib/utils'
import { loginPath } from '@/lib/navigation'
import { SubmissionStatus } from '@/lib/constants/submission-status'
interface Submission {
 id: string
 problemId: string
 problem: {
 id: string
 title: string
 problemNumber: string
 }
 userId: string
 user: {
 id: string
 username: string
 nickname: string
 }
 status: string
 language: string
 time: number
 memory: number
 submittedAt: string
}

export default function ContestSubmissionsPage() {
 const params = useParams()
 const router = useRouter()
 const { user, isLoading: userLoading } = useUser()
 const [submissions, setSubmissions] = useState<Submission[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [page, setPage] = useState(1)
 const [totalPages, setTotalPages] = useState(1)

 const fetchSubmissions = useCallback(async () => {
 try {
 setLoading(true)
 const res = await fetchWithCookie(`/api/contests/${params.id}/submissions?page=${page}&limit=20`)
 const data = await res.json()
 
 if (data.success) {
 setSubmissions(data.data.submissions || [])
 setTotalPages(data.data.pagination?.totalPages || Math.ceil((data.data.pagination?.total || 0) / 20))
 } else {
 setError(data.error)
 setSubmissions([])
 setTotalPages(1)
 }
 } catch {
 setError('加载失败')
 setSubmissions([])
 setTotalPages(1)
 } finally {
 setLoading(false)
 }
 }, [params.id, page])

 // 鉴权：竞赛提交记录需登录后查看
 useEffect(() => {
 if (userLoading) return
 if (!user) {
   router.replace(loginPath(`/contests/${params.id}/submissions`))
 }
 }, [userLoading, user, params.id, router])

 useDeferredEffect(() => {
 if (userLoading) return
 if (!user) return
 void fetchSubmissions()
 }, [userLoading, user, fetchSubmissions])

 const getStatusColor = (status: string) => {
 switch (status) {
 case SubmissionStatus.ACCEPTED:
 return 'bg-secondary/20 text-secondary'
 case SubmissionStatus.WRONG_ANSWER:
 return 'bg-error/20 text-error'
 case SubmissionStatus.TIME_LIMIT_EXCEEDED:
 return 'bg-accent/20 text-accent'
 case SubmissionStatus.MEMORY_LIMIT_EXCEEDED:
 return 'bg-accent/20 text-accent'
 case SubmissionStatus.RUNTIME_ERROR:
 return 'bg-error/20 text-error'
 case SubmissionStatus.COMPILE_ERROR:
 return 'bg-muted text-muted-foreground'
 case SubmissionStatus.PENDING:
 case SubmissionStatus.JUDGING:
 case SubmissionStatus.RUNNING:
 return 'bg-primary/20 text-primary'
 default:
 return 'bg-muted text-muted-foreground'
 }
 }

 // 鉴权未完成时显示加载占位
 if (userLoading || !user) {
   return (
     <div className="card p-8">
       <div className="animate-pulse space-y-4">
         {[1, 2, 3, 4, 5].map(i => (
           <div key={i} className="h-12 bg-muted rounded"></div>
         ))}
       </div>
     </div>
   )
 }

 if (loading && submissions.length === 0) return (
 <div className="card p-8">
 <div className="animate-pulse space-y-4">
 {[1, 2, 3, 4, 5].map(i => (
 <div key={i} className="h-12 bg-muted rounded"></div>
 ))}
 </div>
 </div>
 )

 if (error) return (
 <div className="card p-8 text-center text-error">
 {error}
 </div>
 )

 return (
 <div className="card overflow-hidden">
 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-border">
 <thead className="bg-muted">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">提交时间</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">题目</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">用户</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">状态</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">语言</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">耗时</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">内存</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {submissions.map((sub) => (
 <tr key={sub.id} className="hover:bg-muted">
 <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
 {formatDateTime(sub.submittedAt)}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
 <Link 
 href={`/contests/${params.id}/problems?problem=${encodeURIComponent(sub.problemId)}`}
 className="text-primary hover:text-primary-light"
 >
 {sub.problem.problemNumber || 'P?'} {sub.problem.title}
 </Link>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
 {sub.user.nickname || sub.user.username}
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(sub.status)}`}>
 {sub.status}
 </span>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
 {sub.language}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
 {sub.time}ms
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
 {Math.round(sub.memory / 1024)}MB
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {totalPages > 1 && (
 <div className="px-4 py-3 flex items-center justify-between border-t border-border sm:px-6">
 <div className="flex-1 flex justify-between sm:hidden">
 <button
 onClick={() => setPage(Math.max(1, page - 1))}
 disabled={page === 1}
 className="relative inline-flex items-center px-4 py-2 border border-border text-sm font-medium rounded-md text-foreground bg-muted hover:bg-muted/80 disabled:opacity-50"
 >
 上一页
 </button>
 <button
 onClick={() => setPage(Math.min(totalPages, page + 1))}
 disabled={page === totalPages}
 className="ml-3 relative inline-flex items-center px-4 py-2 border border-border text-sm font-medium rounded-md text-foreground bg-muted hover:bg-muted/80 disabled:opacity-50"
 >
 下一页
 </button>
 </div>
 <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
 <div>
 <p className="text-sm text-muted-foreground">
 页码 <span className="font-medium text-foreground">{page}</span> / <span className="font-medium text-foreground">{totalPages}</span>
 </p>
 </div>
 <div>
 <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
 <button
 onClick={() => setPage(Math.max(1, page - 1))}
 disabled={page === 1}
 className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-border bg-muted text-sm font-medium text-foreground hover:bg-muted/80 disabled:opacity-50"
 >
 上一页
 </button>
 <button
 onClick={() => setPage(Math.min(totalPages, page + 1))}
 disabled={page === totalPages}
 className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-border bg-muted text-sm font-medium text-foreground hover:bg-muted/80 disabled:opacity-50"
 >
 下一页
 </button>
 </nav>
 </div>
 </div>
 </div>
 )}
 </div>
 )
}
