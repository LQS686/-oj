/**
 * lib/user/service.ts
 * 用户资料、偏好、头像、统计
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { getMongoClient } from '@/lib/mongodb-direct'
import { clearRankingCache } from '@/lib/ranking/service'
import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import {
  validateEmail,
  validateUsername,
  validatePassword,
} from '@/lib/validation'
import { escapeHtml } from '@/lib/sanitize'

export interface UserProfile {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
  bio: string | null
  email: string | null
  role: string
  isBanned: boolean
  createdAt: Date
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  return cache.get('user:profile', [userId], async () => {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        bio: true,
        email: true,
        role: true,
        isBanned: true,
        createdAt: true,
      },
    }) as Promise<UserProfile | null>
  }, { ttl: 60_000 })
}

export async function getUserStats(userId: string) {
  return cache.get('user:stats', [userId], async () => {
    const [solved, submissions, contests] = await Promise.all([
      prisma.submission.count({ where: { userId, status: 'ACCEPTED' } }),
      prisma.submission.count({ where: { userId } }),
      prisma.contestParticipant.count({ where: { userId } }),
    ])
    return { solved, submissions, contests }
  }, { ttl: 30_000 })
}

export async function getUserPreferences(_userId: string) {
  // 偏好数据由 UserAiPreference 表承载，统一在 AI 业务层处理
  return null
}

export async function updateUserPreferences(_userId: string, data: any) {
  // 偏好更新由 AI 业务层处理
  return data
}

export async function updateUserProfile(userId: string, data: Partial<{
  nickname: string
  bio: string
  avatar: string
}>): Promise<{ id: string; nickname: string | null; bio: string | null; avatar: string | null }> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, nickname: true, bio: true, avatar: true },
  })
  clearUserCache(userId)
  return updated
}

export async function getActiveUsers(limit = 20) {
  return prisma.user.findMany({
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: { id: true, username: true, nickname: true, avatar: true, updatedAt: true },
  })
}

export async function clearUserCache(userId: string) {
  cache.delete(`user:profile:${userId}`)
  cache.delete(`user:stats:${userId}`)
  cache.delete(`auth:user:${userId}`)
  // 任何用户变更（role / isBanned / rating / solvedCount / 删除）都会影响榜单
  clearRankingCache()
}

/* ============================================================================
 * 业务封装：原 /api/users/* 路由中的复杂逻辑
 * ========================================================================== */

/**
 * 获取用户公开资料（含发帖/评论/题目/AC 提交数）
 */
export async function getUserPublicInfo(userId: string) {
  const [user, acceptedSubmissionsCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        bio: true,
        rating: true,
        rank: true,
        color: true,
        createdAt: true,
        _count: {
          select: {
            submissions: true,
            problems: { where: { isPublic: true } },
            solutions: true,
            comments: { where: { isDeleted: false } },
          },
        },
      },
    }),
    prisma.submission.count({ where: { userId, status: 'AC' } }),
  ])
  if (!user) return null
  return { ...user, acceptedSubmissions: acceptedSubmissionsCount }
}

/**
 * 获取用户统计（提交/题目/语言/热力图/社区/竞赛/难度分布）
 */
