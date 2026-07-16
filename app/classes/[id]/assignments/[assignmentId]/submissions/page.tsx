'use client'

import { useState, useEffect, use, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import { ArrowLeft, Filter, Code, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import type { Assignment } from '@/types/models'

interface Submission {
 id: string
 problem: {
 id: string
 title: string
 problemNumber?: string
 }
 userId: string
 user: {
 id: string
 username: string
 nickname?: string
 }
 language: string
 code: string
 status: string
 score: number
 time: number
 memory: number
 passedTests?: number
 totalTests?: number
 message?: string
 submittedAt: string
 isLate: boolean
}

export default function AssignmentSubmissionsPage({ params }: { params: Promise<{ id: string; assignmentId: string }> }) {
 const { id: classId, assignmentId } = use(params)
 const router = useRouter()
 const searchParams = useSearchParams()
 const { user } = useUser()

 const userIdParam = searchParams.get('userId')
 const problemIdParam = searchParams.get('problemId')
 const statusParam = searchParams.get('status')

 const isFromLeaderboard = !!(userIdParam && problemIdParam)

 const [submissions, setSubmissions] = useState<Submission[]>([])
 const [assignment, setAssignment] = useState<Assignment | null>(null)
 const [loading, setLoading] = useState(true)
 const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)
 const [showCodeModal, setShowCodeModal] = useState(false)
 const [targetUser, setTargetUser] = useState<{ username: string; nickname?: string } | null>(null)
 const [targetProblem, setTargetProblem] = useState<{ title: string; problemNumber?: string } | null>(null)

 const [filterUserId, setFilterUserId] = useState(userIdParam || '')
 const [filterProblemId, setFilterProblemId] = useState(problemIdParam || '')
 const [filterStatus, setFilterStatus] = useState(statusParam || '')

 useEffect(() => {
 const fetchAssignment = async () => {
 try {
 const response = await fetchWithAuth(`/api/classes/${classId}/assignments/${assignmentId}`)
 const data = await response.json()
 if (data.success) {
 setAssignment(data.data)
 }
 } catch (error) {
 logger.error('获取作业信息失败', error)
 }
 }
 fetchAssignment()
 }, [classId, assignmentId])

 useEffect(() => {
 const fetchSubmissions = async () => {
 try {
 setLoading(true)
 
 const params = new URLSearchParams()
 if (filterUserId) params.append('userId', filterUserId)
 if (filterProblemId) params.append('problemId', filterProblemId)
 if (filterStatus) params.append('status', filterStatus)
 params.append('page', '1')
 params.append('pageSize', '50')
 
 const response = await fetchWithAuth(
 `/api/classes/${classId}/assignments/${assignmentId}/submissions?${params}`,
 { cache: 'no-store' }
 )
 const data = await response.json()
 
 if (data.success) {
 const submissionsList = data.data.submissions || []
 setSubmissions(submissionsList)
 
 if (isFromLeaderboard && submissionsList.length > 0) {
 const firstSubmission = submissionsList[0]
 setTargetUser({
 username: firstSubmission.user.username,
 nickname: firstSubmission.user.nickname
 })
 setTargetProblem({
 title: firstSubmission.problem.title,
 problemNumber: firstSubmission.problem.problemNumber
 })
 }
 }
 } catch (error) {
 logger.error('获取提交记录失败', error)
 } finally {
 setLoading(false)
 }
 }
 
 fetchSubmissions()
 }, [classId, assignmentId, filterUserId, filterProblemId, filterStatus, isFromLeaderboard])

 // 用 ref 跟踪是否有非终态提交，避免 submissions 变化导致 interval 反复重建
 const hasNonFinalRef = useRef(false)
 useEffect(() => {
 hasNonFinalRef.current = Array.isArray(submissions) && submissions.some(
 (s) => s?.status === 'Pending' || s?.status === 'Judging' || s?.status === 'Running'
 )
 }, [submissions])

 // 轮询兜底：列表里有非终态记录时每 3s 拉一次，
 // 解决 WebSocket 漏推 / 断连时提交记录永远不刷新的问题。
 // 页面隐藏时暂停轮询，恢复前台时若仍有非终态则重启。
 useEffect(() => {
 const fetchSubmissionsPolling = async () => {
 try {
 const params = new URLSearchParams()
 if (filterUserId) params.append('userId', filterUserId)
 if (filterProblemId) params.append('problemId', filterProblemId)
 if (filterStatus) params.append('status', filterStatus)
 params.append('page', '1')
 params.append('pageSize', '50')

 const response = await fetchWithAuth(
 `/api/classes/${classId}/assignments/${assignmentId}/submissions?${params}`,
 { cache: 'no-store' }
 )
 const data = await response.json()
 if (data.success) {
 setSubmissions(data.data.submissions || [])
 }
 } catch (error) {
 logger.error('轮询提交记录失败', error)
 }
 }

 let intervalId: ReturnType<typeof setInterval> | null = null
 const start = () => {
 if (intervalId) return
 intervalId = setInterval(() => {
 // 每次轮询前检查 ref，若已全部终态则停止（避免无意义请求）
 if (!hasNonFinalRef.current) {
 stop()
 return
 }
 fetchSubmissionsPolling()
 }, 3000)
 }
 const stop = () => {
 if (intervalId) {
 clearInterval(intervalId)
 intervalId = null
 }
 }
 const onVisibilityChange = () => {
 if (document.visibilityState === 'visible') {
 // 切回页面时若仍有非终态提交，立即刷新一次并启动轮询
 if (hasNonFinalRef.current) {
 fetchSubmissionsPolling()
 start()
 } else {
 stop()
 }
 } else {
 stop()
 }
 }

 // 初始：若有非终态提交且页面可见，启动轮询
 if (hasNonFinalRef.current && document.visibilityState === 'visible') {
 start()
 }
 document.addEventListener('visibilitychange', onVisibilityChange)

 return () => {
 stop()
 document.removeEventListener('visibilitychange', onVisibilityChange)
 }
 }, [classId, assignmentId, filterUserId, filterProblemId, filterStatus])

 // WebSocket 实时推送：本地有用户提交时收到推送，
 // 立即合并到列表（乐观更新），再后台拉一次拿权威数据
 useSubmissionSocket({
 userId: user?.id || '',
 enabled: !!user,
 onSubmissionUpdate: (data) => {
 if (!data?.id) return
 setSubmissions((prev) => {
 if (!Array.isArray(prev)) return prev
 const idx = prev.findIndex((s) => s?.id === data.id)
 if (idx === -1) return prev
 const next = prev.slice()
 next[idx] = {
 ...next[idx],
 status: data.status,
 score: typeof data.score === 'number' ? data.score : next[idx].score,
 time: typeof data.time === 'number' ? data.time : next[idx].time,
 memory: typeof data.memory === 'number' ? data.memory : next[idx].memory,
 passedTests: typeof data.passedTests === 'number' ? data.passedTests : next[idx].passedTests,
 totalTests: typeof data.totalTests === 'number' ? data.totalTests : next[idx].totalTests,
 message: data.message ?? next[idx].message,
 }
 // 同步更新 hasNonFinalRef，让轮询 effect 立即感知状态变化
 hasNonFinalRef.current = next.some(
 (s) => s?.status === 'Pending' || s?.status === 'Judging' || s?.status === 'Running'
 )
 return next
 })
 },
 })

 const getStatusInfo = (status: string, score: number) => {
 switch (status) {
 case 'AC':
 return {
 icon: <CheckCircle className="w-5 h-5" />,
 color: 'text-green-400',
 bg: 'bg-secondary/100/20',
 label: 'AC'
 }
 case 'WA':
 return {
 icon: <XCircle className="w-5 h-5" />,
 color: 'text-red-400',
 bg: 'bg-error/100/20',
 label: 'WA'
 }
 case 'TLE':
 return {
 icon: <Clock className="w-5 h-5" />,
 color: 'text-accent-light',
 bg: 'bg-yellow-500/20',
 label: 'TLE'
 }
 case 'MLE':
 return {
 icon: <AlertCircle className="w-5 h-5" />,
 color: 'text-orange-400',
 bg: 'bg-orange-500/20',
 label: 'MLE'
 }
 case 'RE':
 return {
 icon: <XCircle className="w-5 h-5" />,
 color: 'text-purple-400',
 bg: 'bg-purple-500/20',
 label: 'RE'
 }
 default:
 if (score > 0 && score < 100) {
 return {
 icon: <AlertCircle className="w-5 h-5" />,
 color: 'text-accent-light',
 bg: 'bg-yellow-500/20',
 label: `${score}分`
 }
 }
 return {
 icon: <XCircle className="w-5 h-5" />,
 color: 'text-muted-foreground',
 bg: 'bg-gray-500/20',
 label: status
 }
 }
 }

 const viewCode = (submission: Submission) => {
 setSelectedSubmission(submission)
 setShowCodeModal(true)
 }

 return (
 <div className="min-h-screen">
 <div className="container mx-auto px-4 py-8">
 <button
 onClick={() => {
 const returnTab = isFromLeaderboard ? 'leaderboard' : 'info'
 router.push(`/classes/${classId}/assignments/${assignmentId}?tab=${returnTab}`)
 }}
 className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
 >
 <ArrowLeft className="w-4 h-4" />
 返回作业详情
 </button>

 <div className="card p-6 mb-6">
 <h1 className="text-3xl font-bold text-foreground mb-2">
 {isFromLeaderboard && targetUser && targetProblem ? (
 `${assignment?.title} - ${targetProblem.title}(${targetProblem.problemNumber}) - ${targetUser.nickname || targetUser.username}的提交记录`
 ) : (
 `${assignment?.title} - 提交记录`
 )}
 </h1>
 <p className="text-muted-foreground">
 {isFromLeaderboard && targetUser ? (
 `查看 ${targetUser.nickname || targetUser.username} 在 ${targetProblem?.title} 题目上的所有提交`
 ) : (
 '查看作业相关的所有提交记录'
 )}
 </p>
 </div>

 {!isFromLeaderboard && (
 <div className="card p-6 mb-6">
 <div className="flex items-center gap-2 mb-4">
 <Filter className="w-5 h-5 text-muted-foreground" />
 <h2 className="text-lg font-semibold text-foreground">筛选条件</h2>
 </div>
 <div className="grid md:grid-cols-3 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 用户ID
 </label>
 <input
 type="text"
 value={filterUserId}
 onChange={(e) => setFilterUserId(e.target.value)}
 placeholder="输入用户ID筛选"
 className="input w-full"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 题目ID
 </label>
 <input
 type="text"
 value={filterProblemId}
 onChange={(e) => setFilterProblemId(e.target.value)}
 placeholder="输入题目ID筛选"
 className="input w-full"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 状态
 </label>
 <select
 value={filterStatus}
 onChange={(e) => setFilterStatus(e.target.value)}
 className="input w-full"
 >
 <option value="">全部状态</option>
 <option value="AC">AC (通过)</option>
 <option value="WA">WA (答案错误)</option>
 <option value="TLE">TLE (超时)</option>
 <option value="MLE">MLE (内存超限)</option>
 <option value="RE">RE (运行错误)</option>
 </select>
 </div>
 </div>
 </div>
 )}

 <div className="card overflow-hidden">
 {loading ? (
 <div className="text-center py-12">
 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
 <p className="text-muted-foreground">加载中...</p>
 </div>
 ) : submissions.length === 0 ? (
 <div className="text-center py-12 text-muted-foreground">
 暂无提交记录
 </div>
 ) : (
 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-border">
 <thead className="bg-muted">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 提交时间
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 用户
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 题目
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 语言
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 状态
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 得分
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 时间/内存
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
 操作
 </th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {submissions.map((submission) => {
 const statusInfo = getStatusInfo(submission.status, submission.score)
 return (
 <tr key={submission.id} className="hover:bg-muted">
 <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
 {new Date(submission.submittedAt).toLocaleString('zh-CN')}
 {submission.isLate && (
 <span className="ml-2 text-xs text-red-400">(逾期)</span>
 )}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
 {submission.user.nickname || submission.user.username}
 </td>
 <td className="px-6 py-4 text-sm text-foreground">
 <div>
 <div className="font-medium">{submission.problem.title}</div>
 {submission.problem.problemNumber && (
 <div className="text-xs text-muted-foreground">
 {submission.problem.problemNumber}
 </div>
 )}
 </div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
 {submission.language}
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <div className={`flex items-center gap-2 ${statusInfo.color}`}>
 {statusInfo.icon}
 <span className="font-medium">{statusInfo.label}</span>
 </div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm">
 <span className={`px-2 py-1 rounded text-sm font-medium ${
 submission.score === 100
 ? 'bg-secondary/100/20 text-green-400'
 : submission.score > 0
 ? 'bg-yellow-500/20 text-accent-light'
 : 'bg-muted text-muted-foreground'
 }`}>
 {submission.score}
 </span>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
 <div>{submission.time}ms</div>
 <div className="text-xs text-muted-foreground">{submission.memory}KB</div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm">
 <button
 onClick={() => viewCode(submission)}
 className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium"
 >
 <Code className="w-4 h-4" />
 查看代码
 </button>
 </td>
 </tr>
 )
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </div>

 {showCodeModal && selectedSubmission && (
 <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4">
 <div className="card max-w-4xl w-full max-h-[90vh] overflow-hidden">
 <div className="p-6 border-b border-border">
 <div className="flex items-center justify-between">
 <h3 className="text-xl font-bold text-foreground">提交代码</h3>
 <button
 onClick={() => setShowCodeModal(false)}
 className="text-muted-foreground hover:text-foreground"
 >
 <XCircle className="w-6 h-6" />
 </button>
 </div>
 <div className="mt-2 text-sm text-muted-foreground">
 <div>题目：{selectedSubmission.problem.title}</div>
 <div>用户：{selectedSubmission.user.nickname || selectedSubmission.user.username}</div>
 <div>语言：{selectedSubmission.language}</div>
 <div>状态：{getStatusInfo(selectedSubmission.status, selectedSubmission.score).label}</div>
 <div>得分：{selectedSubmission.score} / 100</div>
 </div>
 </div>
 <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
 <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
 <code className="text-sm text-foreground">{selectedSubmission.code}</code>
 </pre>
 </div>
 </div>
 </div>
 )}
 </div>
 )
}
