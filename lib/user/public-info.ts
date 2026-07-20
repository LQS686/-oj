/**
 * lib/user/public-info.ts
 * 公开信息、完整统计、当前用户档案、密码修改、偏好设置
 */
import { prisma } from '@/lib/prisma'
import { getMongoClient } from '@/lib/mongodb-direct'
import { ObjectId } from 'mongodb'
import { AppError } from '@/lib/errors'
import { clearUserCache } from './profile'

/* ============================================================================
 * 业务封装：原 /api/users/* 路由中的复杂逻辑
 * ========================================================================== */

/**
 * 获取用户公开资料（含发帖/题目/AC 提交数）
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

  const [
    totalSubmissions,
    statusGroups,
    languageGroups,
    acProblemIds,
    attemptedProblemIds,
    recentSubmissions,
    difficultyGroups,
    createdProblems,
    solutionsCount,
    contestsCount,
  ] = await Promise.all([
    prisma.submission.count({ where: { userId } }),
    prisma.submission.groupBy({
      by: ['status'],
      where: { userId },
      _count: { id: true },
    }),
    prisma.submission.groupBy({
      by: ['language'],
      where: { userId },
      _count: { id: true },
    }),
    prisma.submission.findMany({
      where: { userId, status: 'AC' },
      select: { problemId: true, submittedAt: true },
    }),
    prisma.submission.findMany({
      where: { userId },
      select: { problemId: true },
      distinct: ['problemId'],
    }),
    prisma.submission.findMany({
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
      take: 10,
    }),
    prisma.submission.findMany({
      where: {
        userId,
        status: 'AC',
      },
      select: {
        problemId: true,
        submittedAt: true,
        problem: { select: { difficulty: true } },
      },
    }),
    prisma.problem.count({ where: { authorId: userId } }),
    prisma.solution.count({ where: { authorId: userId } }),
    prisma.contestParticipant.count({ where: { userId } }),
  ])

  // Build status counts from groupBy
  const statusCount: Record<string, number> = {}
  statusGroups.forEach((g) => { statusCount[g.status] = g._count.id })

  // Build language counts from groupBy
  const languageCount: Record<string, number> = {}
  languageGroups.forEach((g) => { languageCount[g.language] = g._count.id })

  // AC unique problems (deduplicated)
  const acProblemsMap = new Map<string, boolean>()
  acProblemIds.forEach((s) => { acProblemsMap.set(s.problemId, true) })

  // Difficulty distribution from AC submissions
  const solvedDifficultyMap = new Map<string, string | null>()
  difficultyGroups.forEach((sub) => {
    if (!solvedDifficultyMap.has(sub.problemId)) {
      solvedDifficultyMap.set(sub.problemId, sub.problem?.difficulty || null)
    }
  })
  const difficultyCount: Record<string, number> = {}
  solvedDifficultyMap.forEach((difficulty) => {
    if (difficulty) {
      difficultyCount[difficulty] = (difficultyCount[difficulty] || 0) + 1
    }
  })
  const difficultyDistribution = Object.entries(difficultyCount)
    .map(([difficulty, count]) => ({ difficulty, count }))
    .sort((a, b) => b.count - a.count)

  // Heatmap from AC submissions
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const uniqueAcByProblem = new Map<string, Date>()
  acProblemIds.forEach((sub) => {
    if (!uniqueAcByProblem.has(sub.problemId)) {
      uniqueAcByProblem.set(sub.problemId, sub.submittedAt)
    }
  })

  const buildHeatmap = (entries: Map<string, Date>) =>
    Array.from(entries.values()).reduce((acc: Record<string, number>, date: Date) => {
      const d = new Date(date)
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      acc[dateKey] = (acc[dateKey] || 0) + 1
      return acc
    }, {})

  const lastWeekEntries = new Map<string, Date>()
  const yearEntries = new Map<string, Date>()
  uniqueAcByProblem.forEach((date, problemId) => {
    if (new Date(date) >= sevenDaysAgo) lastWeekEntries.set(problemId, date)
    if (new Date(date) >= oneYearAgo) yearEntries.set(problemId, date)
  })

  const heatmapData = buildHeatmap(lastWeekEntries)
  const yearHeatmap = buildHeatmap(yearEntries)

  // Recent submissions
  const formattedRecent = recentSubmissions.map((sub) => ({
    id: sub.id,
    problemId: sub.problem?.problemNumber || sub.problemId,
    realProblemId: sub.problemId,
    problemTitle: sub.problem?.title || '未知题目',
    status: sub.status,
    language: sub.language,
    time: new Date(sub.submittedAt).toLocaleString('zh-CN'),
    submittedAt: sub.submittedAt,
  }))

  return {
    user,
    submissions: {
      total: totalSubmissions,
      accepted: statusCount['AC'] || 0,
      wrongAnswer: statusCount['WA'] || 0,
      timeLimitExceeded: statusCount['TLE'] || 0,
      memoryLimitExceeded: statusCount['MLE'] || 0,
      runtimeError: statusCount['RE'] || 0,
      compileError: statusCount['CE'] || 0,
      pending: statusCount['Pending'] || 0,
      statusCount,
    },
    problems: {
      solved: acProblemsMap.size,
      attempted: attemptedProblemIds.length,
      created: createdProblems,
    },
    languages: languageCount,
    community: { solutions: solutionsCount },
    contests: { participated: contestsCount },
    activity: {
      lastWeek: heatmapData,
      lastYear: yearHeatmap,
      totalDays: Object.keys(yearHeatmap).length,
    },
    recentSubmissions: formattedRecent,
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
    throw AppError.badRequest('INVALID_NICKNAME', '昵称长度应在1-50个字符之间')
  }
  if (data.bio !== undefined && data.bio.length > 500) {
    throw AppError.badRequest('INVALID_BIO', '个人简介不能超过500个字符')
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
  }).then((result) => {
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
    throw AppError.badRequest('MISSING_FIELDS', '请提供当前密码和新密码')
  }
  if (newPassword.length < 8) {
    throw AppError.badRequest('PASSWORD_TOO_SHORT', '新密码长度至少为8位')
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  })
  if (!userRecord) {
    throw AppError.notFound('用户不存在')
  }
  const isPasswordValid = await bcryptModule.compare(currentPassword, userRecord.password)
  if (!isPasswordValid) {
    throw AppError.badRequest('WRONG_PASSWORD', '当前密码错误')
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
export async function updateUserPreferencesCollection(userId: string, body: Record<string, unknown>) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw AppError.badRequest('INVALID_DATA', '无效的偏好设置数据')
  }
  const client = await getMongoClient()
  const db = client.db()
  const existing = await db.collection('UserPreferences').findOne({ userId })
  const existingPrefs: Record<string, any> = (existing?.preferences as Record<string, any>) || {}
  const updatedPrefs: Record<string, any> = { ...existingPrefs }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_PREFERENCE_KEYS.includes(key)) continue
    if (!validatePreferenceValue(key, body[key])) {
      throw AppError.badRequest('INVALID_PREFERENCE', `无效的偏好设置值: ${key}`)
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
