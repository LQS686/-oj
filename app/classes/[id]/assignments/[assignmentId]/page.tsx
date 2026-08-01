'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
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
  AlertCircle,
  FileCode,
  Info,
  Calendar,
} from 'lucide-react'
import StudentCompletionTable from '@/components/StudentCompletionTable'
import ProblemDescription from '@/components/problem/ProblemDescription'
import ProblemWorkspaceShell from '@/components/problem/ProblemWorkspaceShell'
import ProblemMetaHeader from '@/components/problem/ProblemMetaHeader'
import AssignmentProblemProgressList from '@/components/class/AssignmentProblemProgressList'
import SubmissionList from '@/components/problem/SubmissionList'
import ProblemSubmitColumn, {
  ProblemSubmitColumnHeader,
} from '@/components/problem/ProblemSubmitColumn'
import {
  ProblemWorkspaceDesktopTabs,
  ProblemWorkspaceMobileTabs,
  ProblemWorkspaceSelectedTitle,
  WORKSPACE_PRESETS,
  type WorkspaceTab,
} from '@/components/problem/ProblemWorkspaceTabs'
import { logger } from '@/lib/logger'
import { useClass } from '@/hooks/useClass'
import {
  createPendingListRow,
  defaultMergeSubmissionList,
  useSubmissionResultFlow,
  type SubmissionListRow,
} from '@/hooks/useSubmissionResultFlow'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import EditAssignmentModal from '@/components/class/EditAssignmentModal'
import { canManageContent } from '@/lib/permissions'
import { isClassAdminApiRole, isClassStudentApiRole, normalizeClassRoleToApi } from '@/lib/class/roles'
import { formatDateTime } from '@/lib/utils'
import SubmissionResultModal from '@/components/submission/SubmissionResultModal'
import { PageContainer } from '@/components/layout'
import { loginPathFromLocation } from '@/lib/navigation'
import { useDialog } from '@/components/common'
import { isAcceptedStatus } from '@/lib/constants/submission-status'
import {
  EntityDescriptionCard,
  EntityDetailHeader,
  EntityInfoCard,
  EntityOverviewLayout,
} from '@/components/entity'
import type { Problem as ProblemModel } from '@/types/models'

const PRESET = WORKSPACE_PRESETS.assignment

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

interface ClassMember {
 id: string
 userId: string
 role: string
 username?: string
 nickname?: string
 avatar?: string
}

interface MemberSubmission {
 problemId: string
 status: string
 score: number
 submittedAt: string
 timeElapsedMs: number
}

