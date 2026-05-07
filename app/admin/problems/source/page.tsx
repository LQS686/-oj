'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { ArrowLeft, Download, Database, CheckCircle, AlertCircle, Edit, Clock, History, Loader2 } from 'lucide-react'

interface Problem {
  id: string
  title: string
  aiStatus: string
  isVerified: boolean
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
        setLogs(data.data)
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

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-400">加载中...</p>
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
            <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
                <Database className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">题目来源管理</h1>
                <p className="text-sm text-slate-400">集中管理题目来源标记、验证状态及审计日志</p>
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

        <div className="flex gap-1 p-1 rounded-lg bg-white/5">
          <button 
            onClick={() => setActiveTab('problems')} 
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'problems' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            题目来源列表
          </button>
          <button 
            onClick={() => setActiveTab('logs')} 
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'logs' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            来源变更日志
          </button>
        </div>

        {activeTab === 'problems' ? (
          <>
            <div className="flex gap-1 p-1 rounded-lg bg-white/5">
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
                    sourceFilter === tab.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {selectedIds.size > 0 && (
              <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg flex items-center justify-between">
                <span className="text-primary-light font-medium">已选择 {selectedIds.size} 项</span>
                <button
                  onClick={() => setShowBatchModal(true)}
                  className="btn btn-primary text-sm flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  批量修改来源
                </button>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-6 py-3 w-4">
                        <input 
                          type="checkbox" 
                          checked={filteredProblems.length > 0 && selectedIds.size === filteredProblems.length} 
                          onChange={toggleSelectAll} 
                          className="rounded border-slate-600 bg-slate-800 text-primary focus:ring-primary/50" 
                        />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">题目</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">来源标记</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">验证状态</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">最后更新</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredProblems.map(p => (
                      <tr key={p.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <input 
                            type="checkbox" 
                            checked={selectedIds.has(p.id)} 
                            onChange={() => toggleSelect(p.id)} 
                            className="rounded border-slate-600 bg-slate-800 text-primary focus:ring-primary/50" 
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">{p.title}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{p.id}</div>
                        </td>
                        <td className="px-6 py-4">
                          {(p.aiStatus === 'AI_GENERATED' || p.aiStatus === 'GENERATED') ? (
                            <span className="tag tag-primary">AI_GENERATED</span>
                          ) : (p.aiStatus === 'AI_ASSISTED' || p.aiStatus === 'ASSISTED') ? (
                            <span className="tag tag-info">AI_ASSISTED</span>
                          ) : (
                            <span className="tag">MANUAL_CREATED</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {p.isVerified ? (
                            <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
                              <CheckCircle className="w-4 h-4" />
                              已验证
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
                              <AlertCircle className="w-4 h-4" />
                              待验证
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400">
                          {new Date(p.updatedAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => router.push(`/admin/problems/${p.id}/testcases`)}
                            className="text-primary-light hover:text-white text-sm font-medium"
                          >
                            去验证 →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-slate-400" />
                最近变更记录
              </h3>
              <button onClick={fetchLogs} className="text-sm text-primary-light hover:text-white">刷新</button>
            </div>
            {logsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">暂无变更记录</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">时间</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">操作人</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">动作</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">详情</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {logs.map(log => (
                      <tr key={log.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 text-sm text-slate-400">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-sm text-white font-medium">
                          {log.userId || 'System'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-300">
                          <span className="tag">
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400">
                          {log.details ? (
                            <div className="space-y-1">
                              {log.details.count !== undefined && <div>数量: {log.details.count}</div>}
                              {log.details.targetSource && (
                                <div>
                                  目标来源: <span className="font-mono text-xs">{log.details.targetSource}</span>
                                </div>
                              )}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground font-mono text-xs">
                          {log.ip}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {showBatchModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-bold text-white mb-4">批量修改来源标记</h3>
              <p className="text-slate-400 mb-4 text-sm">正在修改 <span className="text-white font-bold">{selectedIds.size}</span> 个题目的来源属性。</p>
              
              <div className="space-y-3">
                {['MANUAL_CREATED', 'AI_ASSISTED', 'AI_GENERATED'].map(opt => (
                  <label key={opt} className="flex items-center gap-3 p-3 rounded-lg border border-white/10 cursor-pointer hover:bg-white/5 transition-colors">
                    <input 
                      type="radio" 
                      name="source" 
                      value={opt} 
                      checked={targetSource === opt} 
                      onChange={(e) => setTargetSource(e.target.value)}
                      className="text-primary focus:ring-primary/50"
                    />
                    <span className="font-medium text-slate-300">{opt}</span>
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
