import { isFinalSubmissionStatus } from '@/lib/constants/submission-status'

/** 单测试点结果（公开详情页与管理后台共用的响应形状） */
export interface SubmissionTestResult {
  testId: string
  status: string
  time: number
  memory: number
  message?: string
}

/** 提交详情响应（公开页与后台页共用） */
export interface SubmissionDetailData {
  id: string
  problem: {
    id: string
    problemNumber?: string
    title: string
    difficulty: string
  }
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
  passedTests: number
  totalTests: number
  message?: string
  testResults?: SubmissionTestResult[]
  submittedAt: string
}

/** 轮询合并时判断提交是否已进入终态 */
export function isFinalStatus(status: string | undefined | null): boolean {
  return status ? isFinalSubmissionStatus(status) : false
}