export async function getUserFullStats(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      nickname: true,
      avatar: true,
      rating: true,
      rank: true,
      color: true,
      bio: true,
      createdAt: true,
    },
  })
  if (!user) return null

  const submissions = await prisma.submission.findMany({
    where: { userId },
    select: {
      id: true,
      status: true,
      language: true,
      problemId: true,
      submittedAt: true,
      problem: {
        select: { title: true, difficulty: true, problemNumber: true },
      },
    },
    orderBy: { submittedAt: 'desc' },
  })

  type SubmissionData = (typeof submissions)[number]

  // 最近10条提交
  const recentSubmissions = submissions.slice(0, 10).map((sub: any) => ({
    id: sub.id,
    problemId: sub.problem?.problemNumber || sub.problemId,
    realProblemId: sub.problemId,
    problemTitle: sub.problem?.title || '未知题目',
    status: sub.status,
    language: sub.language,
    time: new Date(sub.submittedAt).toLocaleString('zh-CN'),
    submittedAt: sub.submittedAt,
  }))

  // AC 提交
  const acSubmissions = submissions.filter(
    (sub: any) => sub.status === 'AC' || sub.status === 'Accepted'
  )

  // 难度分布（AC 唯一题）
  const solvedProblemsMap = new Map<string, string | null>()
  acSubmissions.forEach((sub: any) => {
    if (sub.problem && !solvedProblemsMap.has(sub.problemId)) {
      solvedProblemsMap.set(sub.problemId, sub.problem.difficulty)
    }
  })
  const difficultyCount: Record<string, number> = {}
  solvedProblemsMap.forEach((difficulty) => {
    if (difficulty) {
      difficultyCount[difficulty] = (difficultyCount[difficulty] || 0) + 1
    }
  })
  const difficultyDistribution = Object.entries(difficultyCount)
    .map(([difficulty, count]: [string, number]) => ({ difficulty, count }))
    .sort((a: any, b: any) => b.count - a.count)

  // 各状态提交数
  const statusCount: Record<string, number> = submissions.reduce(
    (acc: Record<string, number>, sub: SubmissionData) => {
      acc[sub.status] = (acc[sub.status] || 0) + 1
      return acc
    },
    {}
  )

  // AC 题目去重
  const acProblems = new Set(
    submissions
      .filter((sub: SubmissionData) => sub.status === 'AC' || sub.status === 'Accepted')
      .map((sub: SubmissionData) => sub.problemId)
  )

  // 语言统计
  const languageCount: Record<string, number> = submissions.reduce(
    (acc: Record<string, number>, sub: SubmissionData) => {
      acc[sub.language] = (acc[sub.language] || 0) + 1
      return acc
    },
    {}
  )

  // 最近 7 天 / 365 天热力图
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  // 唯一 AC 集合（按时间倒序遍历，第一次出现即保留）
  const uniqueAcSubmissionsMap = new Map<string, SubmissionData>()
  for (const sub of acSubmissions) {
    if (!uniqueAcSubmissionsMap.has(sub.problemId)) {
      uniqueAcSubmissionsMap.set(sub.problemId, sub)
    }
  }
  const uniqueAcSubmissions = Array.from(uniqueAcSubmissionsMap.values())

  const buildHeatmap = (subs: SubmissionData[]) =>
    subs.reduce((acc: Record<string, number>, sub: SubmissionData) => {
      const date = new Date(sub.submittedAt).toISOString().split('T')[0]
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {})

  const lastWeekSubmissions = uniqueAcSubmissions.filter(
    (sub: SubmissionData) => new Date(sub.submittedAt) >= sevenDaysAgo
  )
  const yearSubmissions = uniqueAcSubmissions.filter(
    (sub: SubmissionData) => new Date(sub.submittedAt) >= oneYearAgo
  )
  const heatmapData = buildHeatmap(lastWeekSubmissions)
  const yearHeatmap = buildHeatmap(yearSubmissions)

  const [createdProblems, solutionsCount, commentsCount, contestsCount] = await Promise.all([
    prisma.problem.count({ where: { authorId: userId } }),
    prisma.solution.count({ where: { authorId: userId } }),
    prisma.comment.count({ where: { authorId: userId } }),
    prisma.contestParticipant.count({ where: { userId } }),
  ])

  return {
    user,
    submissions: {
      total: submissions.length,
      accepted: statusCount['AC'] || statusCount['Accepted'] || 0,
      wrongAnswer: statusCount['WA'] || statusCount['Wrong Answer'] || 0,
      timeLimitExceeded: statusCount['TLE'] || statusCount['Time Limit Exceeded'] || 0,
      memoryLimitExceeded: statusCount['MLE'] || statusCount['Memory Limit Exceeded'] || 0,
      runtimeError: statusCount['RE'] || statusCount['Runtime Error'] || 0,
      compileError: statusCount['CE'] || statusCount['Compile Error'] || 0,
      pending: statusCount['Pending'] || 0,
      statusCount,
    },
    problems: {
      solved: acProblems.size,
      attempted: new Set(submissions.map((s: SubmissionData) => s.problemId)).size,
      created: createdProblems,
    },
    languages: languageCount,
    community: { solutions: solutionsCount, comments: commentsCount },
    contests: { participated: contestsCount },
    activity: {
      lastWeek: heatmapData,
      lastYear: yearHeatmap,
      totalDays: Object.keys(yearHeatmap).length,
    },
    recentSubmissions,
    difficultyDistribution,
  }
}

/**
 * 获取当前登录用户的完整资料
 */
export async function getCurrentUserProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      nickname: true,
      avatar: true,
      bio: true,
      rating: true,
      rank: true,
      color: true,
      role: true,
      isBanned: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          submissions: true,
          problems: true,
          solutions: true,
          comments: true,
        },
      },
    },
  })
}

/**
 * 校验并更新当前用户昵称/简介/头像
 */
