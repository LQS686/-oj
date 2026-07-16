'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Search, Plus, Trash2, Save, AlertCircle, Trophy } from 'lucide-react'
import type { Problem } from '@/types/models'
import { fetchWithAuth, fetchWithCookie } from '@/lib/api/base'
import { logger } from '@/lib/logger'

export default function EditContestPage() {
 const router = useRouter()
 const params = useParams()
 const id = params.id as string

 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState('')
 
 const [title, setTitle] = useState('')
 const [description, setDescription] = useState('')
 const [type, setType] = useState('OI')
 const [startTime, setStartTime] = useState('')
 const [endTime, setEndTime] = useState('')
 const [isPublic, setIsPublic] = useState(true)
 const [password, setPassword] = useState('')

 const [contestProblems, setContestProblems] = useState<Problem[]>([])
 const [searchQuery, setSearchQuery] = useState('')
 const [searchResults, setSearchResults] = useState<Problem[]>([])
 const [searching, setSearching] = useState(false)
 const [batchInput, setBatchInput] = useState('')

 useEffect(() => {
 const fetchData = async () => {
 try {
 setLoading(true)
 const contestRes = await fetchWithAuth(`/api/contests/${id}`)
 const contestData = await contestRes.json()
 
 if (!contestData.success) {
 throw new Error(contestData.error || '获取竞赛详情失败')
 }
 
 const contest = contestData.data
 setTitle(contest.title)
 setDescription(contest.description)
 setType(contest.type)
 setStartTime(new Date(contest.startTime).toISOString().slice(0, 16))
 setEndTime(new Date(contest.endTime).toISOString().slice(0, 16))
 setIsPublic(contest.isPublic)
 setPassword(contest.password || '')

 const problemsRes = await fetchWithAuth(`/api/contests/${id}/problems`)
 const problemsData = await problemsRes.json()
 
 if (problemsData.success) {
 const formattedProblems = problemsData.data.map((p: Problem) => ({
 id: p.id,
 problemNumber: p.problemNumber,
 title: p.title,
 difficulty: p.difficulty,
 visibility: p.visibility,
 isPublic: p.isPublic
 }))
 setContestProblems(formattedProblems)
 }

 } catch (err: unknown) {
 const error = err as Error
 setError(error.message || '加载失败')
 } finally {
 setLoading(false)
 }
 }

 if (id) {
 fetchData()
 }
 }, [id])

 const searchProblems = async (query: string) => {
 if (!query) {
 setSearchResults([])
 return
 }
 setSearching(true)
 try {
 const response = await fetchWithCookie(`/api/problems?search=${encodeURIComponent(query)}&limit=5`)
 const data = await response.json()
 if (data.success) {
 const filtered = (data.data.problems || []).filter((p: Problem) =>
 !contestProblems.find(cp => cp.id === p.id)
 )
 setSearchResults(filtered)
 }
 } catch (err) {
 logger.error('搜索题目失败', err)
 } finally {
 setSearching(false)
 }
 }

 const handleAddProblem = (problem: Problem) => {
 setContestProblems([...contestProblems, problem])
 setSearchResults([])
 setSearchQuery('')
 }

 const handleRemoveProblem = (problemId: string) => {
 setContestProblems(contestProblems.filter(p => p.id !== problemId))
 }

 const handleBatchAdd = async () => {
 if (!batchInput.trim()) return
 
 setSearching(true)
 try {
 const numbers = batchInput.split(/[,，\s\n]+/)
 .filter(s => s.trim())
 .map(s => s.trim().toUpperCase().startsWith('P') ? s.trim().toUpperCase() : `P${s.trim()}`)
 
 if (numbers.length === 0) return

 const response = await fetchWithCookie(`/api/problems?numbers=${encodeURIComponent(numbers.join(','))}`)
 const data = await response.json()
 
 if (data.success) {
 const foundProblems = (data.data.problems || []) as Problem[]
 const newProblems: Problem[] = []
 const foundNumbers = new Set(foundProblems.map(p => p.problemNumber))
 const notFound: string[] = []
 
 numbers.forEach(num => {
 if (!foundNumbers.has(num)) {
 notFound.push(num)
 }
 })

 foundProblems.forEach(p => {
 if (!contestProblems.find(cp => cp.id === p.id)) {
 newProblems.push(p)
 }
 })
 
 setContestProblems([...contestProblems, ...newProblems])
 setBatchInput('')
 
 if (notFound.length > 0) {
 alert(`以下题目未找到或未公开: ${notFound.join(', ')}`)
 }
 }
 } catch (err) {
 console.error(err)
 alert('批量添加失败：网络错误')
 } finally {
 setSearching(false)
 }
 }

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 setSaving(true)
 setError('')

 try {
 if (new Date(endTime) <= new Date(startTime)) {
 throw new Error('结束时间必须晚于开始时间')
 }

 const duration = Math.floor((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)

 const response = await fetchWithAuth(`/api/contests/${id}`, {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 title,
 description,
 type,
 startTime,
 endTime,
 duration,
 isPublic,
 password: isPublic ? undefined : password,
 problemIds: contestProblems.map(p => p.id)
 })
 })

 const data = await response.json()
 if (data.success) {
 router.push(`/contests/${id}`)
 } else {
 setError(data.error || '更新失败')
 }
 } catch (err: unknown) {
 const error = err as Error
 setError(error.message || '网络错误')
 } finally {
 setSaving(false)
 }
 }

 if (loading) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="text-center text-muted-foreground">
 <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
 加载中...
 </div>
 </div>
 )
 }

 return (
 <div className="min-h-screen py-8">
 <div className="container mx-auto px-4 max-w-4xl">
 <button
 onClick={() => router.back()}
 className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
 >
 <ArrowLeft className="w-5 h-5" />
 <span>返回</span>
 </button>

 <form onSubmit={handleSubmit} className="space-y-6">
 <div className="card p-8 space-y-6">
 <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
 <Trophy className="w-6 h-6 text-indigo-400" />
 编辑竞赛
 </h1>

 {error && (
 <div className="bg-error/100/10 border border-red-500/20 text-red-400 p-4 rounded-lg text-sm flex items-center gap-2">
 <AlertCircle className="w-4 h-4" />
 {error}
 </div>
 )}

 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 竞赛名称 <span className="text-red-400">*</span>
 </label>
 <input
 type="text"
 required
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 className="input w-full"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 竞赛描述
 </label>
 <textarea
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 rows={4}
 className="input w-full"
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 赛制类型
 </label>
 <select
 value={type}
 onChange={(e) => setType(e.target.value)}
 className="input w-full"
 >
 <option value="ACM">ACM (ICPC) - 罚时制</option>
 <option value="OI">OI (NOI) - 得分制</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 可见性
 </label>
 <select
 value={isPublic ? 'public' : 'private'}
 onChange={(e) => setIsPublic(e.target.value === 'public')}
 className="input w-full"
 >
 <option value="public">公开 (所有人可见)</option>
 <option value="private">私有 (需要密码)</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 开始时间 <span className="text-red-400">*</span>
 </label>
 <input
 type="datetime-local"
 required
 value={startTime}
 onChange={(e) => setStartTime(e.target.value)}
 className="input w-full"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 结束时间 <span className="text-red-400">*</span>
 </label>
 <input
 type="datetime-local"
 required
 value={endTime}
 onChange={(e) => setEndTime(e.target.value)}
 className="input w-full"
 />
 </div>
 </div>

 {!isPublic && (
 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 参赛密码 <span className="text-red-400">*</span>
 </label>
 <input
 type="text"
 required
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 className="input w-full"
 />
 </div>
 )}
 </div>
 </div>

 <div className="card p-8 space-y-6">
 <div className="flex justify-between items-center border-b border-border pb-4">
 <h2 className="text-lg font-bold text-foreground">题目管理</h2>
 <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
 已添加 {contestProblems.length} 题
 </span>
 </div>
 
 <div className="space-y-6">
 <div className="bg-indigo-500/10 p-5 rounded-xl border border-indigo-500/20">
 <label className="block text-sm font-bold text-indigo-300 mb-2">
 批量添加题目
 </label>
 <div className="flex gap-3">
 <input
 type="text"
 placeholder="输入题号，例如: P1001, 1002, P1005 (支持逗号或空格分隔)"
 value={batchInput}
 onChange={(e) => setBatchInput(e.target.value)}
 className="input flex-1"
 onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleBatchAdd())}
 />
 <button
 type="button"
 onClick={handleBatchAdd}
 disabled={searching || !batchInput.trim()}
 className="btn-primary flex items-center gap-2 whitespace-nowrap"
 >
 <Plus className="w-4 h-4" />
 {searching ? '添加中...' : '批量添加'}
 </button>
 </div>
 <p className="text-xs text-indigo-400 mt-2 flex items-center gap-1">
 <AlertCircle className="w-3 h-3" />
 提示：直接输入数字（如 1001）将自动识别为 P1001。仅能添加已公开的题目。
 </p>
 </div>

 <div className="relative">
 <label className="block text-sm font-medium text-foreground mb-1">
 搜索添加题目
 </label>
 <div className="relative">
 <input
 type="text"
 placeholder="输入题目名称或题号进行搜索..."
 value={searchQuery}
 onChange={(e) => {
 setSearchQuery(e.target.value)
 searchProblems(e.target.value)
 }}
 className="input w-full pl-10"
 />
 <Search className="w-5 h-5 text-muted-foreground absolute left-3 top-3" />
 </div>
 
 {searchResults.length > 0 && (
 <div className="absolute top-full left-0 right-0 mt-2 card shadow-xl z-50 max-h-80 overflow-y-auto">
 {searchResults.map(problem => (
 <button
 key={problem.id}
 type="button"
 onClick={() => handleAddProblem(problem)}
 className="w-full px-5 py-3 text-left hover:bg-muted flex justify-between items-center group transition-colors border-b border-border last:border-b-0"
 >
 <div className="flex items-center gap-3">
 <span className="font-mono text-sm text-muted-foreground bg-muted px-2 py-0.5 rounded group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-colors">
 {problem.problemNumber}
 </span>
 <span className="font-medium text-foreground group-hover:text-indigo-400">{problem.title}</span>
 </div>
 <div className="flex items-center gap-3">
 <span className={`text-xs px-2 py-1 rounded font-medium ${
 problem.difficulty === '入门' ? 'bg-secondary/100/20 text-green-400' :
 problem.difficulty.includes('普及') ? 'bg-orange-500/20 text-orange-400' :
 'bg-error/100/20 text-red-400'
 }`}>
 {problem.difficulty}
 </span>
 <Plus className="w-4 h-4 text-muted-foreground group-hover:text-indigo-400" />
 </div>
 </button>
 ))}
 </div>
 )}
 </div>

 <div className="border border-border rounded-xl overflow-hidden">
 {contestProblems.length === 0 ? (
 <div className="py-16 text-center">
 <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
 <Search className="w-8 h-8 text-muted-foreground" />
 </div>
 <p className="text-muted-foreground font-medium">暂无题目</p>
 <p className="text-sm text-muted-foreground mt-1">请使用上方工具搜索或批量添加题目</p>
 </div>
 ) : (
 <div className="divide-y divide-border">
 {contestProblems.map((problem, index) => (
 <div key={problem.id} className="p-4 flex items-center justify-between hover:bg-muted transition-colors group">
 <div className="flex items-center gap-4">
 <span className="w-8 h-8 flex items-center justify-center bg-indigo-500/20 text-indigo-400 rounded-lg text-sm font-bold">
 {String.fromCharCode(65 + index)}
 </span>
 <div className="flex flex-col">
 <div className="flex items-center gap-2">
 <span className="font-mono text-sm text-muted-foreground">{problem.problemNumber}</span>
 <span className="font-medium text-foreground">{problem.title}</span>
 </div>
 <span className="text-xs text-muted-foreground mt-0.5">{problem.difficulty}</span>
 </div>
 </div>
 <button
 type="button"
 onClick={() => handleRemoveProblem(problem.id)}
 className="p-2 text-muted-foreground hover:text-red-400 hover:bg-error/100/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
 title="移除题目"
 >
 <Trash2 className="w-5 h-5" />
 </button>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="flex justify-end pt-4 pb-12">
 <button
 type="submit"
 disabled={saving}
 className="btn-primary flex items-center gap-2 px-8 py-3 text-lg font-bold"
 >
 {saving ? (
 <>
 <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
 保存中...
 </>
 ) : (
 <>
 <Save className="w-5 h-5" />
 保存修改
 </>
 )}
 </button>
 </div>
 </form>
 </div>
 </div>
 )
}
