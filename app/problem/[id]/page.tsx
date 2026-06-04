'use client'

import { useState, useEffect, use } from 'react'
import { 
  BookOpen, 
  Send, 
  AlertCircle, 
  Wifi, 
  WifiOff, 
  ArrowLeft, 
  XCircle, 
  Code as CodeIcon,
  CheckCircle2,
  Timer,
  MemoryStick,
  FileCode,
  MessageSquare,
  ListChecks,
  X
} from 'lucide-react'
import { getStatusColor } from '@/lib/status'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { useSubmissionSocket } from '@/hooks/useSubmissionSocket'
import JudgeStatus from '@/components/JudgeStatus'
import ProblemDescription from '@/components/problem/ProblemDescription'
import SubmissionList from '@/components/problem/SubmissionList'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'

const languageOptions = [
  { value: 'cpp', label: 'C++', version: 'C++17' },
  { value: 'c', label: 'C', version: 'C11' },
  { value: 'java', label: 'Java', version: 'Java 17' },
  { value: 'python', label: 'Python', version: 'Python 3.10' },
  { value: 'javascript', label: 'JavaScript', version: 'Node.js 18' }
]

function getStorageKey(problemId: string, teamId: string | null, assignmentId: string | null): string {
  if (teamId && assignmentId) {
    return `code_team_${teamId}_${assignmentId}_${problemId}`
  }
  return `code_problem_${problemId}`
}

function getLanguageStorageKey(problemId: string, teamId: string | null, assignmentId: string | null): string {
  if (teamId && assignmentId) {
    return `lang_team_${teamId}_${assignmentId}_${problemId}`
  }
  return `lang_problem_${problemId}`
}

