'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Lock,
  PenSquare,
  AlertCircle,
  Sparkles,
  ChevronRight
} from 'lucide-react'
import { logger } from '@/lib/logger'
import { useUser } from '@/contexts/UserContext'
import SolutionCard, { type SolutionListItem } from '@/components/solution/SolutionCard'
import { fetchWithCookie } from '@/lib/api/base'

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
 router.push(`/problems/${problemId}/solutions/new`)
 }

 const handleSolutionClick = (solutionId: string) => {
 router.push(`/problems/${problemId}/solutions/${solutionId}`)
 }

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
 <span>共 {solutions.length} 篇题解</span>
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

 {!solutionsLoading && !solutionsError && solutions.length > 0 && (
 <div className="card-static rounded-lg overflow-hidden">
 {solutions.map((solution) => (
 <SolutionCard
 key={solution.id}
 solution={solution}
 onClick={() => handleSolutionClick(solution.id)}
 />
 ))}
 </div>
 )}
 </div>
 )
}
