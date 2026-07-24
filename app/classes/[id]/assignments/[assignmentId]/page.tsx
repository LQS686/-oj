'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import {
  Clock,
  CheckCircle2,
  Edit,
  Trash2,
  FileText,
  BarChart3,
  Send,
  AlertCircle,
  FileCode,
  BookOpen,
  ListChecks,
  History,
  Code as CodeIcon,
} from 'lucide-react'
import StudentCompletionTable from '@/components/StudentCompletionTable'
import ProblemDescription from '@/components/problem/ProblemDescription'
import ProblemWorkspaceShell from '@/components/problem/ProblemWorkspaceShell'
import ProblemMetaHeader from '@/components/problem/ProblemMetaHeader'
import AssignmentProblemProgressList from '@/components/class/AssignmentProblemProgressList'
import SubmissionList from '@/components/problem/SubmissionList'
import PretestPanel from '@/components/problem/PretestPanel'
import { logger } from '@/lib/logger'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import { useClass } from '@/hooks/useClass'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import EditAssignmentModal from '@/components/class/EditAssignmentModal'
import { canManageContent } from '@/lib/permissions'
import { isClassAdminApiRole, isClassStudentApiRole, normalizeClassRoleToApi } from '@/lib/class/roles'
import { formatDateTime } from '@/lib/utils'
import SubmissionResultModal, { SubmissionResultData } from '@/components/submission/SubmissionResultModal'
import CodeEditor, { CodeLanguage } from '@/components/code-editor/CodeEditor'
import { PageContainer } from '@/components/layout'
import { loginPath } from '@/lib/navigation'

const languageOptions = [
 { value: 'cpp', label: 'C++', version: 'C++17' },
 { value: 'c', label: 'C', version: 'C11' },
 { value: 'python', label: 'Python', version: 'Python 3.10' },
]

interface Problem {
 id: string
 title: string
 difficulty: string
 totalSubmit: number
 totalAccepted: number
}

interface Assignment {
 id: string
 title: string
 description: string
 startTime: string
 endTime: string
 status: string
 allowLateSubmission?: boolean
 problems: Problem[]
}

interface Submission {
 id: string
 userId?: string
 problemId: string
 status: string
 score: number
 submittedAt: string
 /** 作业维度做题用时（毫秒），仅 AC 时有意义 */
 timeElapsedMs?: number
 // 提交详情字段（SubmissionList 渲染所需，后端按需返回）
 language?: string
 time?: number
 memory?: number
 passedTests?: number
 totalTests?: number
}

interface ClassMember {
 id: string
 userId: string
 role: string
 username?: string
 nickname?: string
 avatar?: string
}

