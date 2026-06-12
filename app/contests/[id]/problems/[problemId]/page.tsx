'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clock, Database, Send, AlertCircle, ArrowLeft, CheckCircle, XCircle, Wifi, WifiOff, BookOpen, ListChecks } from 'lucide-react'
import { useUser } from '@/contexts/UserContext'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import { logger } from '@/lib/logger'
import JudgeStatus from '@/components/submission/JudgeStatus'
import ProblemDescription from '@/components/problem/ProblemDescription'
import SubmissionList from '@/components/problem/SubmissionList'
import type { Problem, Submission, JudgeStatusData } from '@/types/models'

export default function ContestProblemDetailPage({ params }: { params: Promise<{ id: string, problemId: string }> }) {
  const { id: contestId, problemId } = use(params)
  const router = useRouter()
  const { user } = useUser()
  
  const [problem, setProblem] = useState<Problem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [code, setCode] = useState('// Write your code here\n')
  const [language, setLanguage] = useState('cpp')
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ type: 'success' | 'error', text: string, id?: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'description' | 'submissions'>('description')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null)
  const [judgeStatus, setJudgeStatus] = useState<JudgeStatusData | null>(null)
  const [showJudgeStatus, setShowJudgeStatus] = useState(false)
  const [judgeProgress, setJudgeProgress] = useState<{ currentTest: number; totalTests: number } | null>(null)

  const { isConnected } = useSubmissionSocket({
    userId: user?.id || '',
    enabled: !!user,
    onSubmissionUpdate: (data) => {
      logger.debug('收到实时评测结果', data)
      
      setSubmissions(prev => {
        const index = prev.findIndex(s => s.id === data.id)
        if (index !== -1) {
          const newSubmissions = [...prev]
          newSubmissions[index] = { ...newSubmissions[index], ...data }
          return newSubmissions
        }
        return prev
      })

      if (data.id === currentSubmissionId) {
        setJudgeStatus({
          submissionId: data.id,
          status: data.status,
          passedTests: data.passedTests || 0,
          totalTests: data.totalTests || 0,
          testResults: data.testResults || [],
        })
        
        setShowJudgeStatus(true)
        
        if (data.status !== 'Pending' && data.status !== 'Judging') {
          setSubmitting(false)
          setJudgeProgress(null)
          setSubmitResult({ 
            type: data.status === 'AC' || data.status === 'Accepted' ? 'success' : 'error', 
            text: `评测完成：${data.status}`,
            id: data.id 
          })
          fetchSubmissions()
        }
      }
    },
    onJudgeProgress: (data) => {
      console.log('📡 评测进度:', data)
      if (data.submissionId === currentSubmissionId) {
        setJudgeProgress({
          currentTest: data.currentTest,
          totalTests: data.totalTests,
        })
        if (!judgeStatus) {
          setJudgeStatus({
            submissionId: data.submissionId,
            status: 'Judging',
            passedTests: 0,
            totalTests: data.totalTests,
            testResults: [],
          })
          setShowJudgeStatus(true)
        }
      }
    }
  })

  useEffect(() => {
    fetchProblem()
  }, [problemId])

  useEffect(() => {
    if (activeTab === 'submissions') {
      fetchSubmissions()
    }
  }, [activeTab, contestId, problemId])

  const fetchProblem = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/problems/${problemId}`)
      const data = await res.json()
      
      if (data.success) {
        setProblem(data.data)
      } else {
        setError(data.error || '获取题目失败')
      }
    } catch (err) {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  const fetchSubmissions = async () => {
    try {
      const res = await fetch(`/api/contests/${contestId}/submissions?problemId=${problemId}&userId=${user?.id || ''}`)
      const data = await res.json()
      if (data.success) {
        setSubmissions(data.data.submissions)
      }
    } catch (err) {
      logger.error('Fetch submissions failed', err)
    }
  }

  const handleSubmit = async () => {
    if (!user) {
      router.push(`/login?redirect=/contests/${contestId}/problems/${problemId}`)
      return
    }

    if (!code.trim()) {
      setSubmitResult({ type: 'error', text: '代码不能为空' })
      return
    }

    try {
      setSubmitting(true)
      setSubmitResult(null)
      setShowJudgeStatus(false)

      const res = await fetch(`/api/contests/${contestId}/submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          problemId,
          code,
          language
        })
      })

      const data = await res.json()

      if (data.success) {
        setSubmitResult({ type: 'success', text: '提交成功，正在评测...', id: data.submissionId })
        setCurrentSubmissionId(data.submissionId)
        setActiveTab('submissions')
        fetchSubmissions()
      } else {
        setSubmitResult({ type: 'error', text: data.error || '提交失败' })
        setSubmitting(false)
      }
    } catch (err) {
      setSubmitResult({ type: 'error', text: '网络错误' })
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-muted-foreground text-lg">加载题目中...</p>
        </div>
      </div>
    )
  }

  if (error || !problem) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center card-static rounded-2xl p-12 max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <p className="text-error text-lg mb-6">{error || '题目不存在'}</p>
          <button
            onClick={() => router.back()}
            className="btn btn-primary"
          >
            返回
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-12">
      <Link
        href={`/contests/${contestId}/problems`}
        className="flex items-center gap-2 text-muted-foreground hover:text-primary-light mb-6 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        返回题目列表
      </Link>

      <div className={`grid gap-6 transition-all duration-300 ${
        isEditorOpen ? 'lg:grid-cols-2' : 'lg:grid-cols-1'
      }`}>
        <div className="space-y-6">
          <div className="card-static rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono text-lg font-bold text-primary-light">
                    {problem.problemNumber || problemId}
                  </span>
                  <h1 className="text-xl font-bold text-foreground">{problem.title}</h1>
                </div>
                
                {problem.tags && problem.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {problem.tags.map((tag: string, index: number) => (
                      <span key={index} className="tag tag-primary">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="glass rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs">时间限制</span>
                </div>
                <div className="text-lg font-bold text-foreground">{problem.timeLimit}ms</div>
              </div>
              <div className="glass rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
                  <Database className="w-4 h-4" />
                  <span className="text-xs">内存限制</span>
                </div>
                <div className="text-lg font-bold text-foreground">{problem.memoryLimit}MB</div>
              </div>
              <div className="glass rounded-xl p-4 text-center col-span-2 sm:col-span-1">
                <button
                  onClick={() => setIsEditorOpen(!isEditorOpen)}
                  className={`w-full h-full flex items-center justify-center gap-2 rounded-lg transition-colors ${
                    isEditorOpen
                      ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                      : 'bg-primary text-white hover:bg-primary-dark'
                  }`}
                >
                  {isEditorOpen ? (
                    <>
                      <XCircle className="w-4 h-4" />
                      关闭编辑器
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      提交代码
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="card-static rounded-2xl overflow-hidden">
            <div className="flex border-b border-border">
              {[
                { key: 'description', label: '题目描述', icon: BookOpen },
                { key: 'submissions', label: '提交记录', icon: ListChecks }
              ].map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as typeof activeTab)}
                    className={`flex items-center gap-2 px-5 py-3.5 font-medium transition-all relative ${
                      activeTab === tab.key
                        ? 'text-primary-light'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {activeTab === tab.key && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                    )}
                  </button>
                )
              })}
            </div>

            <div className="p-6 max-h-[calc(100vh-400px)] overflow-y-auto custom-scrollbar">
              {activeTab === 'description' && (
                <ProblemDescription problem={problem} />
              )}

              {activeTab === 'submissions' && (
                <SubmissionList
                  submissions={submissions}
                  loading={false}
                  error={null}
                  user={user}
                  fromAssignment={null}
                  classId={null}
                  onSelect={() => {}}
                />
              )}
            </div>
          </div>
        </div>

        <div 
          className={`space-y-4 transition-all duration-300 overflow-hidden ${
            isEditorOpen 
              ? 'opacity-100 max-h-screen' 
              : 'opacity-0 max-h-0 lg:hidden'
          }`}
        >
          <div className="card-static rounded-2xl overflow-hidden sticky top-6">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Send className="w-4 h-4 text-primary-light" />
                </div>
                <h2 className="font-semibold text-foreground">代码编辑器</h2>
              </div>
              {user && (
                <div className="flex items-center gap-2 text-xs">
                  {isConnected ? (
                    <div className="flex items-center gap-1.5 text-secondary-light">
                      <Wifi className="w-3.5 h-3.5" />
                      <span>实时连接</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <WifiOff className="w-3.5 h-3.5" />
                      <span>已断开</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {showJudgeStatus && judgeStatus && (
              <JudgeStatus
                submissionId={judgeStatus.submissionId}
                status={judgeStatus.status}
                passedTests={judgeStatus.passedTests}
                totalTests={judgeStatus.totalTests}
                testResults={judgeStatus.testResults}
                onClose={() => setShowJudgeStatus(false)}
              />
            )}
            
            {submitResult && (
              <div className={`mx-5 mt-4 p-3 rounded-xl flex items-center gap-2 ${
                submitResult.type === 'success' 
                  ? 'bg-secondary/10 text-secondary-light border border-secondary/20' 
                  : 'bg-error/10 text-error border border-error/20'
              }`}>
                {submitResult.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span className="text-sm">{submitResult.text}</span>
              </div>
            )}

            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-medium text-foreground">选择语言</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="input w-auto min-w-[140px] py-2 text-sm"
                >
                  <option value="cpp">C++</option>
                  <option value="c">C</option>
                  <option value="java">Java</option>
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                </select>
              </div>

              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-[500px] rounded-xl bg-slate-900 text-slate-100 font-mono text-sm p-4 border border-border hover:border-primary/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y transition-colors duration-300"
                spellCheck={false}
                placeholder="在此粘贴或输入代码..."
              />

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn btn-primary flex-1"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      评测中...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      提交代码
                    </>
                  )}
                </button>
                <button
                  onClick={() => setCode('// Write your code here\n')}
                  className="btn btn-ghost"
                >
                  重置
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
