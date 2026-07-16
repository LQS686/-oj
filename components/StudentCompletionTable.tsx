'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Clock, Search, ChevronDown, User, Code, X, FileCode, Copy, Check } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'
import { formatDateTime, formatDateTimeShort } from '@/lib/utils'

interface RawSubmission {
 id: string
 userId?: string
 problemId: string
 status: string
 score: number
 submittedAt: string
 code?: string
 language?: string
}

interface StudentSubmission {
 problemId: string
 status: string
 score: number
 submittedAt?: string
}

interface Student {
 id: string
 name: string
 avatar: string
 submissions: Record<string, StudentSubmission>
 totalScore: number
 completedCount: number
}

interface Problem {
 id: string
 title: string
 difficulty: string
 totalSubmit: number
 totalAccepted: number
}

interface StudentCompletionTableProps {
 students: Student[]
 problems: Problem[]
 assignmentTitle: string
 onProblemClick?: (index: number) => void
 allSubmissions?: RawSubmission[]
 classId?: string
 assignmentId?: string
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const statusConfig: Record<string, { label: string; className: string; iconColor: string }> = {
 AC: { label: '通过', className: 'text-secondary bg-secondary/10', iconColor: 'text-secondary' },
 WA: { label: '错误', className: 'text-error bg-error/10', iconColor: 'text-error' },
 TLE: { label: '超时', className: 'text-warning bg-warning/10', iconColor: 'text-warning' },
 MLE: { label: '内存溢出', className: 'text-warning bg-warning/10', iconColor: 'text-warning' },
 RE: { label: '运行错误', className: 'text-error bg-error/10', iconColor: 'text-error' },
 CE: { label: '编译错误', className: 'text-accent bg-accent/10', iconColor: 'text-accent' },
 Pending: { label: '评测中', className: 'text-primary-light bg-primary/10', iconColor: 'text-primary-light' }
}

function getStatusIcon(status: string) {
 const config = statusConfig[status]
 switch (status) {
 case 'AC':
 return <CheckCircle2 className="w-4 h-4 text-secondary" />
 case 'Pending':
 return <Clock className="w-3.5 h-3 text-muted-foreground animate-spin" />
 default:
 return <XCircle className="w-4 h-4 text-error" />
 }
}

function SubmissionModal({
 studentName,
 problem,
 problemIndex,
 submissions,
 onClose
}: {
 studentName: string
 problem: Problem
 problemIndex: number
 submissions: RawSubmission[]
 onClose: () => void
}) {
 const [selectedSubId, setSelectedSubId] = useState<string>('')
 const [codeMap, setCodeMap] = useState<Record<string, string>>({})
 const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
 const [copied, setCopied] = useState(false)

 const sortedSubs = [...submissions].sort((a, b) =>
 new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
 )

 useEffect(() => {
 if (sortedSubs.length > 0 && !selectedSubId) {
 const first = sortedSubs[0]
 setSelectedSubId(first.id)
 loadCode(first)
 }
 }, [])

 const loadCode = async (sub: RawSubmission) => {
 if (codeMap[sub.id]) return

 setLoadingIds(prev => new Set(prev).add(sub.id))
 try {
 if (sub.code) {
 setCodeMap(prev => ({ ...prev, [sub.id]: sub.code! }))
 return
 }
  const res = await fetchWithCookie(`/api/submissions/${sub.id}`)
 const data = await res.json()
 if (data.success && data.data?.code) {
 setCodeMap(prev => ({ ...prev, [sub.id]: data.data.code }))
 }
 } catch (e) { console.error('加载用户代码失败:', e) } finally {
 setLoadingIds(prev => {
 const next = new Set(prev)
 next.delete(sub.id)
 return next
 })
 }
 }

 const handleSelectSubmission = (sub: RawSubmission) => {
 setSelectedSubId(sub.id)
 loadCode(sub)
 }

 const handleCopy = async () => {
 if (!currentCode) return
 try {
 await navigator.clipboard.writeText(currentCode)
 setCopied(true)
 setTimeout(() => setCopied(false), 2000)
 } catch (e) { console.error('复制到剪贴板失败:', e) }
 }

 const currentCode = selectedSubId ? codeMap[selectedSubId] || null : null
 const isLoading = selectedSubId ? loadingIds.has(selectedSubId) : false
 const currentLang = sortedSubs.find((s: RawSubmission) => s.id === selectedSubId)?.language

 return (
 <div
 className="fixed inset-0 z-[110] flex items-center justify-center p-4"
 onClick={onClose}
 >
 <div className="absolute inset-0 bg-black/50" />

 <div
 className="relative bg-background rounded-xl border border-border shadow-xl w-full max-w-3xl h-[70vh] flex flex-col overflow-hidden"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
 <div className="flex items-center gap-2.5 min-w-0">
 <span className="shrink-0 w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center font-mono text-sm font-bold text-primary-light">
 {LETTERS[problemIndex]}
 </span>
 <h3 className="font-semibold text-foreground truncate text-sm">{problem.title}</h3>
 <span className="shrink-0 text-muted-foreground">—</span>
 <span className="shrink-0 font-medium text-foreground text-sm truncate">{studentName}</span>
 </div>
 <button
 onClick={onClose}
 className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0 ml-2"
 >
 <X className="w-4 h-4 text-muted-foreground" />
 </button>
 </div>

 <div className="flex flex-1 min-h-0 overflow-hidden">
 <div className="w-[240px] shrink-0 border-r border-border overflow-y-auto">
 <div className="px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
 提交记录 ({sortedSubs.length})
 </div>
 <div className="divide-y divide-border/60">
 {sortedSubs.map((sub) => {
 const isActive = selectedSubId === sub.id
 const config = statusConfig[sub.status]
 return (
 <button
 key={sub.id}
 onClick={() => handleSelectSubmission(sub)}
 className={`w-full px-4 py-2.5 text-left transition-colors ${
 isActive ? 'bg-primary/5 border-l-2 border-primary' : 'hover:bg-muted border-l-2 border-transparent'
 }`}
 >
 <div className="flex items-center justify-between mb-0.5">
 <div className="flex items-center gap-1.5">
 {getStatusIcon(sub.status)}
 <span className={`text-xs font-medium ${config?.iconColor || 'text-muted-foreground'}`}>
 {config?.label || sub.status}
 </span>
 </div>
 <span className={`text-xs font-bold tabular-nums ${
 sub.status === 'AC' ? 'text-secondary' : sub.score > 0 ? 'text-accent' : 'text-muted-foreground'
 }`}>
 {sub.score}分
 </span>
 </div>
 <div className="text-[11px] text-muted-foreground tabular-nums">
 {formatDateTime(sub.submittedAt)}
 </div>
 </button>
 )
 })}
 </div>
 </div>

 <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
 <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
 <div className="flex items-center gap-2">
 <FileCode className="w-3.5 h-3.5 text-primary-light" />
 <span className="text-sm font-medium text-foreground">代码</span>
 {currentLang && (
 <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
 {currentLang}
 </span>
 )}
 </div>
 {currentCode && (
 <button
 onClick={handleCopy}
 className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
 copied
 ? 'bg-secondary/10 text-secondary'
 : 'hover:bg-muted text-muted-foreground hover:text-foreground'
 }`}
 >
 {copied ? (
 <>
 <Check className="w-3.5 h-3.5" />
 已复制
 </>
 ) : (
 <>
 <Copy className="w-3.5 h-3.5" />
 复制
 </>
 )}
 </button>
 )}
 </div>
 <div className="flex-1 overflow-auto p-4 bg-slate-950/50">
 {isLoading ? (
 <div className="flex items-center justify-center h-full">
 <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
 </div>
 ) : currentCode ? (
 <pre className="bg-slate-900 rounded-lg p-4 text-sm font-mono text-slate-100 leading-relaxed whitespace-pre-wrap break-all min-h-full">
 <code>{currentCode}</code>
 </pre>
 ) : (
 <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
 暂无代码数据
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 </div>
 )
}

export default function StudentCompletionTable({ students, problems, assignmentTitle, onProblemClick, allSubmissions, classId, assignmentId }: StudentCompletionTableProps) {
 const [searchTerm, setSearchTerm] = useState('')
 const [statusFilter, setStatusFilter] = useState('all')
 const [sortField, setSortField] = useState<'name' | 'score' | 'completed'>('name')
 const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

 const [modalState, setModalState] = useState<{
 studentName: string
 studentId: string
 problem: Problem
 problemIndex: number
 subs: RawSubmission[]
 } | null>(null)

 const filteredStudents = students.filter((student) => {
   if (searchTerm && !student.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
   if (statusFilter === 'AC') {
     return problems.length > 0 && student.completedCount >= problems.length
   }
   if (statusFilter === 'pending') {
     return student.completedCount < problems.length
   }
   return true
 })

 const sortedStudents = [...filteredStudents].sort((a, b) => {
 let comparison = 0
 switch (sortField) {
 case 'name':
 comparison = a.name.localeCompare(b.name)
 break
 case 'score':
 comparison = a.totalScore - b.totalScore
 break
 case 'completed':
 comparison = a.completedCount - b.completedCount
 break
 }
 return sortOrder === 'asc' ? comparison : -comparison
 })

 const getStudentSubmissions = (studentId: string, problemId: string): RawSubmission[] => {
 if (!allSubmissions) return []
 return allSubmissions.filter(s => s.userId === studentId && s.problemId === problemId)
 }

 const handleClickCell = (student: Student, problem: Problem, problemIndex: number) => {
 const subs = getStudentSubmissions(student.id, problem.id)
 if (subs.length === 0) return
 setModalState({
 studentName: student.name,
 studentId: student.id,
 problem,
 problemIndex,
 subs
 })
 }

 const getStatusDisplay = (submission?: StudentSubmission) => {
   if (!submission) {
     return <span className="text-muted-foreground/50 text-xs">未提交</span>
   }

   const cfg = statusConfig[submission.status]
   const statusLabel = cfg?.label || submission.status
   const scoreClass =
     submission.status === 'AC'
       ? 'text-secondary'
       : submission.score > 0
         ? 'text-accent'
         : 'text-muted-foreground'

   if (submission.status === 'Pending' || submission.status === 'Judging' || submission.status === 'Running') {
     return (
       <div className="flex flex-col items-center gap-0.5 min-w-[4.5rem]">
         <Clock className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
         <span className="text-[10px] text-muted-foreground">评测中</span>
       </div>
     )
   }

   return (
     <div className="flex flex-col items-center gap-0.5 min-w-[4.5rem] cursor-pointer hover:opacity-90 transition-opacity">
       <span className={`text-xs font-semibold tabular-nums ${scoreClass}`}>{submission.score} 分</span>
       <span className={`text-[10px] font-medium ${cfg?.iconColor || 'text-muted-foreground'}`}>{statusLabel}</span>
       <span className="text-[10px] text-muted-foreground tabular-nums leading-tight">
         {formatDateTimeShort(submission.submittedAt ?? '')}
       </span>
     </div>
   )
 }

 return (
 <>
 <div className="bg-card rounded-lg border border-border overflow-hidden">
 <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
 <div>
            <h2 className="text-base font-semibold text-foreground">学生作业完成情况</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              每格为该题最高分提交：分数、状态、提交时间（点击可查看全部提交）
            </p>
          </div>
 <div className="flex items-center gap-2">
 <div className="relative">
 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
 <input
 type="text"
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 placeholder="搜索学生..."
 className="pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-sm w-44 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
 />
 </div>
 <select
 value={statusFilter}
 onChange={(e) => setStatusFilter(e.target.value)}
 className="px-2.5 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:border-primary"
 >
 <option value="all">全部状态</option>
 <option value="AC">已通过</option>
 <option value="pending">未完成</option>
 </select>
 </div>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-muted text-left border-b border-border">
 <th className="px-3 py-2.5 font-medium text-muted-foreground sticky left-0 bg-muted z-[1] w-[110px]">
 学生
 </th>
 {problems.map((problem, index) => (
 <th
 key={problem.id}
 onClick={() => onProblemClick?.(index)}
 className={`px-2 py-2 font-mono font-bold text-sm text-center min-w-[5.25rem] select-none text-foreground/60 ${
 onProblemClick ? 'cursor-pointer hover:text-primary-light transition-colors' : ''
 }`}
 title={problem.title}
 >
 {LETTERS[index]}
 </th>
 ))}
 <th
 className="px-3 py-2.5 font-medium text-muted-foreground text-center cursor-pointer hover:text-foreground transition-colors select-none w-[72px]"
 onClick={() => {
 if (sortField === 'score') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
 else { setSortField('score'); setSortOrder('desc'); }
 }}
 >
 <span className="inline-flex items-center justify-center w-full">
 总分
 {sortField === 'score' && (
 <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${sortOrder === 'desc' ? '' : 'rotate-180'}`} />
 )}
 </span>
 </th>
 <th className="px-3 py-2.5 font-medium text-muted-foreground text-center w-[72px]">完成数</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border/40">
 {sortedStudents.length > 0 ? sortedStudents.map((student) => (
 <tr key={student.id} className="hover:bg-muted/[0.03] transition-colors">
 <td className="px-3 py-2.5 sticky left-0 bg-background z-[1]">
 <div className="flex items-center gap-2 min-w-0">
 {student.avatar ? (
 <img src={student.avatar} alt="" className="w-6 h-6 rounded-full shrink-0 object-cover" />
 ) : (
 <div className="w-6 h-6 rounded-full shrink-0 bg-primary flex items-center justify-center">
 <User className="w-3 h-3 text-white" />
 </div>
 )}
 <span className="font-medium text-foreground truncate">{student.name}</span>
 </div>
 </td>
 {problems.map((problem, index) => (
 <td
 key={problem.id}
 onClick={() => handleClickCell(student, problem, index)}
 className={`px-3 py-2.5 text-center align-middle ${
 student.submissions[problem.id]
 ? 'cursor-pointer hover:bg-muted transition-colors'
 : onProblemClick ? 'cursor-pointer hover:bg-muted transition-colors' : ''
 }`}
 >
 {getStatusDisplay(student.submissions[problem.id])}
 </td>
 ))}
 <td className="px-3 py-2.5 text-center tabular-nums font-semibold text-foreground align-middle">
 <span className="inline-flex items-center justify-center w-full">{student.totalScore}</span>
 </td>
 <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground align-middle">
 <span className="inline-flex items-center justify-center w-full">{student.completedCount} / {problems.length}</span>
 </td>
 </tr>
 )) : (
 <tr>
 <td colSpan={problems.length + 3} className="py-12 text-center text-muted-foreground text-sm">
 暂无学生数据
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>

 {filteredStudents.length > 0 && (
 <div className="px-5 py-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
 <span>共 {filteredStudents.length} 名学生</span>
 <span>平均分：{Math.round(filteredStudents.reduce((sum, s) => sum + s.totalScore, 0) / filteredStudents.length || 0)}</span>
 </div>
 )}
 </div>

 {modalState && (
 <SubmissionModal
 studentName={modalState.studentName}
 problem={modalState.problem}
 problemIndex={modalState.problemIndex}
 submissions={modalState.subs}
 onClose={() => setModalState(null)}
 />
 )}
 </>
 )
}
