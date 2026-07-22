'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Lock,
  PenSquare,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Code2
} from 'lucide-react'
import { logger } from '@/lib/logger'
import { useUser } from '@/contexts/UserContext'
import SolutionCard, { type SolutionListItem } from '@/components/solution/SolutionCard'
import { fetchWithCookie } from '@/lib/api/base'
import CreateSolutionModal from '@/components/solution/CreateSolutionModal'

/**
 * Phase 6 Task 32.4: 语言 Tab 优先级排序
 *
 * C++ / Python 优先展示（标程多语言同步后这两个最常见），其他语言按字母序追加。
 * 仅展示有值的语言（即 solutions 中至少有 1 篇使用该语言）。
 */
const LANGUAGE_PRIORITY: Record<string, number> = {
  cpp: 0,
  'c++': 0,
  python: 1,
  python3: 1,
}

function normalizeLanguage(lang: string): string {
  const key = (lang || '').toLowerCase().trim()
  if (key === 'c++' || key === 'cpp' || key === 'c') return 'cpp'
  if (key === 'python' || key === 'python3' || key === 'py') return 'python'
  if (key === 'java') return 'java'
  if (key === 'javascript' || key === 'js' || key === 'typescript' || key === 'ts') return key
  return key
}

function getLanguageLabel(norm: string): string {
  switch (norm) {
    case 'cpp': return 'C++'
    case 'python': return 'Python'
    case 'java': return 'Java'
    case 'javascript': return 'JavaScript'
    case 'typescript': return 'TypeScript'
    default: return norm
  }
}

function getLanguagePriority(norm: string): number {
  return LANGUAGE_PRIORITY[norm] ?? 100
}

interface SolutionTabPanelProps {
 problemId: string
 isAssignmentContext?: boolean
 onRequireLogin?: () => void
}

type PermissionReason =
 | 'ADMIN'
 | 'TEACHER'
 | 'ENOUGH_SCORE'
 | 'ASSIGNMENT_CONTEXT'
 | 'NO_SUBMISSION'
 | 'LOW_SCORE'

interface PermissionResult {
 allowed: boolean
 reason: PermissionReason
 bestScore?: number
 requiredScore: number
}

const REASON_TEXT: Record<
 Exclude<PermissionReason, 'ADMIN' | 'TEACHER' | 'ENOUGH_SCORE'>,
 (result: PermissionResult) => string
> = {
 ASSIGNMENT_CONTEXT: () => '作业场景下不显示题解',
 NO_SUBMISSION: () => '请先尝试提交本题，达到 60 分即可查看',
 LOW_SCORE: (result) =>
 `再接再厉！当前最高分 ${result.bestScore ?? 0}，达到 60 分即可查看`
}

function getLockMessage(result: PermissionResult): string {
 return REASON_TEXT[result.reason as keyof typeof REASON_TEXT]?.(result)
 ?? '当前不可查看题解'
}

