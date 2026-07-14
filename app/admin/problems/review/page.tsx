'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchWithAuth } from '@/lib/api/base'
import {
 Clock, CheckCircle, XCircle, Play, Edit, Save,
 ArrowLeft, FileText, Code, Database, ChevronLeft, ChevronRight,
 Loader2, Eye, EyeOff, Send, RefreshCw
} from 'lucide-react'
import Link from 'next/link'
import MarkdownContent from '@/components/common/MarkdownContent'
import { DIFFICULTIES, DIFFICULTY_COLORS } from '@/lib/constants'

interface TestCase {
 id: string
 input: string
 output: string
 isSample: boolean
 score: number
 orderIndex: number
}

interface Problem {
 id: string
 problemNumber: string | null
 title: string
 description: string
 input: string
 output: string
 samples: any[]
 hint: string | null
 difficulty: string
 tags: string[]
 timeLimit: number
 memoryLimit: number
 isPublic: boolean
 visibility: string
 isAiGenerated: boolean
 aiStatus: string
 stdCode: string | null
 stdLang: string | null
 testCases: TestCase[]
 createdAt: string
}

export default function ProblemReviewPage() {
 const router = useRouter()
 const searchParams = useSearchParams()
 const [problems, setProblems] = useState<Problem[]>([])
 const [loading, setLoading] = useState(true)
 const [selectedIndex, setSelectedIndex] = useState(0)
 const [verifying, setVerifying] = useState(false)
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState('')
 const [success, setSuccess] = useState('')
 
 const [editMode, setEditMode] = useState(false)
 const [editedProblem, setEditedProblem] = useState<Problem | null>(null)
 const [editedTestCases, setEditedTestCases] = useState<TestCase[]>([])
 
 const [solutionCode, setSolutionCode] = useState('')
 const [solutionLanguage, setSolutionLanguage] = useState('cpp')
 const [verifyResults, setVerifyResults] = useState<any>(null)

 useEffect(() => {
 fetchProblems()
 }, [])

 useEffect(() => {
 if (problems.length > 0 && searchParams.get('id')) {
 const idx = problems.findIndex(p => p.id === searchParams.get('id'))
 if (idx >= 0) setSelectedIndex(idx)
 }
 }, [problems, searchParams])

 useEffect(() => {
 setSolutionCode('')
 setSolutionLanguage('cpp')
 setVerifyResults(null)
 setError('')
 setSuccess('')
 setEditMode(false)
 setEditedProblem(null)
 setEditedTestCases([])
 }, [selectedIndex])

 const fetchProblems = async () => {
 try {
 const response = await fetchWithAuth('/api/admin/problems/review')
 const data = await response.json()
 if (data.success) {
 setProblems(Array.isArray(data.data) ? data.data : [])
 }
 } catch (err) {
 setError('获取题目列表失败')
 } finally {
 setLoading(false)
 }
 }

 const currentProblem = problems[selectedIndex]

 const handleVerify = async () => {
 if (!currentProblem || !solutionCode.trim()) {
 setError('请输入标程代码')
 return
 }

 setVerifying(true)
 setError('')
 setVerifyResults(null)

 try {
 const response = await fetchWithAuth(`/api/admin/problems/${currentProblem.id}/verify`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 solutionCode,
 solutionLanguage
 })
 })

 const data = await response.json()
 if (data.success) {
 setSuccess(data.message)
 setVerifyResults(data.data)
 fetchProblems()
 } else {
 setError(data.error || '验证失败')
 setVerifyResults(data.data)
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setVerifying(false)
 }
 }

 const handleReject = async () => {
 if (!currentProblem) return
 if (!confirm('确定要拒绝这道题目吗？题目将被删除。')) return

 setSaving(true)
 setError('')

 try {
 const response = await fetchWithAuth(`/api/admin/problems/${currentProblem.id}`, {
 method: 'DELETE'
 })

 const data = await response.json()
 if (data.success) {
 setSuccess('题目已拒绝并删除')
 setSelectedIndex(Math.max(0, selectedIndex - 1))
 fetchProblems()
 } else {
 setError(data.error || '操作失败')
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setSaving(false)
 }
 }

 const handleSaveEdit = async () => {
 if (!editedProblem) return

 setSaving(true)
 setError('')

 try {
 const response = await fetchWithAuth(`/api/admin/problems/${editedProblem.id}`, {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 title: editedProblem.title,
 description: editedProblem.description,
 input: editedProblem.input,
 output: editedProblem.output,
 hint: editedProblem.hint,
 difficulty: editedProblem.difficulty,
 tags: editedProblem.tags,
 timeLimit: editedProblem.timeLimit,
 memoryLimit: editedProblem.memoryLimit,
 testCases: editedTestCases
 })
 })

 const data = await response.json()
 if (data.success) {
 setSuccess('题目已保存')
 setEditMode(false)
 fetchProblems()
 } else {
 setError(data.error || '保存失败')
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setSaving(false)
 }
 }

 const startEdit = () => {
 if (!currentProblem) return
 setEditedProblem({ ...currentProblem })
 setEditedTestCases([...currentProblem.testCases])
 setEditMode(true)
 }

 const cancelEdit = () => {
 setEditMode(false)
 setEditedProblem(null)
 setEditedTestCases([])
 }

 const getDifficultyColor = (diff: string) => {
 const color = DIFFICULTY_COLORS[diff]
 if (color) {
 const [textColor, bgColor] = color.split(' ')
 return `${bgColor} ${textColor}`
 }
 return 'bg-muted text-muted-foreground'
 }

 const getStatusBadge = (problem: Problem) => {
 if (problem.visibility === 'public') {
 return <span className="px-2 py-1 rounded text-xs bg-secondary/10 text-secondary">已通过</span>
 }
 return <span className="px-2 py-1 rounded text-xs bg-warning/10 text-warning">待审核</span>
 }

 if (loading) {
 return (
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
 <p className="text-muted-foreground">加载中...</p>
 </div>
 </div>
 )
 }

 if (problems.length === 0) {
 return (
 <div className="space-y-6">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/20">
 <CheckCircle className="w-5 h-5 text-primary-light" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">题目审核</h1>
 <p className="text-sm text-muted-foreground">审核手动提交的题目</p>
 </div>
 </div>

 <div className="card p-12 text-center">
 <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400 opacity-50" />
 <p className="text-lg text-foreground">暂无待审核题目</p>
 <p className="text-sm text-muted-foreground mt-2">所有手动提交的题目都已审核完成</p>
 </div>
 </div>
 )
 }

 return (
 <div className="space-y-6">
 {error && (
 <div className="bg-error/5 border border-error/15 text-error px-4 py-3 rounded-lg">
 {error}
 </div>
 )}

 {success && (
 <div className="bg-secondary/5 border border-secondary/15 text-secondary px-4 py-3 rounded-lg">
 {success}
 </div>
 )}

 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/20">
 <CheckCircle className="w-5 h-5 text-primary-light" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">题目审核</h1>
 <p className="text-sm text-muted-foreground">审核手动提交的题目 ({problems.length} 道待审核)</p>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <button
 onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
 disabled={selectedIndex === 0}
 className="p-2 rounded-lg bg-muted hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed"
 >
 <ChevronLeft className="w-5 h-5" />
 </button>
 <span className="text-sm text-muted-foreground">
 {selectedIndex + 1} / {problems.length}
 </span>
 <button
 onClick={() => setSelectedIndex(Math.min(problems.length - 1, selectedIndex + 1))}
 disabled={selectedIndex === problems.length - 1}
 className="p-2 rounded-lg bg-muted hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed"
 >
 <ChevronRight className="w-5 h-5" />
 </button>
 </div>
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-2 space-y-6">
 <div className="card p-6">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-3">
 <FileText className="w-5 h-5 text-primary-light" />
 <h2 className="text-lg font-bold text-foreground">题目信息</h2>
 </div>
 <div className="flex items-center gap-2">
 {getStatusBadge(currentProblem)}
 {!editMode && (
 <button
 onClick={startEdit}
 className="btn btn-ghost text-sm flex items-center gap-1"
 >
 <Edit className="w-4 h-4" />
 编辑
 </button>
 )}
 </div>
 </div>

 {editMode && editedProblem ? (
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">题目名称</label>
 <input
 type="text"
 value={editedProblem.title}
 onChange={(e) => setEditedProblem({ ...editedProblem, title: e.target.value })}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">题目描述</label>
 <textarea
 value={editedProblem.description}
 onChange={(e) => setEditedProblem({ ...editedProblem, description: e.target.value })}
 className="input min-h-[200px]"
 />
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">输入格式</label>
 <textarea
 value={editedProblem.input}
 onChange={(e) => setEditedProblem({ ...editedProblem, input: e.target.value })}
 className="input min-h-[100px]"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">输出格式</label>
 <textarea
 value={editedProblem.output}
 onChange={(e) => setEditedProblem({ ...editedProblem, output: e.target.value })}
 className="input min-h-[100px]"
 />
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">提示</label>
 <textarea
 value={editedProblem.hint || ''}
 onChange={(e) => setEditedProblem({ ...editedProblem, hint: e.target.value })}
 className="input"
 />
 </div>

 <div className="grid grid-cols-4 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">难度</label>
 <select
 value={editedProblem.difficulty}
 onChange={(e) => setEditedProblem({ ...editedProblem, difficulty: e.target.value })}
 className="input"
 >
 {DIFFICULTIES.map(d => (
 <option key={d} value={d}>{d}</option>
 ))}
 </select>
 </div>
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">时间限制</label>
 <input
 type="number"
 value={editedProblem.timeLimit}
 onChange={(e) => setEditedProblem({ ...editedProblem, timeLimit: parseInt(e.target.value) })}
 className="input"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">内存</label>
 <input
 type="number"
 value={editedProblem.memoryLimit}
 onChange={(e) => setEditedProblem({ ...editedProblem, memoryLimit: parseInt(e.target.value) })}
 className="input"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">标签</label>
 <input
 type="text"
 value={editedProblem.tags.join(', ')}
 onChange={(e) => setEditedProblem({ ...editedProblem, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
 className="input"
 />
 </div>
 </div>

 <div className="flex justify-end gap-3 pt-4 border-t border-border">
 <button onClick={cancelEdit} className="btn btn-ghost">取消</button>
 <button onClick={handleSaveEdit} disabled={saving} className="btn btn-primary flex items-center gap-2">
 {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
 保存
 </button>
 </div>
 </div>
 ) : (
 <div className="space-y-4">
 <div>
 <h3 className="text-xl font-bold text-foreground mb-2">{currentProblem.title}</h3>
 <div className="flex items-center gap-2 flex-wrap">
 <span className={`px-2 py-1 rounded text-xs ${getDifficultyColor(currentProblem.difficulty)}`}>
 {currentProblem.difficulty}
 </span>
 {currentProblem.tags.map((tag, idx) => (
 <span key={idx} className="px-2 py-1 rounded text-xs bg-muted/60 text-muted-foreground">{tag}</span>
 ))}
 </div>
 </div>

 <div className="prose prose-invert prose-slate max-w-none">
 <MarkdownContent content={currentProblem.description} />
 </div>

 <div className="grid grid-cols-2 gap-4">
 <div className="p-4 rounded-lg bg-muted">
 <h4 className="text-sm font-medium text-muted-foreground mb-2">输入格式</h4>
 <p className="text-foreground text-sm whitespace-pre-wrap">{currentProblem.input}</p>
 </div>
 <div className="p-4 rounded-lg bg-muted">
 <h4 className="text-sm font-medium text-muted-foreground mb-2">输出格式</h4>
 <p className="text-foreground text-sm whitespace-pre-wrap">{currentProblem.output}</p>
 </div>
 </div>

 {currentProblem.hint && (
 <div className="p-4 rounded-lg bg-warning/5 border border-warning/15">
 <h4 className="text-sm font-medium text-warning mb-2">提示</h4>
 <p className="text-foreground text-sm">{currentProblem.hint}</p>
 </div>
 )}

 <div className="flex items-center gap-4 text-sm text-muted-foreground">
 <span>时间限制: {currentProblem.timeLimit}ms</span>
 <span>内存限制: {currentProblem.memoryLimit}MB</span>
 </div>
 </div>
 )}
 </div>

 <div className="card p-6">
 <div className="flex items-center gap-3 mb-4">
 <Database className="w-5 h-5 text-primary-light" />
 <h2 className="text-lg font-bold text-foreground">测试用例 ({currentProblem.testCases.length})</h2>
 </div>

 <div className="space-y-3 max-h-96 overflow-y-auto">
 {currentProblem.testCases.map((tc, idx) => (
 <div key={tc.id} className="p-3 rounded-lg bg-muted border border-border">
 <div className="flex items-center justify-between mb-2">
 <span className="text-sm font-medium text-foreground">
 #{idx + 1} {tc.isSample ? '(样例)' : '(隐藏)'}
 </span>
 <span className="text-xs text-muted-foreground">{tc.score}分</span>
 </div>
 <div className="grid grid-cols-2 gap-2">
 <div>
 <p className="text-xs text-muted-foreground mb-1">输入</p>
 <pre className="text-xs text-foreground bg-muted p-2 rounded overflow-x-auto max-h-24 overflow-y-auto">
 {tc.input}
 </pre>
 </div>
 <div>
 <p className="text-xs text-muted-foreground mb-1">输出</p>
 <pre className="text-xs text-foreground bg-muted p-2 rounded overflow-x-auto max-h-24 overflow-y-auto">
 {tc.output}
 </pre>
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>

 <div className="space-y-6">
 <div className="card p-6">
 <div className="flex items-center gap-3 mb-4">
 <Code className="w-5 h-5 text-primary-light" />
 <h2 className="text-lg font-bold text-foreground">标程验证</h2>
 </div>

 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">编程语言</label>
 <select
 value={solutionLanguage}
 onChange={(e) => setSolutionLanguage(e.target.value)}
 className="input"
 >
 <option value="cpp">C++</option>
 <option value="c">C</option>
 <option value="python">Python</option>
 <option value="java">Java</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">标程代码</label>
 <textarea
 value={solutionCode}
 onChange={(e) => setSolutionCode(e.target.value)}
 placeholder="粘贴标程代码..."
 className="input font-mono text-sm min-h-[300px]"
 />
 </div>

 {currentProblem.stdCode && (
 <button
 onClick={() => {
 setSolutionCode(currentProblem.stdCode || '')
 setSolutionLanguage(currentProblem.stdLang || 'cpp')
 }}
 className="text-sm text-primary-light hover:text-foreground"
 >
 加载已保存的标程
 </button>
 )}

 <button
 onClick={handleVerify}
 disabled={verifying || !solutionCode.trim()}
 className="btn btn-primary w-full flex items-center justify-center gap-2"
 >
 {verifying ? (
 <>
 <Loader2 className="w-4 h-4 animate-spin" />
 验证中...
 </>
 ) : (
 <>
 <Play className="w-4 h-4" />
 运行验证
 </>
 )}
 </button>

 {verifyResults && (
 <div className="p-3 rounded-lg bg-muted">
 <h4 className="text-sm font-medium text-foreground mb-2">验证结果</h4>
 <div className="space-y-1">
 {verifyResults.results?.map((r: any, idx: number) => (
 <div key={idx} className="flex items-center justify-between text-xs">
 <span className="text-muted-foreground">测试点 #{idx + 1}</span>
 <span className={r.status === 'OK' ? 'text-green-400' : 'text-red-400'}>
 {r.status} {r.time ? `(${r.time}ms)` : ''}
 </span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 </div>

 <div className="card p-6">
 <h2 className="text-lg font-bold text-foreground mb-4">审核操作</h2>

 <div className="space-y-3">
 <button
 onClick={handleReject}
 disabled={saving}
 className="btn w-full bg-error/5 hover:bg-error/10 text-error border border-error/15 flex items-center justify-center gap-2"
 >
 <XCircle className="w-4 h-4" />
 拒绝并删除
 </button>
 </div>

 <div className="mt-4 pt-4 border-t border-border">
 <Link
 href={`/admin/problems/${currentProblem.id}/edit`}
 className="btn btn-ghost w-full flex items-center justify-center gap-2"
 >
 <Edit className="w-4 h-4" />
 完整编辑
 </Link>
 </div>
 </div>

 <div className="card p-4">
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 <Clock className="w-4 h-4" />
 创建时间: {new Date(currentProblem.createdAt).toLocaleString('zh-CN')}
 </div>
 </div>
 </div>
 </div>
 </div>
 )
}