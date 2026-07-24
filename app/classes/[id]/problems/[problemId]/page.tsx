'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'
import { Clock, Database, BookOpen, TrendingUp, ArrowLeft, Play, Target, AlertCircle } from 'lucide-react'
import { getDifficultyColor } from '@/lib/status'
import { ClassWorkspaceShell, PageLoading } from '@/components/common'
import { loginPath } from '@/lib/navigation'

interface ClassProblem {
 id: string
 title: string
 description: string
 difficulty: string
 tags: string[]
 timeLimit: number
 memoryLimit: number
 testCases: Array<{
 id: string
 input: string
 expectedOutput: string
 isHidden: boolean
 }>
 stats: {
 acCount: number
 totalSubmissions: number
 acRate: number
 }
 createdAt: string
}

export default function ClassProblemDetailPage() {
 const params = useParams()
 const router = useRouter()
 const { user, isLoading: authLoading } = useUser()
 const [problem, setProblem] = useState<ClassProblem | null>(null)
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')

 useEffect(() => {
 if (authLoading) return
 if (!user) {
 router.push(loginPath())
 return
 }
 fetchProblem()
 }, [user, authLoading, params.id, params.problemId])

 const fetchProblem = async () => {
 try {
 setLoading(true)
 const response = await fetchWithCookie(`/api/classes/${params.id}/problems/${params.problemId}`)

 const data = await response.json()

 if (data.success) {
 setProblem(data.data)
 } else {
 setError(data.error || '获取题目失败')
 }
 } catch (err) {
 setError('获取题目失败')
 } finally {
 setLoading(false)
 }
 }

 if (loading) {
 return (
 <ClassWorkspaceShell classId={params.id as string} title="题目" icon={BookOpen} width="standard">
 <PageLoading label="加载题目中..." />
 </ClassWorkspaceShell>
 )
 }

 if (error || !problem) {
 return (
 <ClassWorkspaceShell classId={params.id as string} title="题目" icon={BookOpen} width="standard">
 <div className="text-center card-static rounded-lg p-12">
 <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
 <AlertCircle className="w-8 h-8 text-error" />
 </div>
 <p className="text-error text-lg mb-6">{error || '题目不存在'}</p>
 <button
 onClick={() => router.push(`/classes/${params.id}`)}
 className="btn btn-primary"
 >
 返回班级
 </button>
 </div>
 </ClassWorkspaceShell>
 )
 }

 const classId = params.id as string

 return (
 <ClassWorkspaceShell classId={classId} title={problem.title} icon={BookOpen} width="standard">
 <Link
 href={`/classes/${classId}`}
 className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary-light mb-4 transition-colors group"
 >
 <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
 返回班级
 </Link>

 <div className="card-static rounded-lg p-6 mb-6">
 <div className="flex items-start justify-between mb-4">
 <div className="flex-1">
 <div className="flex items-center gap-3 mb-3">
 <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
 <BookOpen className="w-5 h-5 text-white" />
 </div>
 <h1 className="text-2xl font-bold text-foreground hidden sm:block">{problem.title}</h1>
 </div>
 <div className="flex items-center gap-3 flex-wrap">
 <span className={`tag border ${getDifficultyColor(problem.difficulty)}`}>
 {problem.difficulty}
 </span>
 {problem.tags.map((tag, idx) => (
 <span key={idx} className="tag">
 {tag}
 </span>
 ))}
 </div>
 </div>
 </div>

 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
 <div className="card-static rounded-xl p-4 flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
 <Clock className="w-5 h-5 text-primary-light" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">时间限制</p>
 <p className="font-bold text-foreground">{problem.timeLimit}ms</p>
 </div>
 </div>
 <div className="card-static rounded-xl p-4 flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
 <Database className="w-5 h-5 text-secondary-light" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">内存限制</p>
 <p className="font-bold text-foreground">{problem.memoryLimit}MB</p>
 </div>
 </div>
 <div className="card-static rounded-xl p-4 flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
 <BookOpen className="w-5 h-5 text-accent-light" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">通过数</p>
 <p className="font-bold text-foreground">{problem.stats.acCount}</p>
 </div>
 </div>
 <div className="card-static rounded-xl p-4 flex items-center gap-3">
 <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
 <TrendingUp className="w-5 h-5 text-info" />
 </div>
 <div>
 <p className="text-xs text-muted-foreground">通过率</p>
 <p className="font-bold text-foreground">{problem.stats.acRate}%</p>
 </div>
 </div>
 </div>
 </div>

 <div className="card-static rounded-lg p-6 mb-6">
 <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
 <BookOpen className="w-5 h-5 text-primary-light" />
 题目描述
 </h2>
 <div className="prose prose-invert max-w-none">
 <pre className="whitespace-pre-wrap text-foreground font-sans bg-muted p-4 rounded-xl border border-border">
 {problem.description}
 </pre>
 </div>
 </div>

 {problem.testCases.length > 0 && (
 <div className="card-static rounded-lg p-6 mb-6">
 <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
 <Target className="w-5 h-5 text-secondary-light" />
 示例测试用例
 </h2>
 <div className="space-y-4">
 {problem.testCases
 .filter(tc => !tc.isHidden)
 .map((testCase, idx) => (
 <div key={testCase.id} className="card-static rounded-xl p-4 border border-border">
 <h3 className="font-medium text-foreground mb-3">示例 {idx + 1}</h3>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <p className="text-sm font-medium text-muted-foreground mb-2">输入：</p>
 <pre className="bg-muted p-3 rounded-lg border border-border text-sm overflow-x-auto text-foreground">
 {testCase.input}
 </pre>
 </div>
 <div>
 <p className="text-sm font-medium text-muted-foreground mb-2">输出：</p>
 <pre className="bg-muted p-3 rounded-lg border border-border text-sm overflow-x-auto text-foreground">
 {testCase.expectedOutput}
 </pre>
 </div>
 </div>
 </div>
 ))}
 </div>
 
 {problem.testCases.some(tc => tc.isHidden) && (
 <p className="mt-4 text-sm text-muted-foreground">
 注意：还有 {problem.testCases.filter(tc => tc.isHidden).length} 个隐藏测试用例
 </p>
 )}
 </div>
 )}

 <div className="flex gap-3">
 <button
 onClick={() => router.push(`/problem/${problem.id}`)}
 className="btn btn-primary flex-1"
 >
 <Play className="w-5 h-5" />
 开始答题
 </button>
 <button
 onClick={() => router.push(`/classes/${classId}`)}
 className="btn btn-ghost"
 >
 返回班级
 </button>
 </div>
 </ClassWorkspaceShell>
 )
}