export async function updateCurrentUserBasic(
  userId: string,
  data: { nickname?: string; bio?: string; avatar?: string }
) {
  if (data.nickname !== undefined && (data.nickname.length < 1 || data.nickname.length > 50)) {
    const err: any = new Error('昵称长度应在1-50个字符之间')
    err.status = 400
    throw err
  }
  if (data.bio !== undefined && data.bio.length > 500) {
    const err: any = new Error('个人简介不能超过500个字符')
    err.status = 400
    throw err
  }

  const client = await getMongoClient()
  const db = client.db()
  await db.collection('User').updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        ...(data.nickname !== undefined && { nickname: data.nickname }),
        ...(data.bio !== undefined && { bio: data.bio }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
        updatedAt: new Date(),
      },
    }
  )

  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      nickname: true,
      avatar: true,
      bio: true,
      rating: true,
      rank: true,
      color: true,
      role: true,
      updatedAt: true,
    },
  }).then((result: any) => {
    if (result) clearUserCache(userId)
    return result
  })
}

/**
 * 验证 + 修改当前用户密码
 */
export async function changeCurrentUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  bcryptModule: typeof import('bcryptjs')
) {
  if (!currentPassword || !newPassword) {
    const err: any = new Error('请提供当前密码和新密码')
    err.status = 400
    throw err
  }
  if (newPassword.length < 8) {
    const err: any = new Error('新密码长度至少为8位')
    err.status = 400
    throw err
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  })
  if (!userRecord) {
    const err: any = new Error('用户不存在')
    err.status = 404
    throw err
  }
  const isPasswordValid = await bcryptModule.compare(currentPassword, userRecord.password)
  if (!isPasswordValid) {
    const err: any = new Error('当前密码错误')
    err.status = 401
    throw err
  }
  const hashedPassword = await bcryptModule.hash(newPassword, 10)
  const client = await getMongoClient()
  const db = client.db()
  // 修改密码时递增 tokenVersion，使所有旧 Token 失效（强制重新登录）
  await db.collection('User').updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: { password: hashedPassword, updatedAt: new Date() },
      $inc: { tokenVersion: 1 },
    }
  )
  clearUserCache(userId)
}

/**
 * 读取用户偏好（UserPreferences 集合）
 */
export async function getUserPreferencesCollection(userId: string) {
  const client = await getMongoClient()
  const db = client.db()
  const doc = await db.collection('UserPreferences').findOne({ userId })
  return (doc?.preferences as Record<string, any>) || {}
}

/**
 * 偏好白名单 + 字段校验
 */
const ALLOWED_PREFERENCE_KEYS = [
  'theme', 'language', 'fontSize', 'editorTheme', 'autoSave',
  'tabSize', 'keyboardShortcuts', 'notifications', 'preferredLanguage', 'defaultTab',
]
const ALLOWED_THEMES = ['light', 'dark', 'system']
const ALLOWED_LANGUAGES = ['zh-CN', 'en-US']
const ALLOWED_FONT_SIZES = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24]
const ALLOWED_EDITOR_THEMES = ['vs-dark', 'vs-light', 'hc-black']
const ALLOWED_TAB_SIZES = [2, 4, 8]

function validatePreferenceValue(key: string, value: any): boolean {
  switch (key) {
    case 'theme':
      return typeof value === 'string' && ALLOWED_THEMES.includes(value)
    case 'language':
    case 'preferredLanguage':
      return typeof value === 'string' && ALLOWED_LANGUAGES.includes(value)
    case 'fontSize':
      return typeof value === 'number' && ALLOWED_FONT_SIZES.includes(value)
    case 'editorTheme':
      return typeof value === 'string' && ALLOWED_EDITOR_THEMES.includes(value)
    case 'autoSave':
      return typeof value === 'boolean'
    case 'tabSize':
      return typeof value === 'number' && ALLOWED_TAB_SIZES.includes(value)
    case 'keyboardShortcuts':
      return typeof value === 'object' && value !== null
    case 'notifications':
      return typeof value === 'object' && value !== null
    case 'defaultTab':
      return typeof value === 'string' && value.length <= 50
    default:
      return false
  }
}

/**
 * 合并并更新用户偏好
 */
export async function updateUserPreferencesCollection(userId: string, body: any) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    const err: any = new Error('无效的偏好设置数据')
    err.status = 400
    throw err
  }
  const client = await getMongoClient()
  const db = client.db()
  const existing = await db.collection('UserPreferences').findOne({ userId })
  const existingPrefs: Record<string, any> = (existing?.preferences as Record<string, any>) || {}
  const updatedPrefs: Record<string, any> = { ...existingPrefs }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_PREFERENCE_KEYS.includes(key)) continue
    if (!validatePreferenceValue(key, body[key])) {
      const err: any = new Error(`无效的偏好设置值: ${key}`)
      err.status = 400
      throw err
    }
    updatedPrefs[key] = body[key]
  }
  await db.collection('UserPreferences').updateOne(
    { userId },
    { $set: { preferences: updatedPrefs, updatedAt: new Date() } },
    { upsert: true }
  )
  return updatedPrefs
}

