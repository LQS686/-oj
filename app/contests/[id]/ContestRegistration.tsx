'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, UserCheck, AlertCircle, LogIn, Play } from 'lucide-react'
import { fetchWithCookie } from '@/lib/api/base'

interface Contest {
 id: string
 title: string
 type: string
 startTime: Date
 endTime: Date
 isPublic: boolean
 password?: string | null
}

export default function ContestRegistration({ contest }: { contest: Contest }) {
 const router = useRouter()
 const [loading, setLoading] = useState(true)
 const [isRegistered, setIsRegistered] = useState(false)
 const [password, setPassword] = useState('')
 const [error, setError] = useState('')
 const [registering, setRegistering] = useState(false)
 const [isLoggedIn, setIsLoggedIn] = useState(false)
 const [now, setNow] = useState(new Date())

 useEffect(() => {
 checkStatus()
 const timer = setInterval(() => setNow(new Date()), 1000)
 return () => clearInterval(timer)
 }, [])

 const checkStatus = async () => {
 try {
 setLoading(true)
 const res = await fetchWithCookie(`/api/contests/${contest.id}`)
 const data = await res.json()
 
 if (data.success) {
  setIsRegistered(!!data.data.isRegistered)
  const authRes = await fetchWithCookie('/api/auth/me')
 setIsLoggedIn(authRes.ok)
 }
 } catch (err) {
 console.error('Check status failed', err)
 } finally {
 setLoading(false)
 }
 }

 const handleRegister = async () => {
 try {
 setRegistering(true)
 setError('')

 const res = await fetchWithCookie(`/api/contests/${contest.id}/register`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({ password })
 })

 const data = await res.json()

 if (data.success) {
 setIsRegistered(true)
 router.refresh()
 } else {
 setError(data.error || '报名失败')
 }
 } catch (err) {
 setError('网络错误，请稍后重试')
 } finally {
 setRegistering(false)
 }
 }

 if (loading) {
 return <div className="card rounded-lg p-6">
 <div className="skeleton h-32 rounded-xl"></div>
 </div>
 }

 if (!isLoggedIn) {
 return (
 <div className="card p-6 rounded-lg text-center">
 <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
 <LogIn className="w-6 h-6 text-primary-light" />
 </div>
 <h3 className="text-lg font-semibold text-foreground mb-2">请先登录</h3>
 <p className="text-muted-foreground mb-6">登录后即可报名参加竞赛</p>
 <button
 onClick={() => router.push(`/login?redirect=/contests/${contest.id}`)}
 className="btn btn-primary w-full"
 >
 <LogIn className="w-4 h-4" />
 去登录
 </button>
 </div>
 )
 }

 if (isRegistered) {
 const isStarted = new Date(contest.startTime) <= now
 
 return (
 <div className="card p-6 rounded-lg">
 <div className="flex flex-col items-center text-center">
 <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center mb-4">
 <UserCheck className="w-6 h-6 text-secondary-light" />
 </div>
 <h3 className="text-lg font-semibold text-secondary-light mb-2">已报名</h3>
 <p className="text-muted-foreground mb-6">你已成功报名参加本次竞赛</p>
 <button
 onClick={() => router.push(`/contests/${contest.id}/problems`)}
 disabled={!isStarted}
 className={`btn w-full ${!isStarted ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-secondary'}`}
 >
 <Play className="w-4 h-4" />
 {!isStarted ? '等待比赛开始' : '进入比赛'}
 </button>
 </div>
 </div>
 )
 }

 return (
 <div className="card p-6 rounded-lg">
 <h3 className="text-lg font-bold text-foreground mb-4">报名参赛</h3>
 
 {contest.type === 'Private' || contest.password ? (
 <div className="mb-4">
 <label className="block text-sm font-medium text-muted-foreground mb-2">
 竞赛密码
 </label>
 <div className="relative">
 <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
 <input
 type="password"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 className="input pl-11"
 placeholder="请输入邀请码或密码"
 />
 </div>
 </div>
 ) : (
 <p className="text-muted-foreground mb-4 leading-relaxed">
 本次竞赛为公开赛，点击下方按钮即可直接报名。
 </p>
 )}

 {error && (
 <div className="mb-4 p-3 bg-error/10 text-error rounded-lg text-sm flex items-center gap-2 border border-error/20">
 <AlertCircle className="w-4 h-4 flex-shrink-0" />
 {error}
 </div>
 )}

 <button
 onClick={handleRegister}
 disabled={registering}
 className={`btn w-full ${registering ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-primary'}`}
 >
 {registering ? '正在报名...' : '立即报名'}
 </button>
 </div>
 )
}
