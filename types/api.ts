export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedResponse<T> {
  success: boolean
  data: {
    items: T
    pagination: PaginationInfo
  }
}

export interface ProblemWhereInput {
  isPublic?: boolean
  difficulty?: string
  tags?: { has: string }
  problemNumber?: { in: string[] }
  OR?: Array<{
    title?: { contains: string; mode: 'insensitive' }
    problemNumber?: { contains: string; mode: 'insensitive' }
  }>
}

export interface ContestWhereInput {
  isPublic?: boolean
  startTime?: { lte?: Date; gt?: Date }
  endTime?: { gte?: Date; lt?: Date }
  OR?: Array<{
    title?: { contains: string; mode: 'insensitive' }
    description?: { contains: string; mode: 'insensitive' }
  }>
}

export interface SubmissionWhereInput {
  problemId?: string
  userId?: string
  status?: string
  contestId?: string
}

export interface PostWhereInput {
  isDeleted?: boolean
  status?: string
  tags?: { has: string }
  categoryId?: string
  type?: string
  OR?: Array<{
    title?: { contains: string; mode: 'insensitive' }
    content?: { contains: string; mode: 'insensitive' }
  }>
}

export interface NotificationWhereInput {
  userId: string
  isRead?: boolean
}

export interface RankingUser {
  id: string
  username: string
  nickname: string | null
  rating: number
  solvedCount: number
  rank: string
  color: string
  avatar: string | null
  position: number
  solvedProblems: number
}

export interface TestCaseInput {
  input: string
  output: string
  isSample?: boolean
  score?: number
}

export interface CacheEntry<T = unknown> {
  data: T
  timestamp: number
}

export type OrderByInput = 
  | { createdAt: 'desc' | 'asc' }
  | { likes: 'desc' | 'asc' }
  | { views: 'desc' | 'asc' }
  | { rating: 'desc' | 'asc' }
  | { solvedCount: 'desc' | 'asc' }
  | { startTime: 'desc' | 'asc' }
  | { submittedAt: 'desc' | 'asc' }

export type OrderByArray = Array<
  | { isPinned: 'desc' | 'asc' }
  | { createdAt: 'desc' | 'asc' }
  | { likes: 'desc' | 'asc' }
  | { views: 'desc' | 'asc' }
  | { rating: 'desc' | 'asc' }
  | { solvedCount: 'desc' | 'asc' }
>

export interface ContestWithRegistration {
  id: string
  title: string
  description: string
  type: string
  startTime: Date
  endTime: Date
  duration: number
  isPublic: boolean
  password: string | null
  authorId: string
  createdAt: Date
  updatedAt: Date
  author: {
    id: string
    username: string
    nickname: string | null
  }
  _count: {
    participants: number
    problems: number
  }
  isRegistered: boolean
}