/**
 * 头像上传校验 + 写入
 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024

export async function uploadUserAvatar(
  userId: string,
  file: File,
  writeFile: (path: string, data: Buffer) => Promise<void>,
  uploadDir: string,
  cryptoModule: typeof import('crypto'),
  pathModule: typeof import('path')
) {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    const err: any = new Error('仅支持 JPG、PNG、GIF、WebP 格式的图片')
    err.status = 400
    throw err
  }
  if (file.size > MAX_FILE_SIZE) {
    const err: any = new Error('文件大小不能超过 5MB')
    err.status = 400
    throw err
  }
  const ext = pathModule.extname(file.name).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const err: any = new Error('不支持的文件格式')
    err.status = 400
    throw err
  }
  const safeFilename = cryptoModule.randomUUID() + ext
  const filePath = pathModule.join(uploadDir, safeFilename)
  const resolvedPath = pathModule.resolve(filePath)
  if (!resolvedPath.startsWith(pathModule.resolve(uploadDir))) {
    const err: any = new Error('非法的文件路径')
    err.status = 400
    throw err
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  // 魔数校验
  const magic = (ext: string) => {
    if (ext === '.png') return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
    if (ext === '.jpg' || ext === '.jpeg') return buffer[0] === 0xFF && buffer[1] === 0xD8
    if (ext === '.gif') return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46
    if (ext === '.webp') return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
    return false
  }
  if (!magic(ext)) {
    const err: any = new Error('文件内容与声明格式不匹配')
    err.status = 400
    throw err
  }
  await writeFile(filePath, buffer)
  const avatarUrl = `/uploads/avatars/${safeFilename}`
  await prisma.user.update({ where: { id: userId }, data: { avatar: avatarUrl } })
  clearUserCache(userId)
  return avatarUrl
}

/**
 * 活跃用户列表（题解权重 3 + 评论权重 1 + 近期提交）
 */
export async function listActiveUsers(limit = 5) {
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const [solutionCounts, commentCounts, recentSubmitters] = await Promise.all([
    prisma.solution.groupBy({
      by: ['authorId'],
      _count: { id: true },
    }),
    prisma.comment.groupBy({
      by: ['authorId'],
      _count: { id: true },
      where: { isDeleted: false },
    }),
    prisma.submission.groupBy({
      by: ['userId'],
      _count: { id: true },
      where: { submittedAt: { gte: since } },
    }),
  ])
  const userScores = new Map<string, number>()
  solutionCounts.forEach((item: any) => {
    userScores.set(item.authorId, (userScores.get(item.authorId) || 0) + item._count.id * 3)
  })
  commentCounts.forEach((item: any) => {
    userScores.set(item.authorId, (userScores.get(item.authorId) || 0) + item._count.id)
  })
  recentSubmitters.forEach((item: any) => {
    userScores.set(item.userId, (userScores.get(item.userId) || 0) + item._count.id)
  })
  const sortedUserIds = Array.from(userScores.entries())
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, limit)
    .map((entry: any) => entry[0])
  if (sortedUserIds.length === 0) {
    return prisma.user.findMany({
      take: limit,
      orderBy: { rating: 'desc' },
      select: {
        id: true,
        username: true,
        nickname: true,
        rating: true,
        color: true,
        avatar: true,
        _count: { select: { solutions: true, comments: { where: { isDeleted: false } } } },
      },
    })
  }
  const users = await prisma.user.findMany({
    where: { id: { in: sortedUserIds } },
    select: {
      id: true,
      username: true,
      nickname: true,
      rating: true,
      color: true,
      avatar: true,
      _count: {
        select: {
          solutions: true,
          comments: { where: { isDeleted: false } },
        },
      },
    },
  })
  return sortedUserIds.map((id: any) => users.find((u: any) => u.id === id)).filter((u: any) => u !== undefined)
}

/**
 * 当前用户头像历史
 */
export async function listAvatarHistory(userId: string, take = 20) {
  return prisma.avatarHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
  })
}

/* ============================================================================
 * 批量注册用户（原 /api/admin/users/batch-register）
 * ========================================================================== */

export type BatchUserRole = 'SYSTEM_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT'

export interface BatchUserInput {
  username: string
  email?: string
  password: string
  role?: string
}

export interface BatchRegisterError {
  row: number
  username?: string
  email?: string
  error: string
}

export interface BatchRegisterResult {
  total: number
  succeeded: number
  failed: number
  errors: BatchRegisterError[]
}

const BATCH_VALID_ROLES: BatchUserRole[] = ['SYSTEM_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT']

function isBatchUserRole(role: unknown): role is BatchUserRole {
  return typeof role === 'string' && BATCH_VALID_ROLES.includes(role as BatchUserRole)
}

