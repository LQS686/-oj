'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { Trophy, ArrowLeft, Save, X } from 'lucide-react'
import type { Problem } from '@/types/models'

export default function EditContestPage({ params }: { params: Promise<{ id: string }> }) {
 const router = useRouter()
 const { id } = use(params)
 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState('')
 
 const [formData, setFormData] = useState({
 title: '',
 description: '',
 type: 'ACM',
 startTime: '',
 endTime: '',
 isPublic: false,
 password: ''
 })

 const [contestProblems, setContestProblems] = useState<Problem[]>([])
 const [searchQuery, setSearchQuery] = useState('')
 const [searchResults, setSearchResults] = useState<Problem[]>([])
 const [, setSearching] = useState(false)

 const fetchContest = useCallback(async () => {
 try {
 const response = await fetchWithAuth(`/api/admin/contests/${id}`)

 if (response.status === 403) {
 setError('需要管理员权限')
 return
 }

 const data = await response.json()
 if (data.success) {
 const contest = data.data
 setFormData({
 title: contest.title,
 description: contest.description,
 type: contest.type,
 startTime: new Date(contest.startTime).toISOString().slice(0, 16),
 endTime: new Date(contest.endTime).toISOString().slice(0, 16),
 isPublic: contest.isPublic,
 password: contest.password || ''
 })
 setContestProblems(contest.problems.map((p: { problem: Problem }) => p.problem))
 } else {
 setError(data.error || '获取竞赛失败')
 }
 } catch {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }, [id])

 useEffect(() => {
 fetchContest()
 }, [id, fetchContest])

 const searchProblems = async (query: string) => {
 if (!query) {
 setSearchResults([])
 return
 }
 setSearching(true)
 try {
 const response = await fetchWithAuth('/api/admin/problems')
 const data = await response.json()
 if (data.success) {
   const payload = data.data
   const allProblems = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []
 const filtered = allProblems.filter((p: Problem) =>
 p.title.toLowerCase().includes(query.toLowerCase()) &&
 !contestProblems.find(cp => cp.id === p.id)
 )
 setSearchResults(filtered.slice(0, 5))
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

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 setSaving(true)
 setError('')

 try {
 const response = await fetchWithAuth(`/api/admin/contests/${id}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 ...formData,
 problems: contestProblems.map(p => p.id)
 })
 })

 const data = await response.json()
 if (data.success) {
 router.push('/admin/contests')
 } else {
 setError(data.error || '更新失败')
 }
 } catch {
 setError('网络错误')
 } finally {
 setSaving(false)
 }
 }

 if (loading) {
 return (
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <div className="relative w-16 h-16 mx-auto mb-6">
 <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
 <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
 </div>
 <p className="text-muted-foreground text-lg">加载中...</p>
 </div>
 </div>
 )
 }

 return (
 <div className="max-w-4xl mx-auto space-y-6">
 <div className="flex items-center gap-4">
 <button
 onClick={() => router.back()}
 className="p-2 hover:bg-muted rounded-lg transition-colors"
 >
 <ArrowLeft className="w-5 h-5 text-muted-foreground" />
 </button>
 <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
 <Trophy className="w-6 h-6 text-primary-light" />
 编辑竞赛
 </h1>
 </div>

 <form onSubmit={handleSubmit} className="space-y-6">
 <div className="card-static rounded-lg p-6 space-y-6">
 <h2 className="text-lg font-bold text-foreground border-b border-border pb-4">基本信息</h2>
 {error && (
 <div className="bg-error/10 text-error p-4 rounded-xl text-sm border border-error/20">
 {error}
 </div>
 )}

 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 竞赛名称
 </label>
 <input
 type="text"
 required
 value={formData.title}
 onChange={(e) => setFormData({ ...formData, title: e.target.value })}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 竞赛描述
 </label>
 <textarea
 required
 value={formData.description}
 onChange={(e) => setFormData({ ...formData, description: e.target.value })}
 rows={4}
 className="input"
 />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 赛制类型
 </label>
 <select
 value={formData.type}
 onChange={(e) => setFormData({ ...formData, type: e.target.value })}
 className="input"
 >
 <option value="ACM">ACM (ICPC) - 罚时制</option>
 <option value="OI">OI (NOI) - 得分制</option>
 </select>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 可见性
 </label>
 <div className="flex items-center gap-4 mt-3">
 <label className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={formData.isPublic}
 onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
 className="w-4 h-4 text-primary rounded focus:ring-primary"
 />
 <span className="text-foreground">公开竞赛</span>
 </label>
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 开始时间
 </label>
 <input
 type="datetime-local"
 required
 value={formData.startTime}
 onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 结束时间
 </label>
 <input
 type="datetime-local"
 required
 value={formData.endTime}
 onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
 className="input"
 />
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-2">
 访问密码 (可选)
 </label>
 <input
 type="text"
 value={formData.password}
 onChange={(e) => setFormData({ ...formData, password: e.target.value })}
 className="input"
 />
 </div>
 </div>
 </div>
 </div>

 <div className="card-static rounded-lg p-6 space-y-6">
 <h2 className="text-lg font-bold text-foreground border-b border-border pb-4">题目管理</h2>
 
 <div className="relative">
 <input
 type="text"
 placeholder="搜索并添加题目（输入标题）..."
 value={searchQuery}
 onChange={(e) => {
 setSearchQuery(e.target.value)
 searchProblems(e.target.value)
 }}
 className="input"
 />
 {searchResults.length > 0 && (
 <div className="absolute top-full left-0 right-0 mt-2 card-static rounded-xl shadow-xl z-10">
 {searchResults.map(problem => (
 <button
 key={problem.id}
 type="button"
 onClick={() => handleAddProblem(problem)}
 className="w-full px-4 py-3 text-left hover:bg-muted flex justify-between items-center border-b border-border last:border-0"
 >
 <div className="flex items-center gap-2">
 <span className="text-foreground">{problem.title}</span>
 <span className={`tag ${
 (problem.visibility === 'contest') ? 'tag-warning' :
 (problem.visibility === 'public' || problem.isPublic) ? 'tag-success' : ''
 }`}>
 {problem.visibility === 'contest' ? '竞赛' : 
 (problem.visibility === 'public' || problem.isPublic) ? '公开' : '隐藏'}
 </span>
 </div>
 <span className="text-xs text-muted-foreground">{problem.difficulty}</span>
 </button>
 ))}
 </div>
 )}
 </div>

 <div className="space-y-2">
 {contestProblems.map((problem, index) => (
 <div key={problem.id} className="flex items-center justify-between p-4 card-static rounded-xl border border-border">
 <div className="flex items-center gap-3">
 <span className="w-6 h-6 flex items-center justify-center bg-muted rounded-full text-xs font-bold text-muted-foreground">
 {String.fromCharCode(65 + index)}
 </span>
 <span className="font-medium text-foreground">{problem.title}</span>
 <span className={`tag ${
 (problem.visibility === 'contest') ? 'tag-warning' :
 (problem.visibility === 'public' || problem.isPublic) ? 'tag-success' : ''
 }`}>
 {problem.visibility === 'contest' ? '竞赛' : 
 (problem.visibility === 'public' || problem.isPublic) ? '公开' : '隐藏'}
 </span>
 <span className="tag">{problem.difficulty}</span>
 </div>
 <button
 type="button"
 onClick={() => handleRemoveProblem(problem.id)}
 className="p-1 text-muted-foreground hover:text-error hover:bg-error/10 rounded transition-colors"
 >
 <X className="w-4 h-4" />
 </button>
 </div>
 ))}
 {contestProblems.length === 0 && (
 <div className="text-center py-6 text-muted-foreground text-sm">
 暂无题目，请搜索添加
 </div>
 )}
 </div>
 </div>

 <div className="flex justify-end pt-4">
 <button
 type="submit"
 disabled={saving}
 className="btn btn-primary"
 >
 <Save className="w-5 h-5" />
 {saving ? '保存中...' : '保存更改'}
 </button>
 </div>
 </form>
 </div>
 )
}
