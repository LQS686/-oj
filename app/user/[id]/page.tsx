'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { User, Mail, Calendar, Trophy, Code, Target, TrendingUp, AlertCircle, Sparkles } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { User as UserType, ActivityData, RecentSubmission, DifficultyDistribution } from '@/types/models'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { motion, easeOut } from 'framer-motion'
import { fetchWithCookie } from '@/lib/api/base'

export default function UserProfilePage() {
 const params = useParams()
 const id = params.id as string
 
 const [user, setUser] = useState<UserType | null>(null)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [activityData, setActivityData] = useState<ActivityData[]>([])
 const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([])
 const [difficultyDistribution, setDifficultyDistribution] = useState<DifficultyDistribution[]>([])

 const profileTitle = user
   ? `${user.nickname || user.username} - 用户主页`
   : undefined
 useDocumentTitle(profileTitle)

 useEffect(() => {
 fetchUserInfo()
 fetchUserStats()
 }, [id])

 const fetchUserInfo = async () => {
 try {
 const res = await fetchWithCookie(`/api/users/${id}/info`)
 const data = await res.json()
 if (data.success) {
 setUser(data.data)
 } else {
 setError(data.error)
 }
 } catch (err) {
 console.error(err)
 setError('加载用户信息失败')
 } finally {
 setLoading(false)
 }
 }

 const fetchUserStats = async () => {
 try {
 const res = await fetchWithCookie(`/api/users/${id}/stats`)
 const data = await res.json()
 if (data.success) {
 const heatmapData = data.data.activity.lastWeek
 const chartData = Object.entries(heatmapData).map(([date, count]) => ({
 date,
 count: Number(count)
 })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
 
 const filledData = []
 const today = new Date()
 for (let i = 6; i >= 0; i--) {
 const d = new Date(today)
 d.setDate(d.getDate() - i)
 const dateStr = d.toISOString().split('T')[0]
 const found = chartData.find(item => item.date === dateStr)
 filledData.push({
 date: dateStr.slice(5).replace('-', '/'),
 count: found ? found.count : 0
 })
 }
 setActivityData(filledData)
 
 setRecentSubmissions(data.data.recentSubmissions || [])
 setDifficultyDistribution(data.data.difficultyDistribution || [])
 }
 } catch (err) {
 console.error(err)
 }
 }

 if (loading) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="text-center">
 <div className="relative w-20 h-20 mx-auto mb-8">
 <div className="absolute inset-0 rounded-full border-3 border-primary/15"></div>
 <div className="absolute inset-0 rounded-full border-3 border-primary border-t-transparent animate-spin"></div>
 </div>
 <p className="text-muted-foreground text-xl">加载用户信息中...</p>
 </div>
 </div>
 )
 }

 if (error || !user) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <motion.div 
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 className="card-static rounded-lg p-14 text-center max-w-md border border-error/10"
 >
 <div className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-8">
 <AlertCircle className="w-10 h-10 text-error" />
 </div>
 <h1 className="text-2xl font-bold text-foreground mb-3">无法访问用户主页</h1>
 <p className="text-muted-foreground text-lg">{error || '用户不存在'}</p>
 </motion.div>
 </div>
 )
 }

 const containerVariants = {
 hidden: { opacity: 0 },
 visible: {
 opacity: 1,
 transition: {
 staggerChildren: 0.1
 }
 }
 }

 const itemVariants = {
 hidden: { y: 20, opacity: 0 },
 visible: {
 y: 0,
 opacity: 1,
 transition: {
 duration: 0.4,
 ease: easeOut
 }
 }
 }

 return (
 <div className="min-h-screen">
 <div className="container mx-auto px-4 py-10">
 <motion.div 
 variants={containerVariants}
 initial="hidden"
 animate="visible"
 className="grid lg:grid-cols-3 gap-7"
 >
 <div className="lg:col-span-1 space-y-7">
 <motion.div variants={itemVariants} className="card-static rounded-lg p-8 border border-primary/5">
 <div className="text-center">
 <div 
 className="w-28 h-28 rounded-lg mx-auto mb-6 flex items-center justify-center text-white text-4xl font-bold overflow-hidden shadow-xl"
 style={{ backgroundColor: user.color || '#6366F1', boxShadow: `0 0 40px ${user.color || '#6366F1'}50` }}
 >
 {user.avatar ? (
 <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
 ) : (
 user.username?.charAt(0).toUpperCase() || '?'
 )}
 </div>
 <h2 className="text-3xl font-bold mb-2" style={{ color: user.color || undefined }}>
 {user.nickname || user.username}
 </h2>
 <p className="text-muted-foreground mb-4 text-base">@{user.username}</p>
 <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
 {user.rank && (
 <span 
 className="tag font-semibold text-sm px-4 py-1.5" 
 style={{ backgroundColor: (user.color || '#6366F1') + '15', color: user.color || undefined, borderColor: (user.color || '#6366F1') + '40' }}
 >
 {user.rank}
 </span>
 )}
 <span className="tag tag-primary text-sm px-4 py-1.5">
 Rating: {user.rating}
 </span>
 </div>
 {user.bio && (
 <p className="text-muted-foreground text-base mb-6 leading-relaxed">{user.bio}</p>
 )}
 </div>

 <div className="border-t border-border pt-6 space-y-4">
 <div className="flex items-center gap-3 text-sm text-muted-foreground">
 <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
 <Calendar className="w-4.5 h-4.5 text-primary-light" />
 </div>
 <span className="font-medium">加入于 {new Date(user.createdAt).toLocaleDateString('zh-CN')}</span>
 </div>
 </div>
 </motion.div>

 <motion.div variants={itemVariants} className="card-static rounded-lg p-8 border border-primary/5">
 <h3 className="text-xl font-bold mb-6 text-foreground">统计数据</h3>
 <div className="space-y-4">
 <div className="flex items-center justify-between p-4 rounded-lg bg-muted/25 hover:bg-muted transition-all">
 <span className="text-muted-foreground font-medium">解决题目</span>
 <span className="font-bold text-xl text-secondary-light">{user.acceptedSubmissions || 0}</span>
 </div>
 <div className="flex items-center justify-between p-4 rounded-lg bg-muted/25 hover:bg-muted transition-all">
 <span className="text-muted-foreground font-medium">总提交</span>
 <span className="font-bold text-xl text-primary-light">{user._count?.submissions || 0}</span>
 </div>
 <div className="flex items-center justify-between p-4 rounded-lg bg-muted/25 hover:bg-muted transition-all">
 <span className="text-muted-foreground font-medium">通过率</span>
 <span className="font-bold text-xl text-info">
 {(user._count?.submissions ?? 0) > 0 
 ? ((user.acceptedSubmissions / (user._count?.submissions ?? 1)) * 100).toFixed(1)
 : 0}%
 </span>
 </div>
 </div>
 </motion.div>

 <motion.div variants={itemVariants} className="card-static rounded-lg p-8 border border-accent/5">
 <h3 className="text-xl font-bold mb-6 flex items-center gap-3 text-foreground">
 <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
 <Trophy className="w-5 h-5 text-accent" />
 </div>
 成就徽章
 </h3>
 <div className="grid grid-cols-3 gap-4">
 {['🏆', '🥇', '🥈', '🥉', '⭐', '🎯'].map((emoji, index) => (
 <div 
 key={index} 
 className="aspect-square bg-muted/25 rounded-lg flex items-center justify-center text-4xl hover:bg-muted transition-all cursor-pointer group relative"
 >
 {emoji}
 <div className="absolute bottom-full mb-3 hidden group-hover:block px-4 py-2 bg-background-secondary text-foreground text-sm rounded-xl whitespace-nowrap border border-border shadow-xl z-10">
 示例徽章 {index + 1}
 </div>
 </div>
 ))}
 </div>
 </motion.div>
 </div>

 <div className="lg:col-span-2 space-y-7">
 <motion.div variants={itemVariants} className="card-static rounded-lg p-8 border border-primary/5">
 <h3 className="text-xl font-bold mb-6 flex items-center gap-3 text-foreground">
 <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
 <TrendingUp className="w-5 h-5 text-primary-light" />
 </div>
 通过记录 (近7天)
 </h3>
 <div className="h-[220px] w-full">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={activityData}>
 <defs>
 <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#818CF8" stopOpacity={0.8}/>
 <stop offset="95%" stopColor="#818CF8" stopOpacity={0}/>
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.1)" />
 <XAxis dataKey="date" axisLine={false} tickLine={false} stroke="#94A3B8" fontSize={13} />
 <YAxis axisLine={false} tickLine={false} allowDecimals={false} stroke="#94A3B8" fontSize={13} />
 <Tooltip 
 contentStyle={{ 
 borderRadius: '16px', 
 border: '1px solid rgba(148, 163, 184, 0.12)',
 boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
 backgroundColor: 'rgba(15, 23, 42, 0.98)',
 backdropFilter: 'blur(24px)',
 color: '#F8FAFC',
 padding: '12px 16px'
 }}
 />
 <Area type="monotone" dataKey="count" stroke="#818CF8" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </motion.div>

 <motion.div variants={itemVariants} className="card-static rounded-lg p-8 border border-secondary/5">
 <h3 className="text-xl font-bold mb-6 flex items-center gap-3 text-foreground">
 <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
 <Code className="w-5 h-5 text-secondary-light" />
 </div>
 最近提交
 </h3>
 <div className="overflow-x-auto custom-scrollbar rounded-lg border border-border">
 <table className="w-full">
 <thead className="bg-muted/25">
 <tr>
 <th className="px-5 py-4 text-left text-sm font-semibold text-foreground">题目</th>
 <th className="px-5 py-4 text-left text-sm font-semibold text-foreground">状态</th>
 <th className="px-5 py-4 text-left text-sm font-semibold text-foreground">语言</th>
 <th className="px-5 py-4 text-left text-sm font-semibold text-foreground">时间</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border">
 {recentSubmissions.length > 0 ? (
 recentSubmissions.map((submission) => (
 <tr key={submission.id} className="hover:bg-muted/15 transition-colors">
 <td className="px-5 py-4">
 <Link href={`/problems/${submission.realProblemId}`} className="group flex items-center">
 <span className="text-primary-light font-semibold group-hover:underline">{submission.problemId}</span>
 <span className="text-muted-foreground ml-2 group-hover:text-foreground transition-colors">{submission.problemTitle}</span>
 </Link>
 </td>
 <td className="px-5 py-4">
 <span className={`tag text-xs font-semibold px-3 py-1.5 ${
 submission.status === 'AC' || submission.status === 'Accepted' ? 'tag-success' :
 submission.status === 'WA' || submission.status === 'Wrong Answer' ? 'tag-error' :
 submission.status === 'TLE' || submission.status === 'Time Limit Exceeded' ? 'tag-warning' :
 'tag'
 }`}>
 {submission.status}
 </span>
 </td>
 <td className="px-5 py-4 text-muted-foreground text-sm font-medium">
 {submission.language}
 </td>
 <td className="px-5 py-4 text-muted-foreground text-sm font-medium">
 {submission.time}
 </td>
 </tr>
 ))
 ) : (
 <tr>
 <td colSpan={4} className="px-5 py-16 text-center">
 <div className="flex flex-col items-center gap-4">
 <div className="w-14 h-14 rounded-lg bg-muted/25 flex items-center justify-center">
 <Code className="w-7 h-7 text-muted-foreground" />
 </div>
 <p className="text-muted-foreground text-base">暂无提交记录</p>
 </div>
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </motion.div>

 {difficultyDistribution.length > 0 && (
 <motion.div variants={itemVariants} className="card-static rounded-lg p-8 border border-accent/5">
 <h3 className="text-xl font-bold mb-6 flex items-center gap-3 text-foreground">
 <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
 <Target className="w-5 h-5 text-accent-light" />
 </div>
 题目难度分布 (已解决)
 </h3>
 <div className="space-y-5">
 {difficultyDistribution.map((item) => {
 const total = difficultyDistribution.reduce((acc, curr) => acc + curr.count, 0);
 const percentage = (item.count / total) * 100;
 
 let bgClass = 'bg-muted';
 let textClass = 'text-muted-foreground';
 let glowColor = 'rgba(148, 163, 184, 0.3)';
 
 if (item.difficulty === '入门') {
 bgClass = 'bg-muted';
 textClass = 'text-muted-foreground';
 glowColor = 'rgba(148, 163, 184, 0.3)';
 } else if (item.difficulty === '普及-') {
 bgClass = 'bg-secondary';
 textClass = 'text-secondary-light';
 glowColor = 'rgba(34, 197, 94, 0.3)';
 } else if (item.difficulty === '普及') {
 bgClass = 'bg-primary';
 textClass = 'text-primary-light';
 glowColor = 'rgba(99, 102, 241, 0.3)';
 } else if (item.difficulty === '普及+') {
 bgClass = 'bg-accent';
 textClass = 'text-accent-light';
 glowColor = 'rgba(245, 158, 11, 0.3)';
 } else if (item.difficulty === '提高') {
 bgClass = 'bg-accent';
 textClass = 'text-accent-light';
 glowColor = 'rgba(245, 158, 11, 0.3)';
 } else if (item.difficulty === '提高+') {
 bgClass = 'bg-error';
 textClass = 'text-error';
 glowColor = 'rgba(239, 68, 68, 0.3)';
 } else {
 bgClass = 'bg-primary';
 textClass = 'text-primary-light';
 glowColor = 'rgba(99, 102, 241, 0.3)';
 }

 return (
 <div key={item.difficulty}>
 <div className="flex items-center justify-between mb-3">
 <span className={`text-sm font-semibold ${textClass}`}>{item.difficulty}</span>
 <span className="text-base font-bold text-foreground">{item.count}</span>
 </div>
 <div className="w-full bg-muted/25 rounded-full h-3 overflow-hidden">
 <div 
 className={`${bgClass} h-3 rounded-full transition-all duration-700`}
 style={{ 
 width: `${percentage}%`,
 boxShadow: `0 0 15px ${glowColor}`
 }}
 ></div>
 </div>
 </div>
 );
 })}
 </div>
 </motion.div>
 )}
 </div>
 </motion.div>
 </div>
 </div>
 )
}