export default function AssignmentDetailPage() {
 const params = useParams()
 const classId = params.id as string
 const router = useRouter()
 const searchParams = useSearchParams()
 const { user } = useUser()
 const { classData } = useClass(classId)
 const [assignment, setAssignment] = useState<Assignment | null>(null)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [submissions, setSubmissions] = useState<Submission[]>([])
 const [allSubmissions, setAllSubmissions] = useState<Submission[]>([])
 const [classMembers, setClassMembers] = useState<ClassMember[]>([])
 const [userRole, setUserRole] = useState<string>('student')
const [editOpen, setEditOpen] = useState(false)
 const [canManage, setCanManage] = useState(false)

 // 顶层视图切换：题目作答 / 完成情况统计（管理员）
 const initialViewTab = searchParams.get('tab') === 'completion' ? 'completion' : 'problems'
 const [viewTab, setViewTab] = useState<'problems' | 'completion'>(initialViewTab)
 // 中栏 Tab：与题库页一致（不含题解，作业场景）
 const [problemTab, setProblemTab] = useState<'description' | 'submissions' | 'code'>('description')
 const [selectedProblemIndex, setSelectedProblemIndex] = useState(0)
 const [problemDetail, setProblemDetail] = useState<any>(null)
 const [problemLoading, setProblemLoading] = useState(false)

 const [code, setCode] = useState('')
 const [language, setLanguage] = useState('cpp')
 const [submitting, setSubmitting] = useState(false)
 const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null)
 const [judgeStatus, setJudgeStatus] = useState<any>(null)
 const [judgeProgress, setJudgeProgress] = useState<{ currentTest: number; totalTests: number } | null>(null)
 const [lastResult, setLastResult] = useState<SubmissionResultData | null>(null)
 const [showResultModal, setShowResultModal] = useState(false)
 const [submitCooldown, setSubmitCooldown] = useState(false)

 // ref 跟踪 currentSubmissionId，避免回调闭包拿到陈旧值
 const currentSubmissionIdRef = useRef<string | null>(null)
 useEffect(() => {
 currentSubmissionIdRef.current = currentSubmissionId
 }, [currentSubmissionId])

 // ref 跟踪 submitting 状态，避免回调闭包拿到陈旧值
 const submittingRef = useRef(false)
 useEffect(() => {
 submittingRef.current = submitting
 }, [submitting])

 useEffect(() => {
 fetchAssignment()
 fetchClassMembers()
 }, [params.id, params.assignmentId])

 useDocumentTitle(assignment?.title, {
   mode: 'assignment',
   className: classData?.name,
 })

 useEffect(() => {
 if (!classMembers.length || !user) return
 const member = classMembers.find((m: ClassMember) => m.userId === user.id)
 if (member) {
 const r = normalizeClassRoleToApi(member.role)
 if (r !== userRole) setUserRole(r)
 }
 }, [user, classMembers])

 useEffect(() => {
 if (!user) {
 setCanManage(false)
 return
 }
 setCanManage(canManageContent(user))
 }, [user])

 const fetchAssignment = async () => {
 try {
 setLoading(true)
 const response = await fetchWithCookie(`/api/classes/${params.id}/assignments/${params.assignmentId}`)
 const data = await response.json()
 if (data.success) {
 setAssignment(data.data.assignment || null)
 setSubmissions(Array.isArray(data.data.submissions) ? data.data.submissions : [])
 setAllSubmissions(Array.isArray(data.data.allSubmissions) ? data.data.allSubmissions : [])
 } else {
 setError(data.error || '获取作业失败')
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }

 const fetchClassMembers = async () => {
 try {
 const response = await fetchWithCookie(`/api/classes/${params.id}/members`)
 const data = await response.json()
 if (data.success) {
 const raw = data.data
 const list = Array.isArray(raw) ? raw : raw?.members
 setClassMembers(Array.isArray(list) ? list : [])
 }
 } catch (err) {
 logger.error('获取班级成员失败', err)
 }
 }

 const fetchProblemDetail = useCallback(async (problemId: string) => {
 try {
 setProblemLoading(true)
 const response = await fetchWithCookie(`/api/problems/${problemId}`)
 const data = await response.json()
 if (data.success) {
 setProblemDetail(data.data)
 } else {
 setProblemDetail(null)
 }
 } catch (err) {
 setProblemDetail(null)
 } finally {
 setProblemLoading(false)
 }
 }, [])

 useEffect(() => {
 if (assignment?.problems?.length && viewTab === 'problems') {
 const targetIndex = Math.min(selectedProblemIndex, assignment.problems.length - 1)
 fetchProblemDetail(assignment.problems[targetIndex].id)
 }
 }, [selectedProblemIndex, assignment?.problems, viewTab, fetchProblemDetail])

 // 桌面端（>= 1024px）不允许停留在 'code' tab，避免左栏内容为空
 useEffect(() => {
 const handleResize = () => {
 if (window.innerWidth >= 1024 && problemTab === 'code') {
 setProblemTab('description')
 }
 }
 window.addEventListener('resize', handleResize)
 return () => window.removeEventListener('resize', handleResize)
 }, [problemTab])

 useEffect(() => {
 // 清理本作业历史草稿（localStorage 不支持 glob，需遍历 keys 匹配前缀）
 if (typeof window !== 'undefined') {
   const prefix = `code_class_${params.id}_${params.assignmentId}_`
   try {
     const keysToRemove: string[] = []
     for (let i = 0; i < localStorage.length; i++) {
       const key = localStorage.key(i)
       if (key && key.startsWith(prefix)) keysToRemove.push(key)
     }
     keysToRemove.forEach((k) => localStorage.removeItem(k))
   } catch {
     // 隐私模式或 localStorage 被禁用时忽略
   }
 }
 }, [params.id, params.assignmentId])

 // 兜底：作业内部"我的提交状态"列表里只要当前提交是终态，就把按钮重置。
 // 解决 ref 没追上 / tab 切换 / 多提交 等场景下 submitting 卡在 true 的问题。
 useEffect(() => {
 if (!submitting) return
 if (!Array.isArray(submissions) || submissions.length === 0) return
 const currentId = currentSubmissionIdRef.current
 if (!currentId) return
 const current = submissions.find((s) => s?.id === currentId)
 if (!current) return
 const status = current.status
 if (status && status !== 'Pending' && status !== 'Judging' && status !== 'Running') {
 setSubmitting(false)
 setSubmitCooldown(false)
 setJudgeProgress(null)
 if (!lastResult || lastResult.status !== status) {
 setLastResult({
 submissionId: current.id,
 status,
 score: typeof current.score === 'number' ? current.score : 0,
 time: 0,
 memory: 0,
 passedTests: 0,
 totalTests: 0,
 })
 }
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [submissions, submitting, user?.id])

 const { isConnected } = useSubmissionSocket({
 userId: user?.id || '',
 enabled: !!user,
 onSubmissionUpdate: (data) => {
 // 1) 判断是否是终态
 const isFinal = data.status !== 'Pending' && data.status !== 'Judging' && data.status !== 'Running'

 // 2) 用 submitting 状态作为门控，不依赖 currentSubmissionIdRef
 const isCurrentSubmission = submittingRef.current

 // 3) 收到任何"终态"事件都直接重置 submitting / cooldown
 if (isFinal) {
 setSubmitting(false)
 setSubmitCooldown(false)
 setJudgeProgress(null)
 if (isCurrentSubmission) {
 setCode('')
 }
 }

 // 4) 只在是当前提交时，才设置弹窗状态（避免其他提交事件触发弹窗）
 if (isCurrentSubmission && isFinal) {
 setLastResult({
 submissionId: data.id,
 status: data.status,
 score: typeof data.score === 'number' ? data.score : (data.passedTests || 0) * 10,
 time: data.time,
 memory: data.memory,
 passedTests: data.passedTests || 0,
 totalTests: data.totalTests || 0,
 message: data.message,
 testResults: data.testResults,
 timeElapsedMs: data.timeElapsedMs,
 })
 setJudgeStatus({
 submissionId: data.id,
 status: data.status,
 passedTests: data.passedTests || 0,
 totalTests: data.totalTests || 0,
 testResults: data.testResults || [],
 })
 }

 // 4) 乐观合并到本作业的"我的提交"列表（无论是否 currentSubmissionId）
 if (data?.id && isFinal) {
 const currentProblemId = assignment?.problems?.[selectedProblemIndex]?.id || ''
 setSubmissions((prev) => {
 if (!Array.isArray(prev)) return prev
 const filtered = prev.filter(
 (s) => !(s.userId === user?.id && s.problemId === currentProblemId)
 )
 return [
 ...filtered,
 {
 id: data.id,
 userId: user?.id,
 problemId: currentProblemId,
 status: data.status,
 score: typeof data.score === 'number' ? data.score : 0,
 submittedAt: new Date().toISOString()
 }
 ]
 })
 }

 // 5) 当前提交的中间态（非终态）也驱动进度条状态
 if (isCurrentSubmission && !isFinal) {
 setJudgeStatus({
 submissionId: data.id,
 status: data.status,
 passedTests: data.passedTests || 0,
 totalTests: data.totalTests || 0,
 testResults: data.testResults || [],
 })
 }
 },
 onJudgeProgress: (data) => {
 if (data?.submissionId === currentSubmissionIdRef.current) {
 setJudgeProgress({
 currentTest: data.currentTest,
 totalTests: data.totalTests,
 })
 if (!judgeStatus) {
 setJudgeStatus({
 submissionId: data.submissionId,
 status: 'Judging',
 passedTests: 0,
 totalTests: data.totalTests,
 testResults: [],
 })
 }
 }
 }
 })

 const handleSubmit = async () => {
 if (!user) {
 router.push(loginPath())
 return
 }
 if (!code.trim() || code.trim().length < 10) return
 if (!assignment?.problems?.[selectedProblemIndex]) return
 // 作业状态守卫：upcoming/ended(无 allowLateSubmission) 禁止提交
 if (assignment.status === 'upcoming') return
 if (assignment.status === 'ended' && !assignment.allowLateSubmission) return
 // 防重复提交：用 ref 同步守卫，避免 React state 异步更新间隙双击绕过 disabled
 if (submittingRef.current || submitCooldown) return
 submittingRef.current = true

 setSubmitting(true)
 setSubmitCooldown(true)
 setJudgeStatus(null)
 setJudgeProgress(null)
 setLastResult(null)
 setShowResultModal(true)

 try {
 const submitUrl = `/api/classes/${params.id}/assignments/${params.assignmentId}/submit`
 const response = await fetchWithCookie(submitUrl, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 problemId: assignment.problems[selectedProblemIndex].id,
 code,
 language
 })
 })
 const data = await response.json()
 if (data.success) {
 currentSubmissionIdRef.current = data.submissionId
 setCurrentSubmissionId(data.submissionId)
 } else {
   submittingRef.current = false
   setSubmitting(false)
   // 后端返回 429 (SUBMIT_TOO_FREQUENT) 时，冷却时间延长到 10 秒以匹配限流窗口
   const cooldownMs = data.code === 'SUBMIT_TOO_FREQUENT' ? 10000 : 3000
   setTimeout(() => setSubmitCooldown(false), cooldownMs)
 }
 } catch (error) {
 submittingRef.current = false
 setSubmitting(false)
 setTimeout(() => setSubmitCooldown(false), 3000)
 }
 }

 const handleDeleteAssignment = async () => {
   if (!assignment) return
   if (!confirm('确定要删除这个作业吗？此操作不可恢复，所有提交记录将被清除。')) return
   try {
     setLoading(true)
     const response = await fetchWithCookie(
       `/api/classes/${params.id}/assignments/${params.assignmentId}`,
       { method: 'DELETE' }
     )
     const data = await response.json()
     if (data.success) {
       router.push(`/classes/${params.id}?tab=assignments`)
     } else {
       setError(data.error || data.message || '删除失败')
     }
   } catch (err) {
     setError('删除失败，请重试')
   } finally {
     setLoading(false)
   }
 }

 const getStatusConfig = (status: string) => {
 switch (status) {
 case 'active': return { label: '进行中', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' }
 case 'upcoming': return { label: '未开始', color: 'text-blue-600 bg-blue-50 border-blue-200' }
 case 'ended': return { label: '已结束', color: 'text-slate-500 bg-slate-50 border-slate-200' }
 default: return { label: status, color: 'text-slate-500 bg-slate-50 border-slate-200' }
 }
 }

 /** 班级班主任/助教，或站点管理员/教师，均可查看完成情况统计 */
 const isAdminOrOwner =
   isClassAdminApiRole(userRole) || canManage

 if (loading) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="flex flex-col items-center gap-3">
 <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
 <span className="text-sm text-muted-foreground">加载中...</span>
 </div>
 </div>
 )
 }

 if (error || !assignment) {
 return (
 <div className="min-h-screen flex items-center justify-center p-4">
 <div className="text-center">
 <p className="text-error mb-4">{error || '作业不存在'}</p>
 <button onClick={() => router.push(`/classes/${params.id}?tab=assignments`)} className="btn-primary btn">
 返回列表
 </button>
 </div>
 </div>
 )
 }

 const statusConfig = getStatusConfig(assignment.status)
 const selectedProblem = assignment.problems?.[selectedProblemIndex]

 const tabs = [
 { key: 'problems' as const, label: '题目', icon: FileText },
 ...(isAdminOrOwner
 ? [{ key: 'completion' as const, label: '完成情况统计', icon: BarChart3 }]
 : []),
 ]

 return (
 <div className="min-h-screen bg-background pb-20 lg:pb-6">
 <PageContainer variant="workspace" className="py-4">
 {/* 作业信息：单卡压缩，把首屏留给做题区 */}
 <div className="bg-card rounded-xl border border-border overflow-hidden mb-3 shadow-sm">
 <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
 <div className="flex items-center gap-2 min-w-0 flex-1">
 <h1 className="text-lg font-bold text-foreground truncate">{assignment.title}</h1>
 <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusConfig.color}`}>
 {statusConfig.label}
 </span>
 </div>

 <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
 <span className="inline-flex items-center gap-1">
 <Clock className="w-3.5 h-3.5" />
 <span className="tabular-nums">
 {formatDateTime(assignment.startTime)}
 <span className="mx-1 text-border">–</span>
 {formatDateTime(assignment.endTime)}
 </span>
 </span>
 <span className="inline-flex items-center gap-1">
 <FileCode className="w-3.5 h-3.5" />
 题目 {assignment.problems?.length || 0}
 </span>
 <span className="inline-flex items-center gap-1">
 <CheckCircle2 className="w-3.5 h-3.5 text-secondary-light" />
 完成 {submissions.filter(s => s.status === 'AC').length}/{assignment.problems?.length || 0}
 </span>
 </div>

 {isAdminOrOwner && (
 <div className="flex items-center gap-1.5 shrink-0">
 <button
 type="button"
 onClick={() => setEditOpen(true)}
 className="btn btn-ghost btn-sm border border-border inline-flex items-center gap-1 h-8 px-2.5"
 >
 <Edit className="w-3.5 h-3.5" /> 编辑
 </button>
 <button
 type="button"
 onClick={handleDeleteAssignment}
 className="btn btn-ghost btn-sm border border-error/30 text-error inline-flex items-center gap-1 h-8 px-2.5 hover:bg-error/10"
 >
 <Trash2 className="w-3.5 h-3.5" /> 删除
 </button>
 </div>
 )}
 </div>

 {assignment.description && (
 <p className="px-4 pb-2.5 text-sm text-muted-foreground line-clamp-2">
 {assignment.description}
 </p>
 )}

 <div className="px-2 flex items-center gap-0.5 border-t border-border">
 {tabs.map((tab) => {
 const Icon = tab.icon
 const isActive = viewTab === tab.key
 return (
 <button
 key={tab.key}
 onClick={() => {
 setViewTab(tab.key)
 const tabParams = new URLSearchParams(searchParams.toString())
 tabParams.set('tab', tab.key)
 router.replace(`${window.location.pathname}?${tabParams.toString()}`, { scroll: false })
 }}
 className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
 isActive
 ? 'text-primary-light'
 : 'text-muted-foreground hover:text-foreground'
 }`}
 >
 {isActive && (
 <motion.div
 layoutId="assignment-view-tab-indicator"
 className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
 transition={{ type: 'spring', stiffness: 500, damping: 30 }}
 />
 )}
 <Icon className="w-3.5 h-3.5" />
 {tab.label}
 </button>
 )
 })}
 </div>
 </div>

 {viewTab === 'problems' && (
 <ProblemWorkspaceShell
 dense
 codeMode={problemTab === 'code'}
 leftSelector={
 <AssignmentProblemProgressList
 problems={assignment.problems || []}
 submissions={submissions}
 selectedIndex={selectedProblemIndex}
 onSelect={(index) => {
 setSelectedProblemIndex(index)
 setProblemTab('description')
 }}
 classId={classId}
 assignmentId={params.assignmentId as string}
 assignmentEndTime={assignment.endTime}
 />
 }
 leftHeader={
 <>
 {selectedProblem && (
 <div className="hidden lg:flex items-center gap-2 px-4 py-2.5 border-r border-border min-w-0 max-w-[40%] shrink">
 <span className="shrink-0 w-6 h-6 rounded-md bg-primary/10 text-primary-light font-mono text-xs font-bold flex items-center justify-center">
 {String.fromCharCode(65 + selectedProblemIndex)}
 </span>
 <span className="truncate text-sm font-medium text-foreground" title={selectedProblem.title}>
 {selectedProblem.title}
 </span>
 </div>
 )}
 {[
 { key: 'description' as const, label: '题目描述', icon: BookOpen },
 { key: 'submissions' as const, label: '提交记录', icon: ListChecks },
 ].map((tab) => {
 const Icon = tab.icon
 const isActive = problemTab === tab.key
 return (
 <button
 key={tab.key}
 onClick={() => setProblemTab(tab.key)}
 className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all duration-300 relative cursor-pointer group whitespace-nowrap ${
 isActive
 ? 'text-primary-light'
 : 'text-muted-foreground hover:text-foreground'
 }`}
 >
 {isActive && (
 <motion.div
 layoutId="assignment-problem-tab-indicator"
 className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
 transition={{ type: 'spring', stiffness: 500, damping: 30 }}
 />
 )}
 <Icon className={`w-3.5 h-3.5 transition-transform duration-300 ${isActive ? 'rotate-3' : ''}`} />
 {tab.label}
 </button>
 )
 })}
 </>
 }
 leftPanel={
 <AnimatePresence mode="wait">
 {problemTab === 'description' && (
 <motion.div
 key="description"
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -8 }}
 transition={{ duration: 0.18 }}
 >
 {problemLoading ? (
 <div className="p-10 text-center">
 <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
 <span className="text-sm text-muted-foreground">加载题目内容...</span>
 </div>
 ) : problemDetail ? (
 <ProblemDescription problem={problemDetail} />
 ) : (
 <div className="p-10 text-center text-sm text-muted-foreground">题目内容加载失败</div>
 )}
 </motion.div>
 )}

 {problemTab === 'submissions' && (
 <motion.div
 key="submissions"
 initial={{ opacity: 0, y: 8 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -8 }}
 transition={{ duration: 0.18 }}
 >
 <SubmissionList
 submissions={submissions.filter((s) => s.problemId === selectedProblem?.id) as any}
 loading={false}
 error={null}
 user={user}
 fromAssignment={params.assignmentId as string}
 classId={classId}
 onSelect={() => {}}
 />
 </motion.div>
 )}
 </AnimatePresence>
 }
 metaHeader={
 problemDetail ? (
 <ProblemMetaHeader
 timeLimit={problemDetail.timeLimit}
 memoryLimit={problemDetail.memoryLimit}
 tags={problemDetail.tags}
 difficulty={problemDetail.difficulty}
 />
 ) : null
 }
 rightHeader={
 <>
 <CodeIcon className="w-4 h-4 text-primary-light" />
 <h3 className="text-sm font-medium text-foreground">提交代码</h3>
 </>
 }
 rightPanel={
 <>
 {!user && (
 <div className="p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-accent text-xs flex items-center gap-2">
 <AlertCircle className="w-3.5 h-3.5 shrink-0" />
 请先登录后再提交代码
 </div>
 )}
 {user && assignment.status === 'upcoming' && (
 <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs flex items-center gap-2">
 <AlertCircle className="w-3.5 h-3.5 shrink-0" />
 作业尚未开始，{assignment.startTime ? `将在 ${formatDateTime(assignment.startTime)} 开放提交` : '暂不可提交'}
 </div>
 )}
 {user && assignment.status === 'ended' && !assignment.allowLateSubmission && (
 <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs flex items-center gap-2">
 <AlertCircle className="w-3.5 h-3.5 shrink-0" />
 作业已结束，不再接受新提交
 </div>
 )}
 {user && assignment.status === 'ended' && assignment.allowLateSubmission && (
 <div className="p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-accent text-xs flex items-center gap-2">
 <AlertCircle className="w-3.5 h-3.5 shrink-0" />
 作业已结束（允许逾期提交，分数会被标记为逾期）
 </div>
 )}

 <div className="flex items-center justify-between gap-3">
 <label className="text-xs font-medium text-foreground whitespace-nowrap">语言</label>
 <select
 value={language}
 onChange={(e) => setLanguage(e.target.value)}
 className="px-2.5 py-1 rounded-md border border-border bg-background text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
 >
 {languageOptions.map((lang) => (
 <option key={lang.value} value={lang.value}>
 {lang.label} ({lang.version})
 </option>
 ))}
 </select>
 </div>

 <CodeEditor
 value={code}
 onChange={setCode}
 language={language as CodeLanguage}
 placeholder="在此粘贴或输入代码... (Ctrl+Enter 提交)"
 height="min(28rem, calc(100vh - 22rem))"
 onSubmit={handleSubmit}
 />

 <div className="flex items-center gap-2 pt-0.5">
 <button
 onClick={handleSubmit}
 disabled={submitting || submitCooldown || !user || assignment.status === 'upcoming' || (assignment.status === 'ended' && !assignment.allowLateSubmission)}
 title={
 !user ? '请先登录' :
 assignment.status === 'upcoming' ? '作业尚未开始' :
 assignment.status === 'ended' && !assignment.allowLateSubmission ? '作业已结束' :
 submitting ? '正在评测中...' :
 submitCooldown ? '请稍后再试' : ''
 }
 className="btn-primary btn flex-1 max-w-xs h-9 text-sm"
 >
 {submitting ? (
 <>
 <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
 评测中...
 </>
 ) : submitCooldown ? (
 <>
 <Clock className="w-4 h-4" />
 请稍候...
 </>
 ) : !user ? (
 <>
 <Send className="w-4 h-4" />
 请先登录
 </>
 ) : assignment.status === 'upcoming' ? (
 <>
 <Clock className="w-4 h-4" />
 未开始
 </>
 ) : assignment.status === 'ended' && !assignment.allowLateSubmission ? (
 <>
 <Clock className="w-4 h-4" />
 已结束
 </>
 ) : (
 <>
 <Send className="w-4 h-4" />
 提交代码
 </>
 )}
 </button>
 <button onClick={() => setCode('')} className="btn-ghost btn cursor-pointer h-9 text-sm">
 清空
 </button>
 </div>

 {(problemDetail?.id || problemDetail?._id || selectedProblem?.id) && (
 <PretestPanel
 problemId={String(problemDetail?.id || problemDetail?._id || selectedProblem?.id)}
 code={code}
 language={language}
 disabled={!user || submitting}
 />
 )}
 </>
 }
 />
 )}

 {/* 移动端底部 Tab Bar：题面 / 代码 / 提交 */}
 {viewTab === 'problems' && (
 <div className="fixed bottom-0 left-0 right-0 bg-background-secondary border-t border-border z-40 lg:hidden">
 <div className="grid grid-cols-3">
 <button
 onClick={() => setProblemTab('description')}
 className={`flex flex-col items-center justify-center py-3 gap-1 ${problemTab === 'description' ? 'text-primary' : 'text-muted-foreground'}`}
 >
 <FileText className="w-5 h-5" />
 <span className="text-xs">题面</span>
 </button>
 <button
 onClick={() => setProblemTab('code')}
 className={`flex flex-col items-center justify-center py-3 gap-1 ${problemTab === 'code' ? 'text-primary' : 'text-muted-foreground'}`}
 >
 <CodeIcon className="w-5 h-5" />
 <span className="text-xs">代码</span>
 </button>
 <button
 onClick={() => setProblemTab('submissions')}
 className={`flex flex-col items-center justify-center py-3 gap-1 ${problemTab === 'submissions' ? 'text-primary' : 'text-muted-foreground'}`}
 >
 <History className="w-5 h-5" />
 <span className="text-xs">提交</span>
 </button>
 </div>
 </div>
 )}

 {viewTab === 'completion' && isAdminOrOwner && (
 <StudentCompletionTable
 students={(Array.isArray(classMembers) ? classMembers : [])
 .filter((m) => isClassStudentApiRole(m.role))
 .map((member, index) => {
 const memberSubs = allSubmissions.filter(s => s.userId === member.userId)
 const submissionsMap: Record<string, any> = {}
 let totalScore = 0
 let completedCount = 0
 let totalTimeMs = 0

 memberSubs.forEach(sub => {
 const existing = submissionsMap[sub.problemId]
 if (!existing || sub.score > (existing.score || 0)) {
 submissionsMap[sub.problemId] = {
 problemId: sub.problemId,
 status: sub.status,
 score: sub.score || 0,
 submittedAt: sub.submittedAt,
 timeElapsedMs: sub.timeElapsedMs || 0,
 }
 }
 })

 Object.values(submissionsMap).forEach((sub: any) => {
 totalScore += sub.score || 0
 if (sub.status === 'AC') {
 completedCount++
 // 仅累加 AC 题目的做题用时
 totalTimeMs += typeof sub.timeElapsedMs === 'number' ? sub.timeElapsedMs : 0
 }
 })

 return {
 id: member.userId,
 name: member.nickname || member.username || `成员${index + 1}`,
 avatar: member.avatar || '',
 submissions: submissionsMap,
 totalScore,
 completedCount,
 totalTimeMs,
 }
 })}
 problems={assignment.problems || []}
 assignmentTitle={assignment.title}
 allSubmissions={allSubmissions}
 onProblemClick={(index) => {
 setSelectedProblemIndex(index)
 setViewTab('problems')
 setProblemTab('description')
 setCode('')
 }}
 />
 )}
 </PageContainer>
 <EditAssignmentModal
 classId={classId}
 assignmentId={params.assignmentId as string}
 open={editOpen}
 onClose={() => setEditOpen(false)}
 onSaved={() => {
 void fetchAssignment()
 }}
 onDeleted={() => {
 router.push(`/classes/${classId}`)
 }}
 />
 <SubmissionResultModal
 isOpen={showResultModal}
 onClose={() => { setShowResultModal(false); setJudgeStatus(null); setLastResult(null); }}
 isJudging={submitting}
 judgeProgress={judgeProgress}
 result={lastResult as SubmissionResultData | null}
 onContinueSubmit={() => {
 // CodeMirror 的可编辑元素是 .cm-content，外层容器标记了 data-testid
 const cmContent = document.querySelector('[data-testid="code-editor-wrapper"] .cm-content') as HTMLElement | null;
 cmContent?.focus();
 setShowResultModal(false);
 setJudgeStatus(null);
 setLastResult(null);
 }}
 onViewDetail={(submissionId) => {
 setShowResultModal(false);
 setJudgeStatus(null);
 setLastResult(null);
 router.push(`/submission/${submissionId}`);
 }}
 />
 </div>
 )
}
