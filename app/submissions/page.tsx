'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, User, Clock, Database, Calendar, CheckCircle, XCircle, AlertTriangle, Code, Clock as TimeIcon, Filter, X, Eye } from 'lucide-react'
import { formatTime, formatMemory } from '@/lib/utils'
import { getStatusColor, getStatusText } from '@/lib/status'
import { fetchWithAuth } from '@/lib/api/base'
import { EducationalPageShell, PageLoading } from '@/components/common'

interface Submission {
 id: string
 problem: {
 id: string
 title: string
 }
 user: {
 id: string
 username: string
 nickname: string
 }
 language: string
 status: string
 score: number
 time: number
 memory: number
 submittedAt: string
 code?: string
 message?: string
 passedTests?: number
 totalTests?: number
 isLate?: boolean
}

function SubmissionsContent() {
 const searchParams = useSearchParams()
 const router = useRouter()
 const [submissions, setSubmissions] = useState<Submission[]>([])
 const [loading, setLoading] = useState(true)
 const [page, setPage] = useState(1)
 const [totalPages, setTotalPages] = useState(1)
 const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)
 
 const problemId = searchParams.get('problemId')
 const userId = searchParams.get('userId')
 const status = searchParams.get('status')
 const assignmentId = searchParams.get('assignmentId')
 const classId = searchParams.get('classId')

 useEffect(() => {
 fetchSubmissions()
 }, [page, problemId, userId, status, assignmentId, classId])

 const fetchSubmissions = async () => {
 try {
 let response;
 
 if (assignmentId && classId) {
 console.log('📊 [数据隔离] 加载作业提交记录', { assignmentId, classId, problemId, userId })
 
 const params = new URLSearchParams({
 page: page.toString(),
 limit: '20'
 })
 
 if (problemId) params.append('problemId', problemId)
 if (userId) params.append('userId', userId)
 if (status) params.append('status', status)
 
 response = await fetchWithAuth(
 `/api/classes/${classId}/assignments/${assignmentId}/submissions?${params.toString()}`
 )
 } else {
 console.log('📊 [数据隔离] 加载题库提交记录', { problemId, userId })
 
 const params = new URLSearchParams({
 page: page.toString(),
 limit: '20'
 })
 
 if (problemId) params.append('problemId', problemId)
 if (userId) params.append('userId', userId)
 if (status) params.append('status', status)
 
 response = await fetch(`/api/submissions?${params.toString()}`)
 }
 
 const data = await response.json()
 
 if (data.success) {
 setSubmissions(data.data.submissions || [])
 const totalPagesValue = data.data.pagination?.totalPages || Math.ceil((data.data.pagination?.total || 0) / 20)
 setTotalPages(totalPagesValue)
 console.log(`✅ 加载了 ${(data.data.submissions || []).length} 条提交记录`)
 } else {
 console.error('获取提交记录失败:', data.error)
 setSubmissions([])
 setTotalPages(1)
 }
 } catch (error) {
 console.error('获取提交记录失败:', error)
 } finally {
 setLoading(false)
 }
 }

 if (loading) {
 return <PageLoading label="加载提交记录..." />
 }

 const getStatusIcon = (status: string) => {
 switch (status) {
 case 'AC':
 return <CheckCircle className="w-4 h-4 text-secondary" />
 case 'WA':
 return <XCircle className="w-4 h-4 text-error" />
 case 'TLE':
 return <Clock className="w-4 h-4 text-accent" />
 case 'MLE':
 return <Database className="w-4 h-4 text-info" />
 case 'RE':
 return <AlertTriangle className="w-4 h-4 text-warning" />
 case 'CE':
 return <Code className="w-4 h-4 text-muted-foreground" />
 default:
 return <TimeIcon className="w-4 h-4 text-muted-foreground" />
 }
 }

 const getStatusBadge = (status: string) => {
 const text = getStatusText(status)
 const isSuccess = status === 'AC'
 const isWrong = status === 'WA'
 
 if (isSuccess) {
 return (
 <span className="tag tag-success">
 <CheckCircle className="w-3 h-3" />
 {text}
 </span>
 )
 }
 if (isWrong) {
 return (
 <span className="tag tag-error">
 <XCircle className="w-3 h-3" />
 {text}
 </span>
 )
 }
 return (
 <span className="tag tag-warning">
 <AlertTriangle className="w-3 h-3" />
 {text}
 </span>
 )
 }

 return (
 <EducationalPageShell
 title="提交记录"
 description="查看代码提交与评测结果"
 icon={FileText}
 backHref={assignmentId && classId ? `/classes/${classId}/assignments/${assignmentId}` : undefined}
 backLabel="返回"
 actions={
 <button type="button" onClick={() => router.back()} className="btn btn-ghost text-sm">
 <ArrowLeft className="w-4 h-4" />
 上一页
 </button>
 }
 toolbar={
 (problemId || userId || status || assignmentId) ? (
 <div className="card-static p-4 rounded-lg border border-border">
 <div className="flex items-center gap-3 flex-wrap">
 <Filter className="w-4 h-4 text-muted-foreground" />
 <span className="text-sm text-muted-foreground">当前筛选条件：</span>
 {assignmentId && (
 <span className="tag tag-primary">
 班级作业提交
 </span>
 )}
 {problemId && submissions.length > 0 && (
 <span className="tag">
 题目: {submissions[0].problem.title}
 </span>
 )}
 {userId && submissions.length > 0 && (
 <span className="tag">
 <User className="w-3 h-3" />
 {submissions[0].user.nickname || submissions[0].user.username}
 </span>
 )}
 {status && (
 <span className="tag">
 状态: {getStatusText(status)}
 </span>
 )}
 <Link
 href="/submissions"
 className="ml-auto text-sm text-primary-light hover:text-primary transition-colors flex items-center gap-1"
 >
 <X className="w-4 h-4" />
 清除筛选
 </Link>
 </div>
 </div>
 ) : undefined
 }
 >
 <div className="card-static overflow-hidden rounded-lg border border-border">
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead className="bg-muted border-b border-border">
 <tr>
 <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">提交ID</th>
 <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">题目</th>
 <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">用户</th>
 <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">状态</th>
 <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">分数</th>
 <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">语言</th>
 <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">时间</th>
 <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">内存</th>
 <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">提交时间</th>
 <th className="px-6 py-4 text-left text-sm font-semibold text-muted-foreground">操作</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {submissions.length === 0 ? (
 <tr>
 <td colSpan={10} className="px-6 py-16 text-center">
 <div className="text-center">
 <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground/20" />
 <p className="text-lg font-medium text-foreground mb-2">没有找到提交记录</p>
 {(problemId || userId || status) && (
 <p className="text-sm text-muted-foreground">当前筛选条件下没有提交记录</p>
 )}
 </div>
 </td>
 </tr>
 ) : (
 submissions.map((submission) => (
 <tr key={submission.id} className="hover:bg-muted transition-colors">
 <td className="px-6 py-4">
 <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
 {submission.id.substring(0, 8)}...
 </code>
 </td>
 <td className="px-6 py-4">
 <Link
 href={`/problem/${submission.problem.id}`}
 className="text-primary-light hover:text-primary transition-colors"
 >
 {submission.problem.title}
 </Link>
 </td>
 <td className="px-6 py-4">
 <Link
 href={`/user/${submission.user.id}`}
 className="text-foreground hover:text-primary-light transition-colors flex items-center gap-1"
 >
 <User className="w-4 h-4 text-muted-foreground" />
 {submission.user.nickname || submission.user.username}
 </Link>
 </td>
 <td className="px-6 py-4">
 {getStatusBadge(submission.status)}
 </td>
 <td className="px-6 py-4">
 <span className="font-mono font-semibold text-foreground">{submission.score}</span>
 </td>
 <td className="px-6 py-4">
 <span className="tag">
 {submission.language}
 </span>
 </td>
 <td className="px-6 py-4">
 <span className="font-mono text-sm text-foreground flex items-center gap-1">
 <Clock className="w-3 h-3 text-muted-foreground" />
 {formatTime(submission.time)}
 </span>
 </td>
 <td className="px-6 py-4">
 <span className="font-mono text-sm text-foreground flex items-center gap-1">
 <Database className="w-3 h-3 text-muted-foreground" />
 {formatMemory(submission.memory)}
 </span>
 </td>
 <td className="px-6 py-4">
 <span className="text-sm text-muted-foreground flex items-center gap-1">
 <Calendar className="w-3 h-3" />
 {new Date(submission.submittedAt).toLocaleString('zh-CN')}
 </span>
 </td>
 <td className="px-6 py-4">
 {assignmentId ? (
 <button
 onClick={() => setSelectedSubmission(submission)}
 className="text-primary-light hover:text-primary transition-colors text-sm flex items-center gap-1"
 >
 <Eye className="w-4 h-4" />
 查看详情
 </button>
 ) : (
 <Link
 href={`/submission/${submission.id}`}
 className="text-primary-light hover:text-primary transition-colors text-sm flex items-center gap-1"
 >
 <Eye className="w-4 h-4" />
 查看详情
 </Link>
 )}
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>

 {totalPages > 1 && (
 <div className="px-6 py-4 border-t border-border flex justify-center items-center gap-4">
 <button
 onClick={() => setPage(page - 1)}
 disabled={page === 1}
 className="btn btn-outline py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 上一页
 </button>
 <span className="text-muted-foreground">
 第 {page} / {totalPages} 页
 </span>
 <button
 onClick={() => setPage(page + 1)}
 disabled={page === totalPages}
 className="btn btn-outline py-2 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
 >
 下一页
 </button>
 </div>
 )}
 </div>

 {selectedSubmission && assignmentId && (
 <div className="fixed inset-0 bg-background/80 flex items-center justify-center p-4 z-50">
 <div className="card-static max-w-4xl w-full max-h-[90vh] overflow-hidden">
 <div className="px-6 py-4 border-b border-border flex items-center justify-between">
 <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
 <FileText className="w-5 h-5 text-primary" />
 提交详情
 </h3>
 <button
 onClick={() => setSelectedSubmission(null)}
 className="text-muted-foreground hover:text-foreground transition-colors"
 >
 <X className="w-5 h-5" />
 </button>
 </div>
 <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
 <div className="grid grid-cols-2 gap-6 mb-6">
 <div className="card-static p-4">
 <p className="text-sm text-muted-foreground mb-1">提交用户</p>
 <p className="font-medium text-foreground flex items-center gap-2">
 <User className="w-4 h-4 text-primary" />
 {selectedSubmission.user.nickname || selectedSubmission.user.username}
 </p>
 </div>
 <div className="card-static p-4">
 <p className="text-sm text-muted-foreground mb-1">题目</p>
 <p className="font-medium text-foreground">{selectedSubmission.problem.title}</p>
 </div>
 <div className="card-static p-4">
 <p className="text-sm text-muted-foreground mb-1">语言</p>
 <span className="tag">{selectedSubmission.language}</span>
 </div>
 <div className="card-static p-4">
 <p className="text-sm text-muted-foreground mb-1">状态</p>
 {getStatusBadge(selectedSubmission.status)}
 </div>
 <div className="card-static p-4">
 <p className="text-sm text-muted-foreground mb-1">得分</p>
 <p className="font-medium text-foreground">
 <span className="text-2xl font-bold">{selectedSubmission.score}</span>
 {selectedSubmission.passedTests !== undefined && selectedSubmission.totalTests !== undefined && (
 <span className="text-sm text-muted-foreground ml-2">
 ({selectedSubmission.passedTests}/{selectedSubmission.totalTests} 通过)
 </span>
 )}
 </p>
 </div>
 <div className="card-static p-4">
 <p className="text-sm text-muted-foreground mb-1">提交时间</p>
 <p className="font-medium text-foreground flex items-center gap-2">
 <Calendar className="w-4 h-4 text-muted-foreground" />
 {new Date(selectedSubmission.submittedAt).toLocaleString('zh-CN')}
 </p>
 </div>
 </div>

 {selectedSubmission.code && (
 <div className="mb-6">
 <div className="flex items-center gap-2 mb-3">
 <Code className="w-5 h-5 text-primary" />
 <h4 className="font-semibold text-foreground">代码</h4>
 </div>
 <div className="bg-background-secondary rounded-lg overflow-hidden border border-border">
 <div className="px-4 py-2 bg-muted text-muted-foreground text-sm border-b border-border">
 {selectedSubmission.language}
 </div>
 <pre className="p-4 overflow-x-auto max-h-80 custom-scrollbar">
 <code className="text-foreground text-sm font-mono">{selectedSubmission.code}</code>
 </pre>
 </div>
 </div>
 )}

 {selectedSubmission.message && (
 <div>
 <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
 <AlertTriangle className="w-5 h-5 text-error" />
 错误信息
 </h4>
 <div className="bg-error/10 border border-error/20 rounded-lg p-4">
 <pre className="text-sm text-error whitespace-pre-wrap">
 {selectedSubmission.message}
 </pre>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 )}
 </EducationalPageShell>
 )
}

export default function SubmissionsPage() {
 return (
 <Suspense fallback={<PageLoading label="加载中..." />}>
 <SubmissionsContent />
 </Suspense>
 )
}