function getBatchRoleDefaults(role: BatchUserRole) {
  switch (role) {
    case 'SYSTEM_ADMIN':
      return { rank: '管理员', color: '#FF6B6B' }
    case 'ADMIN':
      return { rank: '管理员', color: '#FF6B6B' }
    case 'TEACHER':
      return { rank: '教师', color: '#4ECDC4' }
    case 'STUDENT':
      return { rank: '新手', color: '#808080' }
  }
}

/**
 * 解析 CSV 文本（username, email, password, role 列表头）
 */
export function parseBatchRegisterCSV(csvText: string): BatchUserInput[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []

  const headerLine = lines[0].toLowerCase()
  const headers = headerLine.split(',').map((h) => h.trim())

  const usernameIndex = headers.findIndex((h) => h === 'username')
  const emailIndex = headers.findIndex((h) => h === 'email')
  const passwordIndex = headers.findIndex((h) => h === 'password')
  const roleIndex = headers.findIndex((h) => h === 'role')

  if (usernameIndex === -1 || passwordIndex === -1) {
    throw new Error('CSV文件必须包含 username, password 列（email 可选）')
  }

  const users: BatchUserInput[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = line.split(',').map((v) => v.trim())
    if (values.length < 2) continue
    const user: BatchUserInput = {
      username: values[usernameIndex] || '',
      password: values[passwordIndex] || '',
    }
    if (emailIndex !== -1 && values[emailIndex]) user.email = values[emailIndex]
    if (roleIndex !== -1 && values[roleIndex]) {
      user.role = values[roleIndex].toUpperCase()
    }
    users.push(user)
  }
  return users
}

/**
 * 批量处理用户输入：对每个 user 校验 + 创建账号，返回成功/失败统计
 */
export async function batchRegisterUsers(
  users: BatchUserInput[],
  startRow: number = 1,
  operatorRole: string | undefined | null = 'SYSTEM_ADMIN'
): Promise<BatchRegisterResult> {
  const result: BatchRegisterResult = {
    total: users.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  }

  for (let i = 0; i < users.length; i++) {
    const user = users[i]
    const rowNumber = startRow + i
    try {
      if (!user.username || !user.password) {
        result.failed++
        result.errors.push({
          row: rowNumber,
          username: user.username,
          email: user.email,
          error: '缺少必填字段（username, password）',
        })
        continue
      }

      const trimmedUsername = String(user.username).trim()
      const trimmedPassword = String(user.password)
      const trimmedEmail = user.email
        ? String(user.email).trim().toLowerCase()
        : `${trimmedUsername}@placeholder.local`

      if (!validateUsername(trimmedUsername)) {
        result.failed++
        result.errors.push({
          row: rowNumber,
          username: trimmedUsername,
          email: trimmedEmail,
          error: '用户名必须为3-20位字母、数字、下划线或中文',
        })
        continue
      }

      if (user.email && !validateEmail(trimmedEmail)) {
        result.failed++
        result.errors.push({
          row: rowNumber,
          username: trimmedUsername,
          email: trimmedEmail,
          error: '邮箱格式不正确',
        })
        continue
      }

      const passwordValidation = validatePassword(trimmedPassword)
      if (!passwordValidation.valid) {
        result.failed++
        result.errors.push({
          row: rowNumber,
          username: trimmedUsername,
          email: trimmedEmail,
          error: passwordValidation.errors.join('；'),
        })
        continue
      }

      const requestedRole = isBatchUserRole(user.role) ? user.role : 'STUDENT'
      // 校验操作者是否有权分配该角色（SYSTEM_ADMIN 不可被赋予；ADMIN 只能赋予 TEACHER/STUDENT）
      const assignable = getAssignableRoles(operatorRole)
      if (!assignable.includes(requestedRole)) {
        result.failed++
        result.errors.push({
          row: rowNumber,
          username: trimmedUsername,
          email: trimmedEmail,
          error: `无权分配该角色: ${requestedRole}`,
        })
        continue
      }
      const role = requestedRole
      const sanitizedUsername = escapeHtml(trimmedUsername)
      const sanitizedEmail = trimmedEmail

      const existingUsername = await prisma.user.findUnique({
        where: { username: sanitizedUsername },
      })
      if (existingUsername) {
        result.failed++
        result.errors.push({
          row: rowNumber,
          username: sanitizedUsername,
          email: trimmedEmail,
          error: '用户名已存在',
        })
        continue
      }

      if (user.email) {
        const existingEmail = await prisma.user.findUnique({
          where: { email: sanitizedEmail },
        })
        if (existingEmail) {
          result.failed++
          result.errors.push({
            row: rowNumber,
            username: sanitizedUsername,
            email: sanitizedEmail,
            error: '邮箱已存在',
          })
          continue
        }
      }

      const hashedPassword = await bcrypt.hash(trimmedPassword, 10)
      const roleDefaults = getBatchRoleDefaults(role)

      await prisma.user.create({
        data: {
          username: sanitizedUsername,
          email: sanitizedEmail,
          password: hashedPassword,
          nickname: sanitizedUsername,
          rating: 1500,
          rank: roleDefaults.rank,
          color: roleDefaults.color,
          role: role,
          isBanned: false,
        },
      })

      result.succeeded++
    } catch (error) {
      result.failed++
      result.errors.push({
        row: rowNumber,
        username: user.username,
        email: user.email,
        error: error instanceof Error ? error.message : '创建用户失败',
      })
    }
  }
  return result
}

