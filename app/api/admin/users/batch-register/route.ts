/**
 * /api/admin/users/batch-register - 批量注册用户（管理员）
 *
 * 支持两种 Content-Type：
 *  - multipart/form-data + CSV 文件
 *  - application/json + users 数组（最多 100 个）
 *
 * 每行返回 { total, succeeded, failed, errors: [{ row, username, email, error }] }
 */
import { withApi, ok, readJson, throw400, throw403, throw404, throw500 } from '@/lib/api/withApi'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import {
  validateEmail,
  validateUsername,
  validatePassword,
} from '@/lib/validation'
import { escapeHtml } from '@/lib/sanitize'

type UserRole = 'ADMIN' | 'TEACHER' | 'USER'

interface UserInput {
  username: string
  email?: string
  password: string
  role?: UserRole
}

interface BatchError {
  row: number
  username?: string
  email?: string
  error: string
}

interface BatchResult {
  total: number
  succeeded: number
  failed: number
  errors: BatchError[]
}

const VALID_ROLES: UserRole[] = ['ADMIN', 'TEACHER', 'USER']

function validateUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && VALID_ROLES.includes(role as UserRole)
}

function getRoleDefaults(role: UserRole): { isAdmin: boolean; rank: string; color: string } {
  switch (role) {
    case 'ADMIN':
      return { isAdmin: true, rank: '管理员', color: '#FF6B6B' }
    case 'TEACHER':
      return { isAdmin: false, rank: '教师', color: '#4ECDC4' }
    default:
      return { isAdmin: false, rank: '新手', color: '#808080' }
  }
}

async function processBatchUsers(
  users: UserInput[],
  startRow: number = 1
): Promise<BatchResult> {
  const result: BatchResult = {
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

      const role = validateUserRole(user.role) ? user.role : 'USER'
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
      const roleDefaults = getRoleDefaults(role)

      await prisma.user.create({
        data: {
          username: sanitizedUsername,
          email: sanitizedEmail,
          password: hashedPassword,
          nickname: sanitizedUsername,
          rating: 1500,
          rank: roleDefaults.rank,
          color: roleDefaults.color,
          isAdmin: roleDefaults.isAdmin,
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

function parseCSV(csvText: string): UserInput[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim())

  if (lines.length < 2) {
    return []
  }

  const headerLine = lines[0].toLowerCase()
  const headers = headerLine.split(',').map((h) => h.trim())

  const usernameIndex = headers.findIndex((h) => h === 'username')
  const emailIndex = headers.findIndex((h) => h === 'email')
  const passwordIndex = headers.findIndex((h) => h === 'password')
  const roleIndex = headers.findIndex((h) => h === 'role')

  if (usernameIndex === -1 || passwordIndex === -1) {
    throw new Error('CSV文件必须包含 username, password 列（email 可选）')
  }

  const users: UserInput[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = line.split(',').map((v) => v.trim())

    if (values.length < 2) continue

    const user: UserInput = {
      username: values[usernameIndex] || '',
      password: values[passwordIndex] || '',
    }

    if (emailIndex !== -1 && values[emailIndex]) {
      user.email = values[emailIndex]
    }

    if (roleIndex !== -1 && values[roleIndex]) {
      user.role = values[roleIndex].toUpperCase() as UserRole
    }

    users.push(user)
  }

  return users
}

/**
 * POST /api/admin/users/batch-register
 * - 管理员批量注册用户
 * - 支持 JSON body 或 multipart/form-data 上传 CSV
 */
export const POST = withApi.auth(async (req, _ctx, { user }) => {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw403('需要管理员权限')
  }

  const contentType = req.headers.get('content-type') || ''

  let result: BatchResult

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      throw400('NO_FILE', '请上传CSV文件')
    }

    const f = file as File
    if (!f.name.endsWith('.csv') && !f.name.endsWith('.txt')) {
      throw400('BAD_FILE_TYPE', '只支持CSV或TXT格式文件')
    }

    const csvText = await f.text()

    let users: UserInput[] = []
    try {
      users = parseCSV(csvText)
    } catch (parseError) {
      throw400(
        'CSV_PARSE_ERROR',
        parseError instanceof Error ? parseError.message : 'CSV解析失败',
      )
    }

    if (users!.length === 0) {
      throw400('EMPTY_CSV', 'CSV文件中没有有效的用户数据')
    }

    result = await processBatchUsers(users!, 2)
  } else {
    const body = await readJson<{ users?: UserInput[] }>(req)
    const { users } = body

    if (!users || !Array.isArray(users)) {
      throw400('INVALID_BODY', '请提供用户数组')
    }

    if (users!.length === 0) {
      throw400('EMPTY_USERS', '用户数组不能为空')
    }

    if (users!.length > 100) {
      throw400('TOO_MANY', '单次最多批量注册100个用户')
    }

    result = await processBatchUsers(users!, 1)
  }

  return ok(result)
})
