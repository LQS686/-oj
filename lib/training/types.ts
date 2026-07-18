/**
 * lib/training/types.ts
 * 题单（Training）相关类型定义
 */

/** 训练难度 */
export type TrainingDifficulty = '入门' | '普及' | '提高' | '省选' | 'NOI'

/** 训练状态 */
export type TrainingStatus = 'draft' | 'published' | 'archived'

/** 训练分类（仅后台可选） */
export type TrainingCategoryType = 'official' | 'contest'

/** 题目在题单中的状态 */
export type TrainingProblemStatus = 'NOT_STARTED' | 'ATTEMPTED' | 'AC' | 'WRONG'

/** 题单列表项（用于列表页） */
export interface TrainingListItem {
  id: string
  title: string
  description: string
  difficulty: string | null
  categoryType: TrainingCategoryType | null
  isPublic: boolean
  status: string
  isRecommended: boolean
  tags: string[]
  cover: string | null
  joinCount: number
  viewCount: number
  problemCount: number
  createdAt: string | Date
  updatedAt: string | Date
  author?: {
    id: string
    username: string
    nickname: string | null
    avatar: string | null
  } | null
  category?: {
    id: string
    name: string
  } | null
  userProgress?: {
    solvedCount: number
    attemptedCount: number
    progressPercentage: number
    isJoined: boolean
  }
}

/** 分页响应（统一格式） */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 列表查询参数 */
export interface TrainingListQuery {
  page?: number
  pageSize?: number
  keyword?: string
  difficulty?: string
  categoryId?: string
  status?: string
  authorId?: string
}

/** 题单创建参数 */
export interface TrainingCreateInput {
  title: string
  description: string
  difficulty?: string | null
  categoryType?: TrainingCategoryType | null
  isPublic?: boolean
  status?: string
  isRecommended?: boolean
  authorId?: string
  categoryId?: string
  tags?: string[]
  cover?: string
  problemIds?: string[]
  /** 班级私有题单：所属班级 ID（不为空时仅班级成员可见，公开列表不显示） */
  classId?: string
}

/** 题单更新参数 */
export interface TrainingUpdateInput {
  title?: string
  description?: string
  difficulty?: string | null
  categoryType?: TrainingCategoryType | null
  isPublic?: boolean
  status?: string
  isRecommended?: boolean
  categoryId?: string
  tags?: string[]
  cover?: string
}

/** 题单中题目项 */
export interface TrainingProblemItem {
  id: string
  problemId: string
  orderIndex: number
  score: number
  required: boolean
  problem: {
    id: string
    title: string
    difficulty: string
    tags: string[]
    totalSubmit: number
    totalAccepted: number
  }
  // 用户态字段（仅详情页）
  status?: TrainingProblemStatus
  submittedAt?: string | Date | null
  lastSubmissionStatus?: string | null
}

/** 题单详情 */
export interface TrainingDetail {
  id: string
  title: string
  description: string
  difficulty: string | null
  categoryType: TrainingCategoryType | null
  isPublic: boolean
  status: string
  isRecommended: boolean
  tags: string[]
  cover: string | null
  joinCount: number
  viewCount: number
  createdAt: string | Date
  updatedAt: string | Date
  author: {
    id: string
    username: string
    nickname: string | null
    avatar: string | null
  } | null
  category: {
    id: string
    name: string
  } | null
  problems: TrainingProblemItem[]
  isJoined: boolean
  userProgress: {
    totalProblems: number
    solvedCount: number
    attemptedCount: number
    progressPercentage: number
  }
}

/** 用户进度详情 */
export interface UserTrainingProgress {
  training: { id: string; title: string }
  progress: {
    totalProblems: number
    solvedCount: number
    attemptedCount: number
    progressPercentage: number
  }
  problemProgress: Array<{
    problemId: string
    status: string
    submittedAt: string | Date | null
  }>
  recentSubmissions: Array<{
    id: string
    problemId: string
    status: string
    language: string
    submittedAt: string | Date
  }>
}

/** 题单分类 */
export interface TrainingCategory {
  id: string
  name: string
  description: string | null
  orderIndex: number
  createdAt: string | Date
  _count?: { trainings: number }
}

/** 题单操作（problems 路由） */
export type TrainingProblemAction = 'add' | 'remove' | 'reorder' | 'update'

export interface TrainingProblemPatchInput {
  action: TrainingProblemAction
  // add
  problems?: Array<{
    problemId: string
    orderIndex?: number
    score?: number
    required?: boolean
  }>
  // remove
  problemIds?: string[]
  // reorder
  orderMap?: Array<{ problemId: string; orderIndex: number }>
  // update
  updates?: Array<{
    problemId: string
    score?: number
    required?: boolean
    orderIndex?: number
  }>
}
