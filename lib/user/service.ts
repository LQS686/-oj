/**
 * lib/user/service.ts
 * 用户资料、偏好、头像、统计
 */
import { prisma } from '@/lib/prisma'
import { cache } from '@/lib/cache'
import { getMongoClient } from '@/lib/mongodb-direct'

export interface UserProfile {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
  bio: string | null
  email: string | null
  role: string
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
}>) {
  return prisma.user.update({ where: { id: userId }, data })
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
            posts: { where: { status: 'published', isDeleted: false } },
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
  const recentSubmissions = submissions.slice(0, 10).map(sub => ({
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
    sub => sub.status === 'AC' || sub.status === 'Accepted'
  )

  // 难度分布（AC 唯一题）
  const solvedProblemsMap = new Map<string, string | null>()
  acSubmissions.forEach(sub => {
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
    .map(([difficulty, count]) => ({ difficulty, count }))
    .sort((a, b) => b.count - a.count)

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

  const [createdProblems, postsCount, commentsCount, contestsCount] = await Promise.all([
    prisma.problem.count({ where: { authorId: userId } }),
    prisma.post.count({ where: { authorId: userId } }),
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
    community: { posts: postsCount, comments: commentsCount },
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
      isAdmin: true,
      isBanned: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          submissions: true,
          problems: true,
          posts: true,
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
    { _id: new (require('mongodb').ObjectId)(userId) },
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
      isAdmin: true,
      updatedAt: true,
    },
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
  if (newPassword.length < 6) {
    const err: any = new Error('新密码长度至少为6位')
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
  await db.collection('User').updateOne(
    { _id: new (require('mongodb').ObjectId)(userId) },
    { $set: { password: hashedPassword, updatedAt: new Date() } }
  )
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
  return avatarUrl
}

/**
 * 活跃用户列表（综合发帖权重 3 + 评论权重 1）
 */
export async function listActiveUsers(limit = 5) {
  const [postCounts, commentCounts] = await Promise.all([
    prisma.post.groupBy({
      by: ['authorId'],
      _count: { id: true },
      where: { isDeleted: false, status: 'published' },
    }),
    prisma.comment.groupBy({
      by: ['authorId'],
      _count: { id: true },
      where: { isDeleted: false },
    }),
  ])
  const userScores = new Map<string, number>()
  postCounts.forEach(item => {
    userScores.set(item.authorId, (userScores.get(item.authorId) || 0) + item._count.id * 3)
  })
  commentCounts.forEach(item => {
    userScores.set(item.authorId, (userScores.get(item.authorId) || 0) + item._count.id)
  })
  const sortedUserIds = Array.from(userScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(entry => entry[0])
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
          posts: { where: { isDeleted: false, status: 'published' } },
          comments: { where: { isDeleted: false } },
        },
      },
    },
  })
  return sortedUserIds.map(id => users.find(u => u.id === id)).filter(u => u !== undefined)
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