export default function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: problemId } = use(params)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()
  
  const fromAssignment = searchParams.get('fromAssignment')
  const teamId = searchParams.get('teamId')
  const assignmentTitle = searchParams.get('assignmentTitle')
  const returnTab = searchParams.get('returnTab') || 'info'
  
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('cpp')
  const [activeTab, setActiveTab] = useState<'description' | 'submit' | 'solutions' | 'submissions'>('description')
  const [submitting, setSubmitting] = useState(false)
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null)
  const [judgeStatus, setJudgeStatus] = useState<any>(null)
  const [judgeProgress, setJudgeProgress] = useState<{ currentTest: number; totalTests: number } | null>(null)
  const [lastResult, setLastResult] = useState<{ status: string; score: number } | null>(null)
  
  const [problem, setProblem] = useState<any>(null)
  const [problemLoading, setProblemLoading] = useState(true)
  const [problemError, setProblemError] = useState<string | null>(null)
  
  const [submissions, setSubmissions] = useState<any[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null)

  useEffect(() => {
    const fetchProblem = async () => {
      try {
        setProblemLoading(true)
        setProblemError(null)
        
        const response = await fetch(`/api/problems/${problemId}`)
        const data = await response.json()
        
        if (data.success) {
          setProblem(data.data)
        } else {
          setProblemError(data.error || '获取题目失败')
        }
      } catch (error) {
        setProblemError('网络错误')
      } finally {
        setProblemLoading(false)
      }
    }
    
    fetchProblem()
  }, [problemId])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const codeKey = getStorageKey(problemId, teamId, fromAssignment)
    localStorage.removeItem(codeKey)

    const langKey = getLanguageStorageKey(problemId, teamId, fromAssignment)
    localStorage.removeItem(langKey)
  }, [problemId, teamId, fromAssignment])

  useEffect(() => {
    if (typeof window === 'undefined' || !code) return
    
    const codeKey = getStorageKey(problemId, teamId, fromAssignment)
    localStorage.setItem(codeKey, code)
  }, [code, problemId, teamId, fromAssignment])

  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const langKey = getLanguageStorageKey(problemId, teamId, fromAssignment)
    localStorage.setItem(langKey, language)
  }, [language, problemId, teamId, fromAssignment])
  
  const fetchSubmissions = async () => {
    try {
      setSubmissionsLoading(true)
      
      let url: string
      if (fromAssignment && teamId) {
        url = `/api/teams/${teamId}/assignments/${fromAssignment}/submissions?problemId=${problemId}`
        
        const response = await fetchWithAuth(url)
        const data = await response.json()
        
        if (data.success) {
          setSubmissions(data.data.submissions)
        }
      } else {
        url = user 
          ? `/api/problems/${problemId}/submissions?userId=${user.id}` 
          : `/api/problems/${problemId}/submissions`
        
        const response = await fetch(url)
        const data = await response.json()
        
        if (data.success) {
          setSubmissions(data.data.submissions)
        }
      }
    } catch (error) {
      logger.error('获取提交记录失败', error)
    } finally {
      setSubmissionsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'submissions') {
      fetchSubmissions()
    }
  }, [activeTab, problemId, user, fromAssignment, teamId])

  const { isConnected } = useSubmissionSocket({
    userId: user?.id || '',
    enabled: !!user,
    onSubmissionUpdate: (data) => {
      if (data.id === currentSubmissionId) {
        setJudgeStatus({
          submissionId: data.id,
          status: data.status,
          passedTests: data.passedTests || 0,
          totalTests: data.totalTests || 0,
          testResults: data.testResults || [],
        })
        
        if (data.status !== 'Pending' && data.status !== 'Judging') {
          setSubmitting(false)
          setJudgeProgress(null)
          setLastResult({
            status: data.status,
            // 不要再做 passedTests * 10 的兜底 — 后端 judge worker 已通过
            // `result.score += testCase.score` 计算精确分数；若 data.score 缺失
            // 显示 0（更诚实），避免显示 50/100 这种误导性数值
            score: typeof data.score === 'number' ? data.score : 0
          })
          fetchSubmissions()
        }
      }
    },
    onJudgeProgress: (data) => {
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
        }
      }
    }
  })

  const handleSubmit = async () => {
    if (!user) {
      router.push('/login')
      return
    }

    if (!code.trim() || code.trim().length < 10) {
      return
    }

    setSubmitting(true)
    setJudgeStatus(null)
    setJudgeProgress(null)
    setLastResult(null)

    try {
      let submitUrl: string
      let submitBody: any

      if (fromAssignment && teamId) {
        submitUrl = `/api/teams/${teamId}/assignments/${fromAssignment}/submit`
        submitBody = { problemId, code, language }
      } else {
        submitUrl = '/api/submissions'
        submitBody = { problemId, code, language }
      }

      const response = await fetchWithAuth(submitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitBody)
      })

      const data = await response.json()

      if (data.success) {
        setCurrentSubmissionId(data.submissionId)
        setActiveTab('submissions')
      } else {
        setSubmitting(false)
      }
    } catch (error) {
      setSubmitting(false)
    }
  }

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang)
  }

  const handleClearCode = () => {
    setCode('')
  }



  if (problemLoading) {
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

  if (problemError || !problem) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center card-static rounded-2xl p-12 max-w-md">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <p className="text-error text-lg mb-6">{problemError || '题目不存在'}</p>
          <button
            onClick={() => router.push('/problems')}
            className="btn-primary btn"
          >
            返回题库
          </button>
        </div>
      </div>
    )
  }

  const acceptRate = problem.totalSubmit > 0 
    ? ((problem.totalAccepted / problem.totalSubmit) * 100).toFixed(1) 
    : '0.0'

  return (
    <div className="min-h-screen pb-8">
      <div className="container mx-auto px-4 pt-6">
        <button
          onClick={() => {
            if (fromAssignment && teamId) {
              router.replace(`/teams/${teamId}/assignments/${fromAssignment}?tab=${returnTab}`)
            } else {
              router.push('/problems')
            }
          }}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary-light mb-4 transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-[-2px]" />
          <span className="transition-colors duration-300 group-hover:text-primary-light">{fromAssignment && teamId ? `返回作业` : '返回题库'}</span>
        </button>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="font-mono text-sm font-bold text-primary-light bg-primary/10 px-3 py-1 rounded-lg">
            {problem.problemNumber || problem.id}
          </span>
          <h1 className="text-xl font-bold text-foreground md:text-2xl">{problem.title}</h1>
          <span className={`tag ${
            problem.difficulty === '入门' ? 'tag-success' :
            problem.difficulty === '普及-' || problem.difficulty === '普及' ? 'tag-info' :
            problem.difficulty === '普及+' || problem.difficulty === '提高' ? 'tag-warning' :
            'tag-error'
          }`}>
            {problem.difficulty}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5 hover:text-primary-light transition-colors duration-300 group">
            <Timer className="w-4 h-4 group-hover:scale-110 transition-transform duration-300" />
            <span>时间限制: {problem.timeLimit}ms</span>
          </div>
          <div className="flex items-center gap-1.5 hover:text-primary-light transition-colors duration-300 group">
            <MemoryStick className="w-4 h-4 group-hover:scale-110 transition-transform duration-300" />
            <span>内存限制: {problem.memoryLimit}MB</span>
          </div>
          <div className="flex items-center gap-1.5 hover:text-primary-light transition-colors duration-300 group">
            <CheckCircle2 className="w-4 h-4 text-green-400 group-hover:scale-110 transition-transform duration-300" />
            <span>通过率 {acceptRate}%</span>
          </div>
          <div className="flex items-center gap-1.5 hover:text-primary-light transition-colors duration-300 group">
            <FileCode className="w-4 h-4 group-hover:scale-110 transition-transform duration-300" />
            <span>{problem.totalSubmit?.toLocaleString() || '0'} 提交</span>
          </div>
          {user && isConnected && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors duration-300 group">
              <Wifi className="w-3.5 h-3.5 group-hover:scale-110 transition-transform duration-300 animate-pulse-slow" />
              <span>实时连接</span>
            </div>
          )}
        </div>

        {submitting && judgeStatus && (
          <div className="mb-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span className="text-foreground">正在评测...</span>
                {judgeProgress && (
                  <span className="text-muted-foreground text-sm">
                    ({judgeProgress.currentTest}/{judgeProgress.totalTests})
                  </span>
                )}
              </div>
              <button 
                onClick={() => setJudgeStatus(null)}
                className="p-1 hover:bg-slate-700 rounded cursor-pointer transition-colors duration-300 group"
              >
                <X className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors duration-300" />
              </button>
            </div>
          </div>
        )}

        {lastResult && !submitting && (
          <div className={`mb-4 p-4 rounded-xl border transition-all duration-300 animate-fadeIn ${
            lastResult.status === 'AC' 
              ? 'bg-secondary/100/10 border-green-500/20 hover:bg-secondary/100/15 hover:border-green-500/30'
              : 'bg-error/100/10 border-red-500/20 hover:bg-error/100/15 hover:border-red-500/30'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {lastResult.status === 'AC' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400 animate-pulse-slow" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
                <span className={`font-medium ${getStatusColor(lastResult.status)}`}>
                  {lastResult.status}
                </span>
                <span className="text-muted-foreground">
                  得分: {lastResult.score}
                </span>
              </div>
              <button 
                onClick={() => setLastResult(null)}
                className="p-1 hover:bg-slate-700 rounded cursor-pointer transition-colors duration-300 group"
              >
                <X className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors duration-300" />
              </button>
            </div>
          </div>
        )}

        <div className="card-static rounded-2xl overflow-hidden shadow-lg shadow-primary/5">
          <div className="flex border-b border-border">
            {[
              { key: 'description', label: '题目描述', icon: BookOpen },
              { key: 'submit', label: '提交代码', icon: CodeIcon },
              { key: 'solutions', label: '题解', icon: MessageSquare },
              { key: 'submissions', label: '提交记录', icon: ListChecks }
            ].map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={`flex items-center gap-2 px-5 py-3.5 font-medium transition-all duration-300 relative cursor-pointer group ${
                    activeTab === tab.key
                      ? 'text-primary-light'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className={`w-4 h-4 transition-transform duration-300 ${activeTab === tab.key ? 'rotate-3' : 'group-hover:rotate-3'}`} />
                  {tab.label}
                  {activeTab === tab.key && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full animate-gradient" />
                  )}
                </button>
              )
            })}
          </div>

          <div className="p-6">
            {activeTab === 'description' && (
              <ProblemDescription problem={problem} />
            )}

            {activeTab === 'submit' && (
              <div className="space-y-4">
                {!user && (
                  <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-accent-light hover:bg-yellow-500/15 hover:border-yellow-500/30 transition-all duration-300">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>请先登录后再提交代码</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <label className="text-sm font-medium text-foreground">选择语言</label>
                  <select
                    value={language}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="input w-auto min-w-[160px] py-2 text-sm hover:border-primary/30 transition-colors duration-300"
                  >
                    {languageOptions.map((lang) => (
                      <option key={lang.value} value={lang.value} className="bg-slate-900 text-slate-100">
                        {lang.label} ({lang.version})
                      </option>
                    ))}
                  </select>
                </div>

                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full h-[400px] rounded-xl bg-slate-900 text-slate-100 font-mono text-sm p-4 border border-border hover:border-primary/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y transition-colors duration-300"
                  spellCheck={false}
                  placeholder="在此粘贴或输入代码..."
                />

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !user}
                    className="btn-primary btn flex-1 cursor-pointer group"
                  >
                    {submitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        评测中...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 transition-transform duration-300 group-hover:rotate-12" />
                        提交代码
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleClearCode}
                    className="btn-ghost btn cursor-pointer group"
                  >
                    <span className="transition-colors duration-300 group-hover:text-primary-light">清空</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'solutions' && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4 hover:bg-muted/70 transition-colors duration-300 group">
                  <MessageSquare className="w-8 h-8 text-muted-foreground transition-transform duration-300 group-hover:scale-110" />
                </div>
                <p className="text-muted-foreground">暂无题解</p>
              </div>
            )}

            {activeTab === 'submissions' && (
              <SubmissionList
                submissions={submissions}
                loading={submissionsLoading}
                error={null}
                user={user}
                fromAssignment={fromAssignment}
                teamId={teamId}
                onSelect={(sub) => setSelectedSubmission(sub)}
              />
            )}
          </div>
        </div>
      </div>

      {selectedSubmission && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn"
          onClick={() => setSelectedSubmission(null)}
        >
          <div 
            className="card-static rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl shadow-primary/10 hover:shadow-primary/20 transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-800/50">
              <h3 className="font-semibold text-foreground">提交详情</h3>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="p-2 rounded-lg hover:bg-muted/50 transition-colors duration-300 group"
              >
                <XCircle className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors duration-300" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div className="glass rounded-xl p-4 hover:border-primary/30 transition-all duration-300">
                  <p className="text-xs text-muted-foreground mb-1">语言</p>
                  <p className="font-semibold text-foreground">{selectedSubmission.language}</p>
                </div>
                <div className="glass rounded-xl p-4 hover:border-primary/30 transition-all duration-300">
                  <p className="text-xs text-muted-foreground mb-1">状态</p>
                  <span className={`font-medium ${getStatusColor(selectedSubmission.status)}`}>
                    {selectedSubmission.status}
                  </span>
                </div>
                <div className="glass rounded-xl p-4 hover:border-primary/30 transition-all duration-300">
                  <p className="text-xs text-muted-foreground mb-1">得分</p>
                  <p className="font-semibold text-foreground">
                    {selectedSubmission.score}
                    {selectedSubmission.passedTests !== undefined && selectedSubmission.totalTests !== undefined && (
                      <span className="text-sm text-muted-foreground ml-1">
                        ({selectedSubmission.passedTests}/{selectedSubmission.totalTests})
                      </span>
                    )}
                  </p>
                </div>
                <div className="glass rounded-xl p-4 hover:border-primary/30 transition-all duration-300">
                  <p className="text-xs text-muted-foreground mb-1">耗时</p>
                  <p className="font-semibold text-foreground">{selectedSubmission.time}ms</p>
                </div>
                <div className="glass rounded-xl p-4 hover:border-primary/30 transition-all duration-300">
                  <p className="text-xs text-muted-foreground mb-1">内存</p>
                  <p className="font-semibold text-foreground">
                    {selectedSubmission.memory > 0 
                      ? `${(selectedSubmission.memory / 1024).toFixed(2)}MB` 
                      : '0MB'}
                  </p>
                </div>
                <div className="glass rounded-xl p-4 hover:border-primary/30 transition-all duration-300">
                  <p className="text-xs text-muted-foreground mb-1">提交时间</p>
                  <p className="font-semibold text-foreground text-sm">
                    {new Date(selectedSubmission.submittedAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>

              {selectedSubmission.code && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <CodeIcon className="w-4 h-4 text-primary-light" />
                    <h4 className="font-semibold text-foreground">代码</h4>
                  </div>
                  <pre className="bg-slate-800 rounded-xl p-4 overflow-x-auto text-sm font-mono text-slate-100 border border-border hover:border-primary/30 transition-all duration-300">
                    <code>{selectedSubmission.code}</code>
                  </pre>
                </div>
              )}

              {selectedSubmission.message && (
                <div>
                  <h4 className="font-semibold text-foreground mb-2">错误信息</h4>
                  <div className="bg-error/10 border border-error/20 rounded-xl p-4 hover:border-error/30 transition-all duration-300">
                    <pre className="text-sm text-error whitespace-pre-wrap">
                      {selectedSubmission.message}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