export default function SolutionTabPanel({
 problemId,
 isAssignmentContext = false,
 onRequireLogin
}: SolutionTabPanelProps) {
 const router = useRouter()
 const { user } = useUser()

 const [permission, setPermission] = useState<PermissionResult | null>(null)
 const [permissionLoading, setPermissionLoading] = useState(true)
 const [permissionError, setPermissionError] = useState<string | null>(null)

 const [solutions, setSolutions] = useState<SolutionListItem[]>([])
 const [solutionsLoading, setSolutionsLoading] = useState(false)
 const [solutionsError, setSolutionsError] = useState<string | null>(null)

 // Phase 6 Task 32.4: 语言筛选 tab（'all' = 全部，'cpp' / 'python' / ... = 按语言过滤）
 const [languageFilter, setLanguageFilter] = useState<string>('all')
 const [createOpen, setCreateOpen] = useState(false)

 useEffect(() => {
 let cancelled = false

 const fetchPermission = async () => {
 try {
 setPermissionLoading(true)
 setPermissionError(null)

 const params = new URLSearchParams({ problemId })
 if (isAssignmentContext) {
 params.set('isAssignmentContext', '1')
 }

  const response = await fetchWithCookie(
    `/api/solutions/check-permission?${params.toString()}`
  )
 const data = await response.json().catch(() => null)

 if (cancelled) return

 if (!response.ok || !data || data.success !== true) {
 setPermissionError(data?.error?.message || '权限检查失败')
 return
 }

 setPermission(data.data as PermissionResult)
 } catch (error) {
 if (cancelled) return
 logger.error('题解权限检查失败', error)
 setPermissionError('网络错误，请稍后重试')
 } finally {
 if (!cancelled) {
 setPermissionLoading(false)
 }
 }
 }

 fetchPermission()

 return () => {
 cancelled = true
 }
 }, [problemId, isAssignmentContext])

 useEffect(() => {
 if (!permission?.allowed) {
 setSolutions([])
 return
 }

 let cancelled = false

 const fetchSolutions = async () => {
 try {
 setSolutionsLoading(true)
 setSolutionsError(null)

 const params = new URLSearchParams({ problemId })
 if (isAssignmentContext) {
 params.set('isAssignmentContext', '1')
 }

  const response = await fetchWithCookie(`/api/solutions?${params.toString()}`)
 const data = await response.json().catch(() => null)

 if (cancelled) return

 if (!response.ok || !data || data.success !== true) {
 setSolutionsError(data?.error?.message || '加载题解失败')
 return
 }

 const list = Array.isArray(data.data?.items)
 ? data.data.items
 : Array.isArray(data.data?.solutions)
 ? data.data.solutions
 : Array.isArray(data.data)
 ? data.data
 : []

 setSolutions(list as SolutionListItem[])
 } catch (error) {
 if (cancelled) return
 logger.error('加载题解列表失败', error)
 setSolutionsError('网络错误，请稍后重试')
 } finally {
 if (!cancelled) {
 setSolutionsLoading(false)
 }
 }
 }

 fetchSolutions()

 return () => {
 cancelled = true
 }
 }, [permission, problemId, isAssignmentContext])

 const handleWriteSolution = () => {
 if (!user) {
 if (onRequireLogin) {
 onRequireLogin()
 return
 }
 router.push('/login')
 return
 }
 setCreateOpen(true)
 }

 const handleSolutionClick = (solutionId: string) => {
 router.push(`/problems/${problemId}/solutions/${solutionId}`)
 }

 // Phase 6 Task 32.4: 派生可用语言列表（仅展示有值的语言）
 const availableLanguages = useMemo(() => {
  const counts = new Map<string, number>()
  for (const s of solutions) {
   const norm = normalizeLanguage(s.codeLanguage)
   counts.set(norm, (counts.get(norm) ?? 0) + 1)
  }
  return Array.from(counts.entries())
   .map(([norm, count]) => ({ norm, count }))
   .sort((a, b) => {
    const pa = getLanguagePriority(a.norm)
    const pb = getLanguagePriority(b.norm)
    if (pa !== pb) return pa - pb
    return a.norm.localeCompare(b.norm)
   })
 }, [solutions])

 // Phase 6 Task 32.4: 当前选中的语言若已无对应题解，回退到 'all'
 useEffect(() => {
  if (languageFilter === 'all') return
  const stillExists = solutions.some(s => normalizeLanguage(s.codeLanguage) === languageFilter)
  if (!stillExists) setLanguageFilter('all')
 }, [solutions, languageFilter])

 // Phase 6 Task 32.4: 按语言过滤后的题解列表
 const filteredSolutions = useMemo(() => {
  if (languageFilter === 'all') return solutions
  return solutions.filter(s => normalizeLanguage(s.codeLanguage) === languageFilter)
 }, [solutions, languageFilter])

 if (permissionLoading) {
 return (
 <div className="space-y-4" aria-busy="true" aria-live="polite">
 {[0, 1, 2].map((i) => (
 <div
 key={i}
 className="card-static rounded-lg p-5 flex gap-4 animate-pulse"
 >
 <div className="w-12 h-12 rounded-full bg-muted" />
 <div className="flex-1 space-y-3">
 <div className="h-4 bg-muted rounded w-2/3" />
 <div className="h-3 bg-muted rounded w-1/3" />
 <div className="h-3 bg-muted rounded w-1/4" />
 </div>
 </div>
 ))}
 </div>
 )
 }

 if (permissionError) {
 return (
 <div className="text-center py-12">
 <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
 <AlertCircle className="w-8 h-8 text-error" />
 </div>
 <p className="text-error text-lg">{permissionError}</p>
 </div>
 )
 }

 if (permission && !permission.allowed) {
 return (
 <div className="card-static rounded-lg p-10 text-center animate-fadeIn">
 <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-5">
 <Lock className="w-8 h-8 text-muted-foreground" />
 </div>
 <h3 className="text-lg font-semibold text-foreground mb-2">
 🔒 题解已锁定
 </h3>
 <p className="text-muted-foreground max-w-md mx-auto">
 {getLockMessage(permission)}
 </p>
 </div>
 )
 }

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between gap-3 flex-wrap">
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Sparkles className="w-4 h-4 text-primary-light" />
 <span>
 共 {solutions.length} 篇题解
 {languageFilter !== 'all' && (
  <span className="ml-1 text-primary-light">
   · 当前筛选 {getLanguageLabel(languageFilter)}（{filteredSolutions.length}）
  </span>
 )}
 </span>
 </div>
 <button
 onClick={handleWriteSolution}
 className="btn-primary btn flex items-center gap-2 group"
 >
 <PenSquare className="w-4 h-4 transition-transform duration-300 group-hover:rotate-6" />
 <span>我要写题解</span>
 <ChevronRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
 </button>
 </div>

 {/* Phase 6 Task 32.4: 语言切换 Tab（仅展示有值的语言） */}
 {solutions.length > 0 && availableLanguages.length > 1 && (
 <div className="flex items-center gap-1.5 flex-wrap border-b border-border pb-2">
 <button
 onClick={() => setLanguageFilter('all')}
 className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition-colors flex items-center gap-1 ${
  languageFilter === 'all'
  ? 'bg-primary/10 text-primary border-b-2 border-primary'
  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 <Code2 className="w-3.5 h-3.5" />
 全部
 <span className="opacity-60">({solutions.length})</span>
 </button>
 {availableLanguages.map(({ norm, count }) => {
  const active = languageFilter === norm
  return (
  <button
   key={norm}
   onClick={() => setLanguageFilter(norm)}
   className={`px-3 py-1.5 rounded-t-md text-xs font-medium transition-colors ${
   active
    ? 'bg-primary/10 text-primary border-b-2 border-primary'
    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
   }`}
   title={`仅展示 ${getLanguageLabel(norm)} 题解`}
  >
   {getLanguageLabel(norm)}
   <span className="opacity-60 ml-0.5">({count})</span>
  </button>
  )
 })}
 </div>
 )}

 {solutionsLoading && (
 <div className="space-y-4" aria-busy="true" aria-live="polite">
 {[0, 1, 2].map((i) => (
 <div
 key={i}
 className="card-static rounded-lg p-5 flex gap-4 animate-pulse"
 >
 <div className="w-12 h-12 rounded-full bg-muted" />
 <div className="flex-1 space-y-3">
 <div className="h-4 bg-muted rounded w-2/3" />
 <div className="h-3 bg-muted rounded w-1/3" />
 <div className="h-3 bg-muted rounded w-1/4" />
 </div>
 </div>
 ))}
 </div>
 )}

 {!solutionsLoading && solutionsError && (
 <div className="text-center py-12">
 <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
 <AlertCircle className="w-8 h-8 text-error" />
 </div>
 <p className="text-error text-lg">{solutionsError}</p>
 </div>
 )}

 {!solutionsLoading && !solutionsError && solutions.length === 0 && (
 <div className="text-center py-12">
 <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
 <Sparkles className="w-8 h-8 text-muted-foreground" />
 </div>
 <p className="text-muted-foreground">暂无题解，期待你的第一篇！</p>
 </div>
 )}

 {!solutionsLoading && !solutionsError && solutions.length > 0 && filteredSolutions.length === 0 && (
 <div className="text-center py-12">
 <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
 <Code2 className="w-8 h-8 text-muted-foreground" />
 </div>
 <p className="text-muted-foreground">
 暂无 {getLanguageLabel(languageFilter)} 题解
 </p>
 <button
 onClick={() => setLanguageFilter('all')}
 className="mt-2 text-xs text-primary hover:text-primary-dark"
 >
 查看全部语言
 </button>
 </div>
 )}

 {!solutionsLoading && !solutionsError && filteredSolutions.length > 0 && (
 <div className="card-static rounded-lg overflow-hidden">
 {filteredSolutions.map((solution) => (
 <SolutionCard
 key={solution.id}
 solution={solution}
 onClick={() => handleSolutionClick(solution.id)}
 />
 ))}
 </div>
 )}
 <CreateSolutionModal
 open={createOpen}
 onClose={() => setCreateOpen(false)}
 problemId={problemId}
 />
 </div>
 )
}