export default function AssignmentDetailPage() {
 const dialog = useDialog()
 const params = useParams()
 const classId = params.id as string
 const router = useRouter()
 const searchParams = useSearchParams()
 const { user } = useUser()
 const { classData } = useClass(classId)
 const [assignment, setAssignment] = useState<Assignment | null>(null)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [submissions, setSubmissions] = useState<SubmissionListRow[]>([])
 const [allSubmissions, setAllSubmissions] = useState<SubmissionListRow[]>([])
 const [classMembers, setClassMembers] = useState<ClassMember[]>([])
 const [userRole, setUserRole] = useState<string>('student')
const [editOpen, setEditOpen] = useState(false)
 const [canManage, setCanManage] = useState(false)

 // 顶层：简介 / 题目 / 完成情况（管理员）
 type ViewTab = 'info' | 'problems' | 'completion'
 const parseViewTab = (raw: string | null): ViewTab => {
   if (raw === 'completion' || raw === 'problems' || raw === 'info') return raw
   return 'info'
 }
 const [viewTab, setViewTab] = useState<ViewTab>(() => parseViewTab(searchParams.get('tab')))
 // 中栏 Tab：作业预设不含题解/统计
 const [problemTab, setProblemTab] = useState<WorkspaceTab>('description')
 const [selectedProblemIndex, setSelectedProblemIndex] = useState(0)
 const [problemDetail, setProblemDetail] = useState<ProblemModel & { _id?: string } | null>(null)
 const [problemLoading, setProblemLoading] = useState(false)

 const [code, setCode] = useState('')
 const [language, setLanguage] = useState('cpp')
 const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null)
 const [submitCooldown, setSubmitCooldown] = useState(false)

 useDeferredEffect(() => {
   setViewTab(parseViewTab(searchParams.get('tab')))
 }, [searchParams])

 useDocumentTitle(assignment?.title, {
   mode: 'assignment',
   className: classData?.name,
 })

 useDeferredEffect(() => {
 if (!classMembers.length || !user) return
 const member = classMembers.find((m: ClassMember) => m.userId === user.id)
 if (member) {
 const r = normalizeClassRoleToApi(member.role)
 if (r !== userRole) setUserRole(r)
 }
 }, [user, classMembers, userRole])

 useDeferredEffect(() => {
 if (!user) {
 setCanManage(false)
 return
 }
 setCanManage(canManageContent(user))
 }, [user])

 const fetchAssignment = useCallback(async () => {
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
 } catch {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }, [params.id, params.assignmentId])

 const fetchClassMembers = useCallback(async () => {
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
 }, [params.id])

 useDeferredEffect(() => {
 void fetchAssignment()
 void fetchClassMembers()
 }, [fetchAssignment, fetchClassMembers])

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
 } catch {
   setProblemDetail(null)
 } finally {
   setProblemLoading(false)
 }
 }, [])

 useDeferredEffect(() => {
 // 仅在题目 Tab 拉题面；completion/info 不请求，避免无效流量
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

 const {
 submitting,
 lastResult,
 showResultModal,
 judgeProgress,
 beginSubmitSession,
 bindSubmission,
 abortSubmitSession,
 closeResultModal,
 isEpochCurrent,
 } = useSubmissionResultFlow({
 userId: user?.id,
 enabled: !!user,
 submissions,
 setSubmissions,
 onRefreshAfterFinal: () => {
 void fetchAssignment()
 },
 onFinalApplied: (result) => {
 // 与原先 WS 终态行为一致：通过后清空编辑器；任意终态结束冷却
 if (isAcceptedStatus(result.status)) {
 setCode('')
 }
 setSubmitCooldown(false)
 },
 mergeListOnUpdate: (prev, data) =>
 defaultMergeSubmissionList(prev, data, {
 language,
 problemId: assignment?.problems?.[selectedProblemIndex]?.id,
 userId: user?.id,
 }),
 })

 const handleSubmit = async () => {
 if (!user) {
 router.push(loginPathFromLocation())
 return
 }
 if (!code.trim() || code.trim().length < 10) return
 if (!assignment?.problems?.[selectedProblemIndex]) return
 // 作业状态守卫：upcoming/ended(无 allowLateSubmission) 禁止提交
 if (assignment.status === 'upcoming') return
 if (assignment.status === 'ended' && !assignment.allowLateSubmission) return
 if (submitCooldown) return
 const epoch = beginSubmitSession()
 if (epoch < 0) return
 setSubmitCooldown(true)

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
 if (!isEpochCurrent(epoch)) return
 if (data.success) {
 const payload = data.data
 const submissionId = payload?.submissionId
 if (!submissionId || !bindSubmission(epoch, submissionId)) return
 setProblemTab('submissions')
 setExpandedSubmissionId(submissionId)
 setSubmissions((prev) => {
 const list = Array.isArray(prev) ? prev : []
 if (list.some((s) => s?.id === submissionId)) return list
 const problemId = assignment.problems[selectedProblemIndex].id
 return [
 createPendingListRow({
 id: submissionId,
 language,
 code,
 extras: {
 userId: user.id,
 problemId,
 assignmentSubmissionId: payload.assignmentSubmissionId,
 },
 }),
 ...list,
 ]
 })
 } else {
 abortSubmitSession()
 const cooldownMs = data.code === 'SUBMIT_TOO_FREQUENT' ? 10000 : 3000
 setTimeout(() => setSubmitCooldown(false), cooldownMs)
 }
 } catch {
 abortSubmitSession()
 setTimeout(() => setSubmitCooldown(false), 3000)
 }
 }

 const handleDeleteAssignment = async () => {
   if (!assignment) return
   const ok = await dialog.confirm({
     message: '确定要删除这个作业吗？此操作不可恢复，所有提交记录将被清除。',
     tone: 'warning',
     confirmText: '删除',
     confirmVariant: 'destructive',
     cancelText: '取消',
   })
   if (!ok) return
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
   } catch {
     setError('删除失败，请重试')
   } finally {
     setLoading(false)
   }
 }

 const getStatusConfig = (status: string) => {
 switch (status) {
 case 'active': return { label: '进行中', color: 'text-secondary bg-secondary/10 border-secondary/20' }
 case 'upcoming': return { label: '未开始', color: 'text-primary bg-primary/10 border-primary/20' }
 case 'ended': return { label: '已结束', color: 'text-muted-foreground bg-muted border-border' }
 default: return { label: status, color: 'text-muted-foreground bg-muted border-border' }
 }
 }

 /** 班级班主任/助教，或站点管理员/教师，均可查看完成情况 */
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
 const problemCount = assignment.problems?.length || 0
 // 按题目去重：同一题多次 AC 只计 1
 const solvedCount = new Set(
   submissions
     .filter((s) => isAcceptedStatus(s.status) && s.problemId)
     .map((s) => s.problemId as string)
 ).size

 const switchViewTab = (key: ViewTab) => {
   // 学生不可进入完成情况；避免 URL 夹带 tab=completion 时整页空白
   const next = key === 'completion' && !isAdminOrOwner ? 'info' : key
   setViewTab(next)
   const tabParams = new URLSearchParams(searchParams.toString())
   tabParams.set('tab', next)
   router.replace(`${window.location.pathname}?${tabParams.toString()}`, { scroll: false })
 }

 // 成员角色未就绪时 canManage 仍可能为 true（站内教师）；班级助教需等 members
 const effectiveViewTab: ViewTab =
   viewTab === 'completion' && !isAdminOrOwner ? 'info' : viewTab

 const tabs = [
   { key: 'info' as const, label: '简介', icon: Info },
   { key: 'problems' as const, label: '题目', icon: FileText },
   ...(isAdminOrOwner
     ? [{ key: 'completion' as const, label: '完成情况', icon: BarChart3 }]
     : []),
 ]

 const openProblemAt = (index: number) => {
   setSelectedProblemIndex(index)
   setExpandedSubmissionId(null)
   setProblemTab('description')
   switchViewTab('problems')
 }

 // 进度已在顶栏展示，侧栏不再重复「完成」
 const infoItems = [
   {
     icon: Calendar,
     label: '起止时间',
     value: (
       <span className="tabular-nums text-xs sm:text-sm">
         {formatDateTime(assignment.startTime)}
         <span className="mx-1 text-muted-foreground">—</span>
         {formatDateTime(assignment.endTime)}
       </span>
     ),
   },
   {
     icon: FileCode,
     label: '题目数量',
     value: `${problemCount} 题`,
   },
   {
     icon: Clock,
     label: '补交',
     value: assignment.allowLateSubmission ? '允许截止后提交' : '不允许补交',
   },
 ]

 const statusHint =
   assignment.status === 'upcoming'
     ? '作业尚未开始，可先阅读说明与题目（开始后方可提交）。'
     : assignment.status === 'ended'
       ? assignment.allowLateSubmission
         ? '已截止，仍允许补交。'
         : '作业已截止，仍可查看题目与提交记录。'
       : '作业进行中，可进入作答。'

 const enterProblemsLabel =
   assignment.status === 'upcoming'
     ? '查看题目'
     : assignment.status === 'ended'
       ? assignment.allowLateSubmission
         ? '进入补交'
         : '查看题目'
       : '进入题目'

 return (
 <div className="min-h-screen bg-background pb-20 lg:pb-6">
 <PageContainer variant="workspace" className="py-4">
 <EntityDetailHeader
   layoutId="assignment-view-tab-indicator"
   title={
     <>
       <h1 className="text-lg font-bold text-foreground truncate">{assignment.title}</h1>
       <span
         className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusConfig.color}`}
       >
         {statusConfig.label}
       </span>
     </>
   }
   meta={
     <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
       <span className="inline-flex items-center gap-1">
         <CheckCircle2 className="w-3.5 h-3.5 text-secondary-light" />
         完成 {solvedCount}/{problemCount}
       </span>
     </div>
   }
   actions={
     isAdminOrOwner ? (
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
     ) : undefined
   }
   tabs={tabs}
   activeKey={effectiveViewTab}
   onSelect={(key) => switchViewTab(key as ViewTab)}
 />

 {effectiveViewTab === 'info' && (
   <EntityOverviewLayout
     main={
       <EntityDescriptionCard
         title="作业说明"
         content={assignment.description}
         emptyTitle="暂无作业说明"
         emptyHint={
           isAdminOrOwner
             ? '可点击顶部「编辑」，补充要求、参考资料与注意事项（支持 Markdown）'
             : assignment.status === 'upcoming'
               ? '老师尚未填写说明，开始前可先查看题目'
               : '老师尚未填写说明，可进入题目作答'
         }
         footer={
           problemCount > 0 ? (
             <div className="mt-5 pt-4 border-t border-border">
               <p className="text-xs text-muted-foreground mb-2">题目一览</p>
               <div className="flex flex-wrap gap-2">
                 {assignment.problems.map((p, idx) => {
                   const letter = String.fromCharCode(65 + idx)
                   const done = submissions.some(
                     (s) => s.problemId === p.id && isAcceptedStatus(s.status)
                   )
                   return (
                     <button
                       key={p.id}
                       type="button"
                       title={p.title}
                       onClick={() => openProblemAt(idx)}
                       className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                         done
                           ? 'border-secondary/30 bg-secondary/10 text-secondary'
                           : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                       }`}
                     >
                       <span className="font-mono font-bold">{letter}</span>
                       <span className="truncate max-w-[10rem]">{p.title}</span>
                     </button>
                   )
                 })}
               </div>
             </div>
           ) : undefined
         }
       />
     }
     aside={
       <>
         <div className="card-static p-4 space-y-3 rounded-xl">
           <p className="text-xs text-muted-foreground leading-relaxed">{statusHint}</p>
           <button
             type="button"
             onClick={() => switchViewTab('problems')}
             className="btn btn-primary w-full"
             disabled={problemCount === 0}
           >
             {problemCount === 0 ? '暂无题目' : enterProblemsLabel}
           </button>
         </div>
         <EntityInfoCard title="基本信息" items={infoItems} />
       </>
     }
   />
 )}

 {effectiveViewTab === 'problems' && (
 <ProblemWorkspaceShell
 dense
 codeMode={problemTab === 'code'}
 className="pb-20 lg:pb-0"
 leftSelector={
 <AssignmentProblemProgressList
 problems={assignment.problems || []}
 submissions={submissions}
 selectedIndex={selectedProblemIndex}
 onSelect={(index) => {
 setSelectedProblemIndex(index)
 setExpandedSubmissionId(null)
 setProblemTab('description')
 }}
 classId={classId}
 assignmentId={params.assignmentId as string}
 assignmentEndTime={assignment.endTime}
 />
 }
 leftHeader={
 <ProblemWorkspaceDesktopTabs
 tabs={PRESET.desktopTabs}
 activeTab={problemTab}
 onChange={setProblemTab}
 layoutId="assignment-problem-tab-indicator"
 dense={PRESET.dense}
 leading={
 selectedProblem ? (
 <ProblemWorkspaceSelectedTitle
 letter={String.fromCharCode(65 + selectedProblemIndex)}
 title={selectedProblem.title}
 />
 ) : null
 }
 />
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
 <ProblemDescription
 problem={problemDetail}
 hideTags={PRESET.hideDescriptionTags}
 />
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
 submissions={submissions.filter((s) => s.problemId === selectedProblem?.id)}
 loading={false}
 error={null}
 user={user}
 expandedId={expandedSubmissionId}
 onExpandedChange={setExpandedSubmissionId}
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
 tags={PRESET.hideDifficultyAndTags ? undefined : problemDetail.tags}
 difficulty={
 PRESET.hideDifficultyAndTags ? undefined : problemDetail.difficulty
 }
 hideDifficultyAndTags={PRESET.hideDifficultyAndTags}
 />
 ) : null
 }
 rightHeader={<ProblemSubmitColumnHeader />}
 rightPanel={
 <ProblemSubmitColumn
 user={user}
 code={code}
 language={language}
 onCodeChange={setCode}
 onLanguageChange={setLanguage}
 onSubmit={() => void handleSubmit()}
 submitting={submitting}
 problemId={String(
 problemDetail?.id || problemDetail?._id || selectedProblem?.id || '',
 ) || null}
 statusBanner={
 <>
 {user && assignment.status === 'upcoming' && (
 <div className="p-2.5 rounded-lg bg-info/10 border border-info/20 text-info text-xs flex items-center gap-2">
 <AlertCircle className="w-3.5 h-3.5 shrink-0" />
 作业尚未开始，{assignment.startTime ? `将在 ${formatDateTime(assignment.startTime)} 开放提交` : '暂不可提交'}
 </div>
 )}
 {user && assignment.status === 'ended' && !assignment.allowLateSubmission && (
 <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs flex items-center gap-2">
 <AlertCircle className="w-3.5 h-3.5 shrink-0" />
 作业已结束，不再接受新提交
 </div>
 )}
 {user && assignment.status === 'ended' && assignment.allowLateSubmission && (
 <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs flex items-center gap-2">
 <AlertCircle className="w-3.5 h-3.5 shrink-0" />
 作业已结束（允许逾期提交，分数会被标记为逾期）
 </div>
 )}
 </>
 }
 submitDisabled={
 submitCooldown ||
 assignment.status === 'upcoming' ||
 (assignment.status === 'ended' && !assignment.allowLateSubmission)
 }
 submitDisabledTitle={
 !user
 ? '请先登录'
 : assignment.status === 'upcoming'
 ? '作业尚未开始'
 : assignment.status === 'ended' && !assignment.allowLateSubmission
 ? '作业已结束'
 : submitting
 ? '正在评测中...'
 : submitCooldown
 ? '请稍后再试'
 : ''
 }
 submitLabel={
 submitCooldown
 ? '请稍候...'
 : assignment.status === 'upcoming'
 ? '未开始'
 : assignment.status === 'ended' && !assignment.allowLateSubmission
 ? '已结束'
 : '提交代码'
 }
 />
 }
 bottomBar={
 <ProblemWorkspaceMobileTabs
 tabs={PRESET.mobileTabs}
 activeTab={problemTab}
 onChange={setProblemTab}
 />
 }
 />
 )}

 {effectiveViewTab === 'completion' && isAdminOrOwner && (
 <StudentCompletionTable
 students={(Array.isArray(classMembers) ? classMembers : [])
 .filter((m) => isClassStudentApiRole(m.role))
 .map((member, index) => {
 const memberSubs = allSubmissions.filter(s => s.userId === member.userId)
 const submissionsMap: Record<string, MemberSubmission> = {}
 let totalScore = 0
 let completedCount = 0
 let totalTimeMs = 0

 memberSubs.forEach(sub => {
 if (!sub.problemId) return
 // 逾期提交不计分（完成情况表与评分口径一致）
 const rawScore = sub.isLate ? 0 : (sub.score ?? 0)
 const existing = submissionsMap[sub.problemId]
 if (!existing || rawScore > (existing.score || 0)) {
 submissionsMap[sub.problemId] = {
 problemId: sub.problemId,
 status: sub.isLate ? (sub.status === 'AC' ? 'LATE' : sub.status) : sub.status,
 score: rawScore,
 submittedAt: sub.submittedAt,
 timeElapsedMs: sub.timeElapsedMs || 0,
 }
 }
 })

 Object.values(submissionsMap).forEach((sub: MemberSubmission) => {
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
 setCode('')
 openProblemAt(index)
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
 onClose={closeResultModal}
 isJudging={submitting}
 judgeProgress={judgeProgress}
 result={lastResult}
 onContinueSubmit={() => {
 const cmContent = document.querySelector('[data-testid="code-editor-wrapper"] .cm-content') as HTMLElement | null
 cmContent?.focus()
 closeResultModal()
 }}
 onViewDetail={(submissionId) => {
 closeResultModal()
 setProblemTab('submissions')
 setExpandedSubmissionId(submissionId)
 }}
 />
 </div>
 )
}
