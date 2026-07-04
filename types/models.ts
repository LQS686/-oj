export interface User {
  id: string
  username: string
  nickname: string | null
  email: string
  bio: string | null
  avatar: string | null
  color: string | null
  rating: number
  rank: string | null
  role: string
  solvedCount: number
  acceptedSubmissions: number
  isBanned: boolean
  createdAt: string
  updatedAt: string
  _count?: {
    submissions: number
    comments: number
  }
}

export interface Problem {
  id: string
  problemNumber: string | null
  title: string
  description: string
  input: string
  output: string
  inputFormat: string | null
  outputFormat: string | null
  samples: Array<{ input: string; output: string }>
  hint: string | null
  hints: string | null
  source: string | null
  difficulty: string
  tags: string[]
  timeLimit: number
  memoryLimit: number
  visibility: string
  isPublic: boolean
  totalSubmit: number
  totalAccepted: number
  authorId: string
  classId: string | null
  isAiGenerated: boolean
  aiStatus: string
  createdAt: string
  updatedAt: string
  author?: {
    id: string
    username: string
    nickname: string | null
  }
  _count?: {
    submissions: number
  }
}

export interface Submission {
  id: string
  problemId: string
  userId: string
  contestId: string | null
  assignmentId: string | null
  assignmentSubmissionId: string | null
  language: string
  code: string
  status: string
  score: number
  time: number
  memory: number
  passedTests: number
  totalTests: number
  message: string | null
  testResults: Array<{
    testId: string
    status: string
    time: number
    memory: number
    message?: string
  }> | null
  submittedAt: string
  isLate: boolean
  problem?: {
    id: string
    title: string
    problemNumber?: string
  }
  user?: {
    id: string
    username: string
    nickname?: string
  }
}

export interface Contest {
  id: string
  title: string
  description: string
  type: string
  startTime: string
  endTime: string
  duration: number
  isPublic: boolean
  password: string | null
  authorId: string
  createdAt: string
  updatedAt: string
  author?: {
    id: string
    username: string
    nickname: string | null
  }
  problems?: ContestProblem[]
  _count?: {
    participants: number
    problems: number
  }
}

export interface ContestProblem {
  id: string
  problemId: string
  problemNumber: string | null
  title: string
  difficulty: string
  visibility: string
  isPublic: boolean
}

export interface Comment {
  id: string
  content: string
  solutionId: string | null
  authorId: string
  parentId: string | null
  likes: number
  isDeleted: boolean
  createdAt: string
  updatedAt: string
  author: {
    id: string
    username: string
    nickname: string
    rating: number
    color: string
    avatar?: string
  }
}

export interface Class {
  id: string
  name: string
  description: string | null
  avatar: string | null
  ownerId: string
  createdAt: string
  updatedAt: string
  owner?: {
    id: string
    username: string
    nickname: string | null
  }
  _count?: {
    members: number
    assignments: number
  }
}

export interface ClassMember {
  id: string
  classId: string
  userId: string
  role: 'owner' | 'assistant' | 'student'
  permissions: ClassPermissions
  joinedAt: string
  username?: string
  nickname?: string
  color?: string
  avatar?: string
}

export interface ClassPermissions {
  canViewProblems: boolean
  canSubmit: boolean
  canViewNotes: boolean
  canCreateNotes: boolean
  canManageAssignments: boolean
  canInviteMembers: boolean
  canManageMembers?: boolean
  canViewStats?: boolean
}

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  content: string
  link: string | null
  isRead: boolean
  createdAt: string
}

export interface ActivityData {
  date: string
  count: number
}

export interface RecentSubmission {
  id: string
  problemId: string
  realProblemId: string
  problemTitle: string
  status: string
  language: string
  time: string
}

export interface DifficultyDistribution {
  difficulty: string
  count: number
}

export interface ActiveUser {
  id: string
  username: string
  nickname: string | null
  color: string | null
  avatar: string | null
  _count?: {
    posts: number
    comments: number
  }
}

export interface Assignment {
  id: string
  classId: string
  title: string
  description: string | null
  problemIds: string[]
  startTime: string | null
  endTime: string | null
  createdBy: string
  deadline: string | null
  createdAt: string
  updatedAt: string
  problems?: Array<{
    id: string
    problemNumber: string
    title: string
    difficulty: string
    tags: string[]
  }>
}

export interface JudgeStatusData {
  submissionId: string
  status: string
  passedTests: number
  totalTests: number
  testResults: Array<{
    testId: string
    status: string
    time: number
    memory: number
    message?: string
  }>
}

export interface Category {
  id: string
  name: string
  slug: string
  description?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}
