'use client'

import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { fetchWithAuth } from '@/lib/api/base'
import { logger } from '@/lib/logger'
import { ArrowLeft, Filter, Code, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import type { Assignment } from '@/types/models'

interface Submission {
  id: string
  problem: {
    id: string
    title: string
    problemNumber?: string
  }
  userId: string
  user: {
    id: string
    username: string
    nickname?: string
  }
  language: string
  code: string
  status: string
  score: number
  time: number
  memory: number
  passedTests?: number
  totalTests?: number
  message?: string
  submittedAt: string
  isLate: boolean
}

export default function AssignmentSubmissionsPage({ params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  const { id: classId, assignmentId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useUser()

  const userIdParam = searchParams.get('userId')
  const problemIdParam = searchParams.get('problemId')
  const statusParam = searchParams.get('status')

  const isFromLeaderboard = !!(userIdParam && problemIdParam)

  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [targetUser, setTargetUser] = useState<{ username: string; nickname?: string } | null>(null)
  const [targetProblem, setTargetProblem] = useState<{ title: string; problemNumber?: string } | null>(null)

  const [filterUserId, setFilterUserId] = useState(userIdParam || '')
  const [filterProblemId, setFilterProblemId] = useState(problemIdParam || '')
  const [filterStatus, setFilterStatus] = useState(statusParam || '')

  useEffect(() => {
    const fetchAssignment = async () => {
      try {
        const response = await fetchWithAuth(`/api/classes/${classId}/assignments/${assignmentId}`)
        const data = await response.json()
        if (data.success) {
          setAssignment(data.data)
        }
      } catch (error) {
        logger.error('获取作业信息失败', error)
      }
    }
    fetchAssignment()
  }, [classId, assignmentId])

  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        setLoading(true)
        
        const params = new URLSearchParams()
        if (filterUserId) params.append('userId', filterUserId)
        if (filterProblemId) params.append('problemId', filterProblemId)
        if (filterStatus) params.append('status', filterStatus)
        params.append('page', '1')
        params.append('pageSize', '50')
        
        const response = await fetchWithAuth(
          `/api/classes/${classId}/assignments/${assignmentId}/submissions?${params}`
        )
        const data = await response.json()
        
        if (data.success) {
          const submissionsList = data.data.submissions || []
          setSubmissions(submissionsList)
          
          if (isFromLeaderboard && submissionsList.length > 0) {
            const firstSubmission = submissionsList[0]
            setTargetUser({
              username: firstSubmission.user.username,
              nickname: firstSubmission.user.nickname
            })
            setTargetProblem({
              title: firstSubmission.problem.title,
              problemNumber: firstSubmission.problem.problemNumber
            })
          }
        }
      } catch (error) {
        logger.error('获取提交记录失败', error)
      } finally {
        setLoading(false)
      }
    }
    
    fetchSubmissions()
  }, [classId, assignmentId, filterUserId, filterProblemId, filterStatus, isFromLeaderboard])

  const getStatusInfo = (status: string, score: number) => {
    switch (status) {
      case 'AC':
        return {
          icon: <CheckCircle className="w-5 h-5" />,
          color: 'text-green-400',
          bg: 'bg-secondary/100/20',
          label: 'AC'
        }
      case 'WA':
        return {
          icon: <XCircle className="w-5 h-5" />,
          color: 'text-red-400',
          bg: 'bg-error/100/20',
          label: 'WA'
        }
      case 'TLE':
        return {
          icon: <Clock className="w-5 h-5" />,
          color: 'text-accent-light',
          bg: 'bg-yellow-500/20',
          label: 'TLE'
        }
      case 'MLE':
        return {
          icon: <AlertCircle className="w-5 h-5" />,
          color: 'text-orange-400',
          bg: 'bg-orange-500/20',
          label: 'MLE'
        }
      case 'RE':
        return {
          icon: <XCircle className="w-5 h-5" />,
          color: 'text-purple-400',
          bg: 'bg-purple-500/20',
          label: 'RE'
        }
      default:
        if (score > 0 && score < 100) {
          return {
            icon: <AlertCircle className="w-5 h-5" />,
            color: 'text-accent-light',
            bg: 'bg-yellow-500/20',
            label: `${score}分`
          }
        }
        return {
          icon: <XCircle className="w-5 h-5" />,
          color: 'text-gray-400',
          bg: 'bg-gray-500/20',
          label: status
        }
    }
  }

  const viewCode = (submission: Submission) => {
    setSelectedSubmission(submission)
    setShowCodeModal(true)
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <button
          onClick={() => {
            const returnTab = isFromLeaderboard ? 'leaderboard' : 'info'
            router.push(`/classes/${classId}/assignments/${assignmentId}?tab=${returnTab}`)
          }}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回作业详情
        </button>

        <div className="card p-6 mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            {isFromLeaderboard && targetUser && targetProblem ? (
              `${assignment?.title} - ${targetProblem.title}(${targetProblem.problemNumber}) - ${targetUser.nickname || targetUser.username}的提交记录`
            ) : (
              `${assignment?.title} - 提交记录`
            )}
          </h1>
          <p className="text-gray-400">
            {isFromLeaderboard && targetUser ? (
              `查看 ${targetUser.nickname || targetUser.username} 在 ${targetProblem?.title} 题目上的所有提交`
            ) : (
              '查看作业相关的所有提交记录'
            )}
          </p>
        </div>

        {!isFromLeaderboard && (
          <div className="card p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-white">筛选条件</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  用户ID
                </label>
                <input
                  type="text"
                  value={filterUserId}
                  onChange={(e) => setFilterUserId(e.target.value)}
                  placeholder="输入用户ID筛选"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  题目ID
                </label>
                <input
                  type="text"
                  value={filterProblemId}
                  onChange={(e) => setFilterProblemId(e.target.value)}
                  placeholder="输入题目ID筛选"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  状态
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="input w-full"
                >
                  <option value="">全部状态</option>
                  <option value="AC">AC (通过)</option>
                  <option value="WA">WA (答案错误)</option>
                  <option value="TLE">TLE (超时)</option>
                  <option value="MLE">MLE (内存超限)</option>
                  <option value="RE">RE (运行错误)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="card overflow-hidden">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
              <p className="text-gray-400">加载中...</p>
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              暂无提交记录
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      提交时间
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      用户
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      题目
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      语言
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      得分
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      时间/内存
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {submissions.map((submission) => {
                    const statusInfo = getStatusInfo(submission.status, submission.score)
                    return (
                      <tr key={submission.id} className="hover:bg-white/5">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {new Date(submission.submittedAt).toLocaleString('zh-CN')}
                          {submission.isLate && (
                            <span className="ml-2 text-xs text-red-400">(逾期)</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {submission.user.nickname || submission.user.username}
                        </td>
                        <td className="px-6 py-4 text-sm text-white">
                          <div>
                            <div className="font-medium">{submission.problem.title}</div>
                            {submission.problem.problemNumber && (
                              <div className="text-xs text-gray-500">
                                {submission.problem.problemNumber}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {submission.language}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`flex items-center gap-2 ${statusInfo.color}`}>
                            {statusInfo.icon}
                            <span className="font-medium">{statusInfo.label}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded text-sm font-medium ${
                            submission.score === 100
                              ? 'bg-secondary/100/20 text-green-400'
                              : submission.score > 0
                              ? 'bg-yellow-500/20 text-accent-light'
                              : 'bg-white/10 text-gray-400'
                          }`}>
                            {submission.score}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          <div>{submission.time}ms</div>
                          <div className="text-xs text-gray-500">{submission.memory}KB</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => viewCode(submission)}
                            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium"
                          >
                            <Code className="w-4 h-4" />
                            查看代码
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCodeModal && selectedSubmission && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="card max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">提交代码</h3>
                <button
                  onClick={() => setShowCodeModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              <div className="mt-2 text-sm text-gray-400">
                <div>题目：{selectedSubmission.problem.title}</div>
                <div>用户：{selectedSubmission.user.nickname || selectedSubmission.user.username}</div>
                <div>语言：{selectedSubmission.language}</div>
                <div>状态：{getStatusInfo(selectedSubmission.status, selectedSubmission.score).label}</div>
                <div>得分：{selectedSubmission.score} / 100</div>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <pre className="bg-white/5 p-4 rounded-lg overflow-x-auto">
                <code className="text-sm text-gray-300">{selectedSubmission.code}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
