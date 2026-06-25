'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { DataTable, type Column } from '@/components/admin'
import { fetchWithAuth } from '@/lib/api/base'
import { ArrowLeft, Download, Database, Edit, Clock, History, Loader2 } from 'lucide-react'

interface Problem {
 id: string
 title: string
 aiStatus: string
 createdAt: string
 updatedAt: string
}

export default function SourceManagementPage() {
 const router = useRouter()
 const [problems, setProblems] = useState<Problem[]>([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState('')
 const [sourceFilter, setSourceFilter] = useState('all')
 const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
 const [showBatchModal, setShowBatchModal] = useState(false)
 const [targetSource, setTargetSource] = useState('MANUAL_CREATED')
 const [processing, setProcessing] = useState(false)
 
 const [activeTab, setActiveTab] = useState<'problems' | 'logs'>('problems')
 const [logs, setLogs] = useState<any[]>([])
 const [logsLoading, setLogsLoading] = useState(false)
 const [tableKey, setTableKey] = useState(0)

 useEffect(() => {
 fetchProblems()
 }, [])

 useEffect(() => {
 if (activeTab === 'logs') {
 fetchLogs()
 }
 }, [activeTab])

 const fetchLogs = async () => {
 setLogsLoading(true)
 try {
 const res = await fetchWithAuth('/api/admin/logs/source-changes')
 const data = await res.json()
 if (data.success) {
 setLogs(Array.isArray(data.data) ? data.data : [])
 }
 } catch (err) {
 console.error(err)
 } finally {
 setLogsLoading(false)
 }
 }

 const fetchProblems = async () => {
 try {
 setLoading(true)
 const response = await fetchWithAuth('/api/admin/problems')
 const data = await response.json()
 if (data.success) {
 setProblems(data.data)
 } else {
 setError(data.error)
 }
 } catch (err) {
 setError('网络错误')
 } finally {
 setLoading(false)
 }
 }

 const filteredProblems = problems.filter(p => {
 if (sourceFilter === 'all') return true
 if (sourceFilter === 'MANUAL_CREATED') {
 return !p.aiStatus || p.aiStatus === 'MANUAL_CREATED' || p.aiStatus === 'NONE'
 }
 if (sourceFilter === 'AI_ASSISTED') {
 return p.aiStatus === 'AI_ASSISTED' || p.aiStatus === 'ASSISTED'
 }
 if (sourceFilter === 'AI_GENERATED') {
 return p.aiStatus === 'AI_GENERATED' || p.aiStatus === 'GENERATED'
 }
 return p.aiStatus === sourceFilter
 })

 const handleExport = () => {
 window.open(`/api/admin/problems/export?source=${sourceFilter}`, '_blank')
 }

 const handleBatchUpdate = async () => {
 if (selectedIds.size === 0) return
 setProcessing(true)
 try {
 const response = await fetchWithAuth('/api/admin/problems/batch-source', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 ids: Array.from(selectedIds),
 source: targetSource
 })
 })
 const data = await response.json()
 if (data.success) {
 alert(data.message)
 setShowBatchModal(false)
 setSelectedIds(new Set())
 setTableKey(k => k + 1)
 fetchProblems()
 } else {
 alert(data.error)
 }
 } catch (err) {
 alert('网络错误')
 } finally {
 setProcessing(false)
 }
 }

 const toggleSelectAll = () => {
 if (selectedIds.size === filteredProblems.length) {
 setSelectedIds(new Set())
 } else {
 setSelectedIds(new Set(filteredProblems.map(p => p.id)))
 }
 }

 const toggleSelect = (id: string) => {
 const newSelected = new Set(selectedIds)
 if (newSelected.has(id)) newSelected.delete(id)
 else newSelected.add(id)
 setSelectedIds(newSelected)
 }

 const problemColumns: Column<Problem>[] = [
 {
 key: 'title',
 label: '题目',
 render: (value, row) => (
 <div>
 <div className="font-medium text-foreground">{value}</div>
 <div className="text-xs text-muted-foreground font-mono mt-0.5">{row.id}</div>
 </div>
 ),
 },
 {
 key: 'aiStatus',
 label: '来源标记',
 render: (value) => {
 if (value === 'AI_GENERATED' || value === 'GENERATED') {
 return <span className="tag tag-primary">AI_GENERATED</span>
 }
 if (value === 'AI_ASSISTED' || value === 'ASSISTED') {
 return <span className="tag tag-info">AI_ASSISTED</span>
 }
 return <span className="tag">MANUAL_CREATED</span>
 },
 },
 {
 key: 'updatedAt',
 label: '最后更新',
 render: (value) => (
 <span className="text-sm text-muted-foreground">
 {new Date(value).toLocaleString()}
 </span>
 ),
 },
 ]

 const logColumns: Column<any>[] = [
 {
 key: 'createdAt',
 label: '时间',
 render: (value) => (
 <span className="text-sm text-muted-foreground">
 {new Date(value).toLocaleString()}
 </span>
 ),
 },
 {
 key: 'userId',
 label: '操作人',
 render: (value) => (
 <span className="text-sm text-foreground font-medium">
 {value || 'System'}
 </span>
 ),
 },
 {
 key: 'action',
 label: '动作',
 render: (value) => <span className="tag">{value}</span>,
 },
 {
 key: 'details',
 label: '详情',
 render: (value) => value ? (
 <div className="space-y-1 text-sm text-muted-foreground">
 {value.count !== undefined && <div>数量: {value.count}</div>}
 {value.targetSource && (
 <div>
 目标来源: <span className="font-mono text-xs">{value.targetSource}</span>
 </div>
 )}
 </div>
 ) : (
 <span className="text-muted-foreground">-</span>
 ),
 },
 {
 key: 'ip',
 label: 'IP',
 render: (value) => (
 <span className="text-sm text-muted-foreground font-mono text-xs">{value}</span>
 ),
 },
 ]

 if (loading) {
 return (
 <AdminLayout>
 <div className="flex items-center justify-center min-h-screen">
 <div className="text-center">
 <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
 <p className="text-muted-foreground">加载中...</p>
 </div>
 </div>
 </AdminLayout>
 )
 }

 return (
 <AdminLayout>
 <div className="space-y-6">
 <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
 <div className="flex items-center gap-4">
 <button onClick={() => router.back()} className="p-2 hover:bg-muted rounded-lg transition-colors">
 <ArrowLeft className="w-5 h-5 text-muted-foreground" />
 </button>
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl flex items-center justify-center"
 style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
 <Database className="w-5 h-5 text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">题目来源管理</h1>
 <p className="text-sm text-muted-foreground">集中管理题目来源标记及审计日志</p>
 </div>
 </div>
 </div>
 <button
 onClick={handleExport}
 className="btn btn-ghost flex items-center gap-2 text-green-400 hover:bg-secondary/100/20"
 >
 <Download className="w-5 h-5" />
 导出报表
 </button>
 </div>

 <div className="flex gap-1 p-1 rounded-lg bg-muted">
 <button 
 onClick={() => setActiveTab('problems')} 
 className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
 activeTab === 'problems' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 题目来源列表
 </button>
 <button 
 onClick={() => setActiveTab('logs')} 
 className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
 activeTab === 'logs' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 来源变更日志
 </button>
 </div>

 {activeTab === 'problems' ? (
 <>
 <div className="flex gap-1 p-1 rounded-lg bg-muted">
 {[
 { id: 'all', label: '全部来源' },
 { id: 'MANUAL_CREATED', label: '人工录入' },
 { id: 'AI_ASSISTED', label: 'AI 辅助生成' },
 { id: 'AI_GENERATED', label: 'AI 全自动出题' }
 ].map(tab => (
 <button 
 key={tab.id}
 onClick={() => setSourceFilter(tab.id)}
 className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
 sourceFilter === tab.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
 }`}
 >
 {tab.label}
 </button>
 ))}
 </div>

 <DataTable
 key={tableKey}
 data={filteredProblems}
 columns={problemColumns}
 idKey="id"
 emptyMessage="暂无题目"
 onRowClick={(row) => router.push(`/admin/problems/${row.id}/testcases`)}
 batchActions={[
 {
 label: '批量修改来源',
 action: (ids) => {
 setSelectedIds(new Set(ids))
 setShowBatchModal(true)
 }
 }
 ]}
 />
 </>
 ) : (
 <div className="space-y-4">
 <div className="flex justify-between items-center">
 <h3 className="font-bold text-foreground flex items-center gap-2">
 <History className="w-5 h-5 text-muted-foreground" />
 最近变更记录
 </h3>
 <button onClick={fetchLogs} className="text-sm text-primary-light hover:text-foreground">刷新</button>
 </div>
 <DataTable
 data={logs}
 columns={logColumns}
 idKey="id"
 loading={logsLoading}
 emptyMessage="暂无变更记录"
 />
 </div>
 )}

 {showBatchModal && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
 <div className="card p-6 max-w-md w-full mx-4">
 <h3 className="text-lg font-bold text-foreground mb-4">批量修改来源标记</h3>
 <p className="text-muted-foreground mb-4 text-sm">正在修改 <span className="text-foreground font-bold">{selectedIds.size}</span> 个题目的来源属性。</p>
 
 <div className="space-y-3">
 {['MANUAL_CREATED', 'AI_ASSISTED', 'AI_GENERATED'].map(opt => (
 <label key={opt} className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors">
 <input 
 type="radio" 
 name="source" 
 value={opt} 
 checked={targetSource === opt} 
 onChange={(e) => setTargetSource(e.target.value)}
 className="text-primary focus:ring-primary/50"
 />
 <span className="font-medium text-foreground">{opt}</span>
 </label>
 ))}
 </div>

 <div className="mt-6 flex justify-end gap-3">
 <button onClick={() => setShowBatchModal(false)} className="btn btn-ghost">取消</button>
 <button 
 onClick={handleBatchUpdate} 
 disabled={processing}
 className="btn btn-primary"
 >
 {processing ? '处理中...' : '确认修改'}
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 </AdminLayout>
 )
}
