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
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, LogIn, Play, UserPlus, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'

interface JoinTrainingButtonProps {
 trainingId: string
 initialJoined: boolean
 isLoggedIn: boolean
 solvedCount?: number
 onJoinedChange?: (joined: boolean) => void
 className?: string
}

export function JoinTrainingButton({
 trainingId,
 initialJoined,
 isLoggedIn,
 solvedCount = 0,
 onJoinedChange,
 className = '',
}: JoinTrainingButtonProps) {
 const router = useRouter()
 const [joined, setJoined] = useState(initialJoined)
 const [isJoining, setIsJoining] = useState(false)
 // ref 用于 in-flight 检测，防止双击
 const joiningRef = useRef(false)

 const handleJoin = async () => {
 if (!isLoggedIn) {
 router.push(`/login?redirect=/training/${trainingId}`)
 return
 }
 if (joiningRef.current) return
 joiningRef.current = true
 setIsJoining(true)
 try {
 const res = await fetch(`/api/trainings/${trainingId}/join`, {
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
 } catch (e) {
 toast.error('网络错误')
 } finally {
 setIsJoining(false)
 joiningRef.current = false
 }
 }

 const handleLeave = async () => {
 if (joiningRef.current) return
 if (!confirm('确定要退出该题单吗？')) return
 joiningRef.current = true
 setIsJoining(true)
 try {
 const res = await fetch(`/api/trainings/${trainingId}/join`, {
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
 } catch (e) {
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
 onClick={() => router.push(`/training/${trainingId}#problems`)}
 className="btn-primary btn"
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
