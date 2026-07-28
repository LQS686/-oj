'use client'

import { CheckCircle2, XCircle, Clock, Loader2, AlertCircle, X } from 'lucide-react'
import {
  SubmissionStatus,
  isAcceptedStatus,
  isNonFinalSubmissionStatus,
} from '@/lib/constants/submission-status'
import { formatTime, formatMemory } from '@/lib/utils'

interface TestResult {
 testId?: string
 status: string
 time: number
 memory: number
 message?: string
}

interface JudgeStatusProps {
 submissionId: string
 status: string
 passedTests: number
 totalTests: number
 testResults?: TestResult[]
 onClose?: () => void
}

export default function JudgeStatus({
 submissionId,
 status,
 passedTests,
 totalTests,
 testResults = [],
 onClose,
}: JudgeStatusProps) {
 const progress = totalTests > 0 ? (passedTests / totalTests) * 100 : 0

 const getStatusIcon = (status: string) => {
 switch (status) {
 case SubmissionStatus.ACCEPTED:
 return <CheckCircle2 className="w-5 h-5 text-secondary-light" />
 case SubmissionStatus.WRONG_ANSWER:
 return <XCircle className="w-5 h-5 text-error" />
 case SubmissionStatus.TIME_LIMIT_EXCEEDED:
 return <Clock className="w-5 h-5 text-accent" />
 case SubmissionStatus.MEMORY_LIMIT_EXCEEDED:
 return <AlertCircle className="w-5 h-5 text-purple-400" />
 case SubmissionStatus.RUNTIME_ERROR:
 return <AlertCircle className="w-5 h-5 text-error" />
 case SubmissionStatus.PRESENTATION_ERROR:
 return <AlertCircle className="w-5 h-5 text-accent" />
 case SubmissionStatus.OUTPUT_LIMIT_EXCEEDED:
 return <AlertCircle className="w-5 h-5 text-accent" />
 case SubmissionStatus.CHECKER_SPECIAL_PROBLEM:
 return <AlertCircle className="w-5 h-5 text-error" />
 case SubmissionStatus.PARTLY_CORRECT:
 return <CheckCircle2 className="w-5 h-5 text-primary-light" />
 case SubmissionStatus.PENDING:
 case SubmissionStatus.JUDGING:
 case SubmissionStatus.RUNNING:
 return <Loader2 className="w-5 h-5 text-primary-light animate-spin" />
 default:
 return <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
 }
 }

 const getStatusColor = (status: string) => {
 switch (status) {
 case SubmissionStatus.ACCEPTED:
 return 'bg-secondary/10 border-secondary/30'
 case SubmissionStatus.WRONG_ANSWER:
 return 'bg-error/10 border-error/30'
 case SubmissionStatus.TIME_LIMIT_EXCEEDED:
 return 'bg-accent/10 border-accent/30'
 case SubmissionStatus.MEMORY_LIMIT_EXCEEDED:
 return 'bg-purple-500/10 border-purple-500/30'
 case SubmissionStatus.RUNTIME_ERROR:
 return 'bg-error/10 border-error/30'
 case SubmissionStatus.PRESENTATION_ERROR:
 case SubmissionStatus.OUTPUT_LIMIT_EXCEEDED:
 return 'bg-accent/10 border-accent/30'
 case SubmissionStatus.CHECKER_SPECIAL_PROBLEM:
 return 'bg-error/10 border-error/30'
 case SubmissionStatus.PARTLY_CORRECT:
 return 'bg-primary/10 border-primary/30'
 case SubmissionStatus.PENDING:
 case SubmissionStatus.JUDGING:
 case SubmissionStatus.RUNNING:
 return 'bg-primary/10 border-primary/30'
 default:
 return 'bg-muted border-border'
 }
 }

 const getStatusText = (status: string) => {
 const statusMap: Record<string, string> = {
 AC: '通过',
 WA: '答案错误',
 TLE: '超时',
 MLE: '超内存',
 RE: '运行错误',
 CE: '编译错误',
 PE: '格式错误',
 OLE: '输出超限',
 CSP: '无法启动',
 PC: '部分正确',
 SE: '系统错误',
 JUDGING: '评测中',
 PENDING: '等待评测',
 RUNNING: '运行中',
 }
 return statusMap[status] || status
 }

 const getStatusTextColor = (status: string) => {
 switch (status) {
 case SubmissionStatus.ACCEPTED:
 return 'text-secondary-light'
 case SubmissionStatus.WRONG_ANSWER:
 case SubmissionStatus.RUNTIME_ERROR:
 case SubmissionStatus.CHECKER_SPECIAL_PROBLEM:
 return 'text-error'
 case SubmissionStatus.TIME_LIMIT_EXCEEDED:
 case SubmissionStatus.PRESENTATION_ERROR:
 case SubmissionStatus.OUTPUT_LIMIT_EXCEEDED:
 return 'text-accent'
 case SubmissionStatus.MEMORY_LIMIT_EXCEEDED:
 return 'text-purple-400'
 case SubmissionStatus.PARTLY_CORRECT:
 return 'text-primary-light'
 case SubmissionStatus.PENDING:
 case SubmissionStatus.JUDGING:
 case SubmissionStatus.RUNNING:
 return 'text-primary-light'
 default:
 return 'text-muted-foreground'
 }
 }

 const isJudging = isNonFinalSubmissionStatus(status)

 return (
 <div className="card-static rounded-lg overflow-hidden" role="status" aria-live={isJudging ? "polite" : "assertive"}>
 <div className={`px-6 py-4 border-b ${getStatusColor(status)}`}>
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <span aria-hidden="true">{getStatusIcon(status)}</span>
 <div>
 <div className={`font-bold ${getStatusTextColor(status)}`}>{getStatusText(status)}</div>
 <div className="text-sm text-muted-foreground">
 提交ID: {submissionId.substring(0, 8)}...
 </div>
 </div>
 </div>
 {onClose && !isJudging && (
 <button
 onClick={onClose}
 onKeyDown={(e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 onClose();
 }
 }}
 className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
 aria-label="关闭"
 >
 <X className="w-5 h-5" />
 </button>
 )}
 </div>
 </div>

 <div className="px-6 py-4">
 <div className="flex items-center justify-between text-sm mb-3">
 <span className="text-muted-foreground">评测进度</span>
 <span className="font-semibold text-foreground">
 {passedTests} / {totalTests} 通过
 </span>
 </div>
 
 <div className="relative w-full h-2.5 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`评测进度: ${Math.round(progress)}%`}>
 <div
 className={`absolute top-0 left-0 h-full transition-all duration-500 ease-out rounded-full ${
            isAcceptedStatus(status)
              ? 'bg-secondary'
              : isNonFinalSubmissionStatus(status)
                ? 'bg-primary'
                : passedTests > 0
                  ? 'bg-accent'
                  : 'bg-error'
          }`}
 style={{ width: `${progress}%` }}
 ></div>
 
 {isJudging && (
 <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" aria-hidden="true"></div>
 )}
 </div>
 </div>

 {testResults.length > 0 && (
 <div className="px-6 pb-4">
 <div className="text-sm font-semibold text-foreground mb-3">测试点详情</div>
 <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
 {testResults.map((result, index) => (
 <div
 key={result.testId}
 className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
 isAcceptedStatus(result.status)
 ? 'bg-secondary/5 border-secondary/20'
 : isNonFinalSubmissionStatus(result.status)
 ? 'bg-muted border-border'
 : 'bg-error/5 border-error/20'
 }`}
 role="listitem"
 aria-label={`测试点 ${index + 1}: ${getStatusText(result.status)}`}
 >
 <div className="flex items-center gap-3">
 <span aria-hidden="true">{getStatusIcon(result.status)}</span>
 <div>
 <div className="text-sm font-medium text-foreground">测试点 #{index + 1}</div>
 {result.message && (
 <div className="text-xs text-muted-foreground mt-0.5">{result.message}</div>
 )}
 </div>
 </div>
 <div className="text-right text-xs text-muted-foreground">
 <div>{formatTime(result.time)}</div>
 <div>{formatMemory(result.memory)}</div>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {isJudging && testResults.length === 0 && (
 <div className="px-6 pb-6 text-center" aria-busy="true">
 <div className="relative w-12 h-12 mx-auto mb-3">
 <div className="absolute inset-0 rounded-full border-2 border-primary/20"></div>
 <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
 </div>
 <p className="text-sm text-muted-foreground">正在评测中，请稍候...</p>
 </div>
 )}
 </div>
 )
}
