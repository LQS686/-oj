'use client'

/**
 * components/training/JoinTrainingButton.tsx
 * 加入 / 退出 题单 按钮
 *
 * 设计要点（参考 /problem/[id] 修复模式）：
 * 1. useRef<joiningRef> 替代闭包陈旧值
 * 2. isJoining 独立 state，不被任何门控
 * 3. catch + finally 中重置 isJoining
 * 4. disabled={isJoining} 防双击
 */
import { useRef, useState } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, LogIn, Play, UserPlus, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchWithCookie } from '@/lib/api/base'
import { loginPath } from '@/lib/navigation'
import { useDialog } from '@/components/common'

interface JoinTrainingButtonProps {
 trainingId: string
 initialJoined: boolean
 isLoggedIn: boolean
 solvedCount?: number
 /** 已加入时「开始/继续学习」；优先于 startHref，便于同页切换练习 Tab */
 onStart?: () => void
 startHref?: string
 onJoinedChange?: (joined: boolean) => void
 className?: string
}

export function JoinTrainingButton({
 trainingId,
 initialJoined,
 isLoggedIn,
 solvedCount = 0,
 onStart,
 startHref,
 onJoinedChange,
 className = '',
}: JoinTrainingButtonProps) {
 const dialog = useDialog()
 const router = useRouter()
 const [joined, setJoined] = useState(initialJoined)
 const [isJoining, setIsJoining] = useState(false)
 // ref 用于 in-flight 检测，防止双击
 const joiningRef = useRef(false)

 useDeferredEffect(() => {
   setJoined(initialJoined)
 }, [initialJoined])

 const handleJoin = async () => {
 if (!isLoggedIn) {
 router.push(loginPath(`/training/${trainingId}`))
 return
 }
 if (joiningRef.current) return
 joiningRef.current = true
 setIsJoining(true)
 try {
  const res = await fetchWithCookie(`/api/trainings/${trainingId}/join`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  })
 const data = await res.json()
 if (!res.ok || !data.success) {
 toast.error(data.error || '加入失败')
 return
 }
 setJoined(true)
 onJoinedChange?.(true)
 toast.success('已加入题单')
 } catch {
 toast.error('网络错误')
 } finally {
 setIsJoining(false)
 joiningRef.current = false
 }
 }

 const handleLeave = async () => {
 if (joiningRef.current) return
 const ok = await dialog.confirm({ message: '确定要退出该题单吗？', tone: 'warning' })
 if (!ok) return
 joiningRef.current = true
 setIsJoining(true)
 try {
  const res = await fetchWithCookie(`/api/trainings/${trainingId}/join`, {
    method: 'DELETE',
    cache: 'no-store',
  })
 const data = await res.json()
 if (!res.ok || !data.success) {
 toast.error(data.error || '退出失败')
 return
 }
 setJoined(false)
 onJoinedChange?.(false)
 toast.success('已退出题单')
 } catch {
 toast.error('网络错误')
 } finally {
 setIsJoining(false)
 joiningRef.current = false
 }
 }

 // 未登录：置灰 + 跳登录
 if (!isLoggedIn) {
 return (
 <button
 disabled
 className={`btn-secondary btn opacity-60 cursor-not-allowed ${className}`}
 title="登录后即可加入题单"
 >
 <LogIn className="w-4 h-4" />
 登录后加入
 </button>
 )
 }

 // 已加入
 if (joined) {
 return (
 <div className={`flex items-center gap-2 ${className}`}>
 <button
 onClick={() => {
   if (onStart) {
     onStart()
     return
   }
   router.push(startHref || `/training/${trainingId}?tab=problems`)
 }}
 className="btn-primary btn flex-1"
 >
 {solvedCount > 0 ? (
 <>
 <Play className="w-4 h-4" />
 继续学习
 </>
 ) : (
 <>
 <CheckCircle2 className="w-4 h-4" />
 开始学习
 </>
 )}
 </button>
 <button
 onClick={handleLeave}
 disabled={isJoining}
 className="btn-ghost btn text-muted-foreground hover:text-error"
 title="退出题单"
 >
 {isJoining ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
 </button>
 </div>
 )
 }

 // 未加入
 return (
 <button
 onClick={handleJoin}
 disabled={isJoining}
 className={`btn-primary btn ${className}`}
 >
 {isJoining ? (
 <>
 <Loader2 className="w-4 h-4 animate-spin" />
 加入中...
 </>
 ) : (
 <>
 <UserPlus className="w-4 h-4" />
 加入题单
 </>
 )}
 </button>
 )
}

export default JoinTrainingButton