/* ============================================================================
 * 管理员用户管理（原 /api/admin/users/* 路由）
 * ========================================================================== */

const VALID_ADMIN_ROLES = ['SYSTEM_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT']

/**
 * 可被分配的角色（不含 SYSTEM_ADMIN —— 系统管理员唯一且不可被赋予）
 */
const ASSIGNABLE_ROLES = ['ADMIN', 'TEACHER', 'STUDENT']

/**
 * 根据操作者角色返回其可分配的目标角色列表
 * - SYSTEM_ADMIN 可赋予 ADMIN / TEACHER / STUDENT
 * - ADMIN 只能赋予 TEACHER / STUDENT（不能管理其他管理员）
 */
export function getAssignableRoles(operatorRole: string | undefined | null): string[] {
  if (operatorRole === 'SYSTEM_ADMIN') return ASSIGNABLE_ROLES
  if (operatorRole === 'ADMIN') return ['TEACHER', 'STUDENT']
  return []
}

/**
 * 校验目标角色是否可被当前操作者分配
 */
export function assertAssignableRole(
  role: string | undefined,
  operatorRole: string | undefined | null
): asserts role is 'ADMIN' | 'TEACHER' | 'STUDENT' {
  const assignable = getAssignableRoles(operatorRole)
  if (!role || !assignable.includes(role)) {
    const err: any = new Error('无效的角色类型或无权分配该角色')
    err.status = 400
    err.code = 'INVALID_ROLE'
    throw err
  }
}

/**
 * 列出所有用户（管理员）
 */
export async function listAllUsersForAdmin(opts?: { page?: number; pageSize?: number }) {
  const page = opts?.page
  const pageSize = opts?.pageSize
  const usePaging =
    typeof page === 'number' && typeof pageSize === 'number' && page > 0 && pageSize > 0
  // 未传分页参数时加 take 上限防 OOM；传入参数时按 page/pageSize 分页
  const take = usePaging ? (pageSize as number) : 500
  const skip = usePaging ? ((page as number) - 1) * (pageSize as number) : 0
  return prisma.user.findMany({
    skip,
    take,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      email: true,
      nickname: true,
      avatar: true,
      rating: true,
      rank: true,
      role: true,
      isBanned: true,
      createdAt: true,
      _count: {
        select: {
          submissions: true,
          problems: true,
        },
      },
    },
  })
}

/**
 * 校验入参中的角色字段
 */
export function assertValidRole(role: string | undefined): asserts role is 'SYSTEM_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT' {
  if (!role || !VALID_ADMIN_ROLES.includes(role)) {
    const err: any = new Error('无效的角色类型')
    err.status = 400
    err.code = 'INVALID_ROLE'
    throw err
  }
}

/**
 * 校验管理员更新用户的合法性
 * - 自己不能改
 * - 超级管理员不能改
 * - 管理员不能修改其他管理员
 */
export async function assertCanUpdateUser(
  targetUserId: string,
  operatorUserId: string,
  operatorRole: string | undefined | null,
  body: { role?: string; isBanned?: boolean }
) {
  if (targetUserId === operatorUserId) {
    if ('isBanned' in body || 'role' in body) {
      const err: any = new Error('不能修改自己的权限或状态')
      err.status = 400
      err.code = 'CANNOT_MODIFY_SELF'
      throw err
    }
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!target) {
    const err: any = new Error('用户不存在')
    err.status = 404
    err.code = 'NOT_FOUND'
    throw err
  }
  if (target.role === 'SYSTEM_ADMIN') {
    const err: any = new Error('超级管理员不可被修改')
    err.status = 403
    err.code = 'FORBIDDEN'
    throw err
  }
  // 管理员不能管理其他管理员
  if (operatorRole === 'ADMIN' && target.role === 'ADMIN') {
    const err: any = new Error('管理员不能管理其他管理员')
    err.status = 403
    err.code = 'FORBIDDEN'
    throw err
  }
  return target
}

/**
 * 校验管理员删除用户的合法性
 * - 不能删除自己
 * - 超级管理员不能删除
 * - 管理员不能删除其他管理员
 */
