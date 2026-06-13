'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AdminLayout from '@/components/AdminLayout'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { ArrowLeft, Upload, X, Plus, Sparkles, Loader2, Save, FileText, CheckCircle, AlertCircle, Clock, Database } from 'lucide-react'
import { ModelSelector } from '@/components/ai/ModelSelector'
import { ensureTotalScoreIs100 } from '@/lib/problem/testcase'

interface TestCase {
  input: string
  output: string
  isSample: boolean
  score: number
}

export default function ProblemTestCasesPage() {
  const router = useRouter()
  const params = useParams()
  const problemId = params.id as string
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; count?: number } | null>(null)

  const [problemTitle, setProblemTitle] = useState('')
  const [description, setDescription] = useState('')
  const [inputDesc, setInputDesc] = useState('')
  const [outputDesc, setOutputDesc] = useState('')
  const [aiStatus, setAiStatus] = useState('NONE')

  const [testCases, setTestCases] = useState<TestCase[]>([])

  const [showAiModal, setShowAiModal] = useState(false)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [solutionCode, setSolutionCode] = useState('')
  const [solutionLanguage, setSolutionLanguage] = useState('cpp')
  const [modelId, setModelId] = useState('')
  const [aiGenCount, setAiGenCount] = useState(10)
  const [pollingLogId, setPollingLogId] = useState<string | null>(null)

  const [showLogsModal, setShowLogsModal] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  useEffect(() => {
    if (showLogsModal) {
      fetchLogs()
    }
  }, [showLogsModal])

  const fetchLogs = async () => {
    setLogsLoading(true)
    try {
      const res = await fetchWithAuth(`/api/admin/problems/${problemId}/verification-logs`)
      const data = await res.json()
      if (data.success) {
        setLogs(Array.isArray(data.data) ? data.data : [])
      }
    } catch (err) {
      logger.error('Failed to fetch logs', err)
    } finally {
      setLogsLoading(false)
    }
  }

  useEffect(() => {
    if (pollingLogId) {
      const interval = setInterval(async () => {
        try {
          const res = await fetchWithAuth(`/api/admin/ai/generate?logId=${pollingLogId}`)
          const data = await res.json()
          
          if (data.success && data.data) {
            const status = data.data.status
            if (status === 'COMPLETED') {
              clearInterval(interval)
              setPollingLogId(null)
              setAiGenerating(false)
              setSuccessMsg('AI 生成完成，正在刷新数据...')
              await fetchProblemData()
            } else if (status === 'FAILED') {
              clearInterval(interval)
              setPollingLogId(null)
              setAiGenerating(false)
              setError('AI 生成失败: ' + (data.data.error || '未知错误'))
            }
          }
        } catch (err) {
          logger.error('轮询生成状态失败', err)
        }
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [pollingLogId])

  useEffect(() => {
    fetchProblemData()
  }, [problemId])

  const fetchProblemData = async () => {
    try {
      setLoading(true)
      const response = await fetchWithAuth(`/api/admin/problems/${problemId}`)

      if (!response.ok) throw new Error('Failed to fetch problem')
      
      const data = await response.json()
      if (data.success) {
        const problem = data.data
        setProblemTitle(problem.title)
        setDescription(problem.description)
        setInputDesc(problem.input || '')
        setOutputDesc(problem.output || '')
        setAiStatus(problem.aiStatus || 'NONE')

        if (problem.stdCode) {
            setSolutionCode(problem.stdCode)
        }
        if (problem.stdLang) {
            setSolutionLanguage(problem.stdLang)
        }
        
        if (problem.testCases && problem.testCases.length > 0) {
          const cases = problem.testCases.map((tc: any) => ({
            input: tc.input,
            output: tc.output,
            isSample: tc.isSample,
            score: tc.score
          }))
          setTestCases(cases)
        }
      } else {
        setError(data.error || '获取题目数据失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const distributeScores = (cases: TestCase[]): TestCase[] => {
    if (cases.length === 0) return cases
    // 使用统一的测试点分数组件，保证最终总分 = 100
    return ensureTotalScoreIs100(cases)
  }

  const handleAddTestCase = () => {
    const newCases = [...testCases, { input: '', output: '', isSample: false, score: 0 }]
    setTestCases(distributeScores(newCases))
  }

  const handleRemoveTestCase = (index: number) => {
    const newCases = testCases.filter((_, i) => i !== index)
    setTestCases(distributeScores(newCases))
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.zip')) {
      alert('只支持 ZIP 格式压缩包')
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      alert('压缩包大小不能超过 50MB')
      return
    }

    setUploading(true)
    setUploadResult(null)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetchWithAuth('/api/admin/testcases/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        const uploaded = Array.isArray(data.data?.testCases)
          ? data.data.testCases
          : []
        const newTestCases: TestCase[] = ensureTotalScoreIs100(
          uploaded.map((tc: any) => ({
            input: tc.inputPreview,
            output: tc.outputPreview,
            isSample: false,
            score: 10
          }))
        )
        
        if (testCases.length > 0 && !confirm('是否覆盖现有测试用例？点击取消将追加到现有列表。')) {
           setTestCases(distributeScores([...testCases, ...newTestCases]))
        } else {
           setTestCases(distributeScores(newTestCases))
        }

        setUploadResult({
          success: true,
          message: data.message,
          count: data.data.count
        })
      } else {
        setUploadResult({
          success: false,
          message: data.error || '上传失败'
        })
        setError('测试点上传失败: ' + (data.error || '未知错误'))
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '网络错误'
      setUploadResult({
        success: false,
        message: errorMessage
      })
      setError('上传请求失败: ' + errorMessage)
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleVerifyWithSolution = async () => {
    if (!solutionCode.trim()) {
      alert('请提供标程代码')
      return
    }

    setVerifying(true)
    setError('')
    setSuccessMsg('')
    
    try {
      const response = await fetchWithAuth(`/api/admin/problems/${problemId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solutionCode,
          solutionLanguage
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccessMsg(data.message)
        setShowVerifyModal(false)
        fetchProblemData()
      } else {
        setError(data.error || '验证失败')
      }
    } catch (err) {
      logger.error('Verify failed', err)
      setError('网络请求失败')
    } finally {
      setVerifying(false)
    }
  }

  const handleAiGenerateTestCases = async () => {
    if (!solutionCode.trim()) {
      alert('请提供标程代码以确保数据正确性')
      return
    }
    
    setShowAiModal(false)
    setAiGenerating(true)
    setError('')
    setSuccessMsg('')

    try {
      const response = await fetchWithAuth('/api/admin/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'test_data',
          targetProblemId: problemId,
          title: problemTitle,
          description,
          inputDescription: inputDesc,
          outputDescription: outputDesc,
          count: aiGenCount,
          solutionCode: solutionCode.trim() || undefined,
          solutionLanguage: solutionCode.trim() ? solutionLanguage : undefined,
          modelId
        })
      })

      const data = await response.json()

      if (data.success && data.data?.logId) {
        setPollingLogId(data.data.logId)
      } else {
        setAiGenerating(false)
        alert('提交生成任务失败: ' + (data.error || '未知错误'))
      }
    } catch (err) {
      logger.error('AI 生成测试数据失败', err)
      alert('网络请求失败')
      setAiGenerating(false)
    }
  }

  const handleSave = async () => {
    setSubmitting(true)
    setError('')
    setSuccessMsg('')

    try {
      const totalScore = testCases.reduce((sum, tc) => sum + (tc.score || 0), 0)
      if (totalScore !== 100) {
        if (!confirm(`当前测试点总分为 ${totalScore} 分，通常应为 100 分。是否继续保存？`)) {
          setSubmitting(false)
          return
        }
      }

      const response = await fetchWithAuth(`/api/admin/problems/${problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCases: testCases
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccessMsg('测试用例保存成功！')
        setTimeout(() => setSuccessMsg(''), 3000)
      } else {
        setError(data.error || '保存失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setSubmitting(false)
    }
  }

  const autoDistributeScore = () => {
    setTestCases(distributeScores(testCases))
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-400">加载题目数据...</p>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)' }}>
                <Database className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  测试数据管理
                  <span className="text-sm font-normal text-slate-400 bg-white/10 px-2 py-0.5 rounded">
                    {problemTitle}
                  </span>
                </h1>
                <p className="text-sm text-slate-400">
                  共 {testCases.length} 个测试点，总分 {testCases.reduce((a, b) => a + (b.score || 0), 0)} 分
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowLogsModal(true)}
              className="btn btn-ghost text-sm flex items-center gap-2"
            >
              <Clock className="w-4 h-4" />
              日志
            </button>
            <button
              onClick={() => setShowVerifyModal(true)}
              className="btn btn-ghost text-sm flex items-center gap-2 text-indigo-400 hover:bg-indigo-500/20"
            >
              <CheckCircle className="w-4 h-4" />
              标程验证
            </button>
            <button
              onClick={autoDistributeScore}
              className="btn btn-ghost text-sm"
            >
              自动均分
            </button>
            <button
              onClick={handleSave}
              disabled={submitting}
              className="btn btn-primary flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              保存
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-error/100/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-secondary/100/20 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {successMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-6">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary-light" />
              批量上传
            </h3>
            <div 
              className="border-2 border-dashed border-white/20 rounded-lg p-6 text-center hover:bg-white/5 transition-colors cursor-pointer" 
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2">
                {uploading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-primary-light" />
                ) : (
                  <Upload className="w-8 h-8 text-muted-foreground" />
                )}
                <span className="text-sm font-medium text-slate-400">
                  {uploading ? '正在处理...' : '点击上传 ZIP 压缩包'}
                </span>
                <span className="text-xs text-muted-foreground">
                  支持 .in/.out 或 .input/.output 文件配对
                </span>
              </div>
            </div>
            {uploadResult && (
              <div className={`mt-4 text-sm p-3 rounded-lg ${uploadResult.success ? 'bg-secondary/100/20 text-green-400' : 'bg-error/100/20 text-red-400'}`}>
                {uploadResult.message}
                {uploadResult.count !== undefined && ` (共 ${uploadResult.count} 个)`}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              AI 智能生成
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              根据题目描述和标程自动生成高强度测试数据。
            </p>
            <button
              onClick={() => setShowAiModal(true)}
              className="btn btn-ghost w-full flex items-center justify-center gap-2 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30"
            >
              <Sparkles className="w-4 h-4" />
              配置生成参数
            </button>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="p-4 border-b border-white/10 flex justify-between items-center">
            <h3 className="font-bold text-white">测试点列表</h3>
            <button
              onClick={handleAddTestCase}
              className="btn btn-ghost text-sm flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              添加测试点
            </button>
          </div>
          
          <div className="divide-y divide-white/5">
            {testCases.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                暂无测试数据，请使用上方工具添加
              </div>
            ) : (
              testCases.map((tc, idx) => (
                <div key={idx} className="p-4 hover:bg-white/5 transition-colors group">
                  <div className="flex items-start gap-4">
                    <div className="w-12 pt-2 flex flex-col items-center gap-1">
                      <span className="text-xs font-bold text-muted-foreground uppercase">Case</span>
                      <span className="text-lg font-bold text-white">{idx + 1}</span>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <label className="text-xs font-bold text-muted-foreground uppercase">Input</label>
                          <span className="text-xs text-muted-foreground">{tc.input.length} chars</span>
                        </div>
                        <textarea
                          value={tc.input}
                          onChange={(e) => {
                            const newCases = [...testCases]
                            newCases[idx].input = e.target.value
                            setTestCases(newCases)
                          }}
                          rows={5}
                          className="input font-mono text-xs resize-y"
                          placeholder="输入数据..."
                        />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <label className="text-xs font-bold text-muted-foreground uppercase">Output</label>
                          <span className="text-xs text-muted-foreground">{tc.output.length} chars</span>
                        </div>
                        <textarea
                          value={tc.output}
                          onChange={(e) => {
                            const newCases = [...testCases]
                            newCases[idx].output = e.target.value
                            setTestCases(newCases)
                          }}
                          rows={5}
                          className="input font-mono text-xs resize-y"
                          placeholder="预期输出..."
                        />
                      </div>
                    </div>

                    <div className="w-24 pt-2 flex flex-col gap-3">
                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase mb-1 text-center">Score</label>
                        <input
                          type="number"
                          value={tc.score}
                          onChange={(e) => {
                            const newCases = [...testCases]
                            newCases[idx].score = parseInt(e.target.value) || 0
                            setTestCases(newCases)
                          }}
                          className="input text-sm text-center"
                        />
                      </div>
                      <button
                        onClick={() => handleRemoveTestCase(idx)}
                        className="w-full py-1 text-xs text-red-400 hover:bg-error/100/20 rounded-lg transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {showAiModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card p-6 max-w-2xl w-full mx-4">
              <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  AI 生成配置
                </h3>
                <button onClick={() => setShowAiModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-5">
                <div className="bg-primary/10 p-4 rounded-lg text-sm text-primary-light border border-primary/20">
                  <p className="font-medium mb-1">💡 最佳实践：</p>
                  <ul className="list-disc list-inside space-y-1 opacity-80">
                    <li>提供高质量的标程是生成的关键</li>
                    <li>推荐使用非思考模型以获得更快速度</li>
                    <li>生成的测试数据将追加到现有列表中</li>
                  </ul>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">生成数量</label>
                    <select 
                      value={aiGenCount}
                      onChange={(e) => setAiGenCount(parseInt(e.target.value))}
                      className="input"
                    >
                      <option value="5">5 组</option>
                      <option value="10">10 组</option>
                      <option value="20">20 组</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">标程语言</label>
                    <select
                      value={solutionLanguage}
                      onChange={(e) => setSolutionLanguage(e.target.value)}
                      className="input"
                    >
                      <option value="cpp">C++ (G++ 12)</option>
                      <option value="python">Python 3.11</option>
                      <option value="java">Java 17</option>
                      <option value="c">C (GCC 12)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">选择 AI 模型</label>
                  <ModelSelector value={modelId} onChange={setModelId} showThinking={false} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    标程代码 <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={solutionCode}
                    onChange={(e) => setSolutionCode(e.target.value)}
                    placeholder="// 粘贴标程代码..."
                    className="input min-h-[160px] font-mono text-sm resize-y"
                    required
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  onClick={() => setShowAiModal(false)}
                  className="btn btn-ghost"
                >
                  取消
                </button>
                <button
                  onClick={handleAiGenerateTestCases}
                  className="btn btn-primary bg-purple-500 hover:bg-purple-600 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  确认生成
                </button>
              </div>
            </div>
          </div>
        )}

        {showVerifyModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card p-6 max-w-2xl w-full mx-4">
              <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-indigo-400" />
                  标程验证与输出纠正
                </h3>
                <button onClick={() => setShowVerifyModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-5">
                <div className="bg-indigo-500/10 p-4 rounded-lg text-sm text-indigo-300 border border-indigo-500/20">
                  <p className="font-medium mb-1">功能说明：</p>
                  <ul className="list-disc list-inside space-y-1 opacity-80">
                    <li>系统将运行您提供的标程代码，对当前所有测试点的输入进行计算。</li>
                    <li>所有测试点的<span className="font-bold">输出数据将被标程的运行结果覆盖</span>。</li>
                  </ul>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">标程语言</label>
                  <select
                    value={solutionLanguage}
                    onChange={(e) => setSolutionLanguage(e.target.value)}
                    className="input"
                  >
                    <option value="cpp">C++ (G++ 12)</option>
                    <option value="python">Python 3.11</option>
                    <option value="java">Java 17</option>
                    <option value="c">C (GCC 12)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    标程代码 <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={solutionCode}
                    onChange={(e) => setSolutionCode(e.target.value)}
                    placeholder="// 粘贴正确的解题代码..."
                    className="input min-h-[256px] font-mono text-sm resize-y"
                    required
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  onClick={() => setShowVerifyModal(false)}
                  className="btn btn-ghost"
                >
                  取消
                </button>
                <button
                  onClick={handleVerifyWithSolution}
                  disabled={verifying}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      验证中...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      开始验证
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {showLogsModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-slate-400" />
                  验证日志
                </h3>
                <button onClick={() => setShowLogsModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2">
                {logsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">暂无验证记录</div>
                ) : (
                  <div className="space-y-4">
                    {logs.map(log => (
                      <div key={log.id} className={`p-4 rounded-lg border ${log.status === 'SUCCESS' ? 'bg-secondary/100/10 border-green-500/20' : 'bg-error/100/10 border-red-500/20'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-sm font-bold ${log.status === 'SUCCESS' ? 'text-green-400' : 'text-red-400'}`}>
                            {log.status === 'SUCCESS' ? '验证通过' : '验证失败'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm text-slate-400 space-y-1">
                          <div>通过测试点: {log.details?.passed}</div>
                          <div>失败测试点: {log.details?.failed}</div>
                          {log.details?.fixedCount !== undefined && (
                            <div>自动纠正: {log.details.fixedCount}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