export async function assertCanDeleteUser(
  targetUserId: string,
  operatorUserId: string,
  operatorRole: string | undefined | null
) {
  if (targetUserId === operatorUserId) {
    const err: any = new Error('不能删除自己的账号')
    err.status = 400
    err.code = 'CANNOT_DELETE_SELF'
    throw err
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!target) {
    const err: any = new Error('用户不存在')
    err.status = 404
    err.code = 'NOT_FOUND'
    throw err
  }
  if (target.role === 'SYSTEM_ADMIN') {
    const err: any = new Error('超级管理员不可被删除')
    err.status = 403
    err.code = 'FORBIDDEN'
    throw err
  }
  // 管理员不能管理其他管理员
  if (operatorRole === 'ADMIN' && target.role === 'ADMIN') {
    const err: any = new Error('管理员不能管理其他管理员')
    err.status = 403
    err.code = 'FORBIDDEN'
    throw err
  }
}

/**
 * 管理员更新用户：role / isBanned / password
 */
export async function adminUpdateUser(
  targetUserId: string,
  body: {
    role?: 'SYSTEM_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT'
    isBanned?: boolean
    password?: string
  },
  bcryptModule: typeof import('bcryptjs')
) {
  const updateData: any = {}
  // 修改密码或封禁时需递增 tokenVersion，使旧 Token 失效
  let shouldInvalidateTokens = false

  if ('role' in body) {
    assertValidRole(body.role)
    updateData.role = body.role
  }
  if ('isBanned' in body) {
    updateData.isBanned = Boolean(body.isBanned)
    if (updateData.isBanned) {
      shouldInvalidateTokens = true
    }
  }
  if (body.password) {
    if (body.password.length < 8) {
      const err: any = new Error('密码长度至少为8位')
      err.status = 400
      err.code = 'PASSWORD_TOO_SHORT'
      throw err
    }
    updateData.password = await bcryptModule.hash(body.password, 10)
    shouldInvalidateTokens = true
  }
  if (shouldInvalidateTokens) {
    updateData.tokenVersion = { increment: 1 }
  }
  const result = await prisma.user.update({
    where: { id: targetUserId },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      isBanned: true,
    },
  })
  clearUserCache(targetUserId)
  return result
}

/**
 * 管理员删除用户
 */
export async function adminDeleteUser(targetUserId: string) {
  const result = await prisma.user.delete({ where: { id: targetUserId } })
  clearUserCache(targetUserId)
  return result
}

/**
 * 过滤批量操作的目标用户
 * - 跳过自己
 * - 跳过超级管理员
 * - ADMIN 操作时跳过其他管理员
 */
export async function filterUserIdsForBatchAction(
  userIds: string[],
  operatorUserId: string,
  operatorRole: string | undefined | null,
  action: 'update' | 'delete'
) {
  // 跳过自己
  const filtered = userIds.filter((id) => id !== operatorUserId)
  if (filtered.length === 0) {
    const err: any = new Error(action === 'update' ? '不能修改自己的角色' : '不能删除自己的账号')
    err.status = 400
    err.code = action === 'update' ? 'CANNOT_MODIFY_SELF' : 'CANNOT_DELETE_SELF'
    throw err
  }
  // 跳过超级管理员；ADMIN 操作时还要跳过其他管理员
  const protectedRoles = operatorRole === 'ADMIN' ? ['SYSTEM_ADMIN', 'ADMIN'] : ['SYSTEM_ADMIN']
  const protectedUsers = await prisma.user.findMany({
    where: { id: { in: filtered }, role: { in: protectedRoles } },
    select: { id: true },
  })
  const protectedIds = new Set(protectedUsers.map((u: any) => u.id))
  const finalUserIds = filtered.filter((id) => !protectedIds.has(id))
  if (finalUserIds.length === 0) {
    const err: any = new Error('选中的用户不可被' + (action === 'update' ? '修改' : '删除'))
    err.status = 403
    err.code = 'FORBIDDEN'
    throw err
  }
  return { finalUserIds, skippedCount: userIds.length - finalUserIds.length }
}

/**
 * 批量更新用户角色
 */
export async function batchUpdateUserRole(finalUserIds: string[], role: 'SYSTEM_ADMIN' | 'ADMIN' | 'TEACHER' | 'STUDENT') {
  const result = await prisma.user.updateMany({
    where: { id: { in: finalUserIds } },
    data: {
      role,
    },
  })
  finalUserIds.forEach(clearUserCache)
  return result
}

/**
 * 批量删除用户
 */
export async function batchDeleteUsers(finalUserIds: string[]) {
  const result = await prisma.user.deleteMany({ where: { id: { in: finalUserIds } } })
  finalUserIds.forEach(clearUserCache)
  return result
}

/* ============================================================================
 * 当前用户 email / password 修改（原 /api/users/profile/email 路由）
 * ========================================================================== */

export async function changeCurrentUserEmail(
  userId: string,
  newEmail: string
): Promise<{ email: string }> {
  if (!newEmail || typeof newEmail !== 'string') {
    const err: any = new Error('请提供新邮箱')
    err.status = 400
    throw err
  }
  // 简单邮箱格式校验
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    const err: any = new Error('邮箱格式不正确')
    err.status = 400
    throw err
  }
  const existing = await prisma.user.findUnique({ where: { email: newEmail } })
  if (existing && existing.id !== userId) {
    const err: any = new Error('该邮箱已被使用')
    err.status = 409
    throw err
  }
  await prisma.user.update({ where: { id: userId }, data: { email: newEmail } })
  clearUserCache(userId)
  return { email: newEmail }
}

/* ============================================================================
 * 用户邮箱修改 — 辅助函数（原 /api/users/profile/email）
 * ========================================================================== */

/** 读用户的 id/email/password 记录（用于密码校验 / 邮箱比较） */
export async function getUserWithPassword(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, password: true },
  })
}

/** 检查邮箱是否已被其他用户占用 */
export async function isEmailTaken(email: string, excludeUserId: string) {
  const u = await prisma.user.findUnique({ where: { email } })
  return !!(u && u.id !== excludeUserId)
}

/** 别名：与 changeCurrentUserEmail 保持一致（getUserService 自带别名也行） */
export { changeCurrentUserEmail as updateCurrentUserEmail }

/** 读用户角色位（role）— 用于题解鉴权 */
export async function getUserRoleFlags(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
}

/** 读用户完整信息（用于创建训练计划等需要 role 鉴权） */
export async function getUserFullInfo(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } })
}

/* ============================================================================
 * 注册流程（原 /api/auth/register）
 * ========================================================================== */

export interface RegisterResult {
  id: string
  username: string
  email: string
  nickname: string | null
  rating: number
  rank: string
  color: string
  role: string
  createdAt: Date
  isFirstUser: boolean
}

/** 注册新用户：检查重名/重邮箱 + 创建 + 返回 isFirstUser
 *
 * isFirstUser 由调用方传入（基于 prisma.user.count() === 0 判定），service 内部不读 DB 决定首用户
 *  - isFirstUser=true  → role=SYSTEM_ADMIN
 *  - isFirstUser=false → role=STUDENT
 */
export async function registerNewUser(input: {
  sanitizedUsername: string
  sanitizedEmail: string
  sanitizedNickname: string
  hashedPassword: string
  isFirstUser?: boolean
}): Promise<RegisterResult> {
  // 检查用户名
  const existingUsername = await prisma.user.findUnique({
    where: { username: input.sanitizedUsername },
  })
  if (existingUsername) {
    const err: any = new Error('用户名已被使用')
    err.status = 400
    err.code = 'BAD_REQUEST'
    throw err
  }
  // 检查邮箱
  const existingEmail = await prisma.user.findUnique({
    where: { email: input.sanitizedEmail },
  })
  if (existingEmail) {
    const err: any = new Error('邮箱已被注册')
    err.status = 400
    err.code = 'BAD_REQUEST'
    throw err
  }

  const isFirstUser = input.isFirstUser === true

  const user = await prisma.user.create({
    data: {
      username: input.sanitizedUsername,
      email: input.sanitizedEmail,
      password: input.hashedPassword,
      nickname: input.sanitizedNickname,
      rating: 1500,
      rank: isFirstUser ? '管理员' : '新手',
      color: isFirstUser ? '#FF6B6B' : '#808080',
      role: isFirstUser ? 'SYSTEM_ADMIN' : 'STUDENT',
      isBanned: false,
    },
    select: {
      id: true,
      username: true,
      email: true,
      nickname: true,
      rating: true,
      rank: true,
      color: true,
      role: true,
      createdAt: true,
    },
  })

  // TOCTOU 防护：并发注册时，多个请求可能同时通过 count===0 判定。
  // 创建后二次校验 SYSTEM_ADMIN 数量，若 >1 说明已有更早的超管，将当前用户降级为 STUDENT。
  let actualRole = user.role
  let actualIsFirstUser = isFirstUser
  if (isFirstUser) {
    const adminCount = await prisma.user.count({ where: { role: 'SYSTEM_ADMIN' } })
    if (adminCount > 1) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'STUDENT', rank: '新手', color: '#808080' },
      })
      actualRole = 'STUDENT'
      actualIsFirstUser = false
    }
  }
  return { ...user, role: actualRole, isFirstUser: actualIsFirstUser }
}
