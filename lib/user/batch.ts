/**
 * lib/user/batch.ts
 * 批量注册用户、CSV 解析
 */
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import {
  validateEmail,
  validateUsername,
  validatePassword,
} from '@/lib/api/validation'
import { getAssignableRoles } from './admin'

/* ============================================================================
 * 批量注册用户（原 /api/admin/users/batch-register）
 * ========================================================================== */

/** 可出现在 CSV / 表单中的角色；SYSTEM_ADMIN 不可通过批量注册赋予 */
export type BatchUserRole = 'ADMIN' | 'TEACHER' | 'STUDENT'

export interface BatchUserInput {
  username: string
  email?: string
  password: string
  role?: string
  /** 原始行号（CSV 为文件行号，1-based；JSON 可省略） */
  row?: number
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

export interface ParseBatchCsvResult {
  users: BatchUserInput[]
  parseErrors: BatchRegisterError[]
}

const BATCH_VALID_ROLES: BatchUserRole[] = ['ADMIN', 'TEACHER', 'STUDENT']

function isBatchUserRole(role: unknown): role is BatchUserRole {
  return typeof role === 'string' && BATCH_VALID_ROLES.includes(role as BatchUserRole)
}

function getBatchRoleDefaults(role: BatchUserRole) {
  switch (role) {
    case 'ADMIN':
      return { rank: '管理员', color: '#FF6B6B' }
    case 'TEACHER':
      return { rank: '教师', color: '#4ECDC4' }
    case 'STUDENT':
      return { rank: '新手', color: '#808080' }
  }
}

/**
 * 按 RFC4180 解析一行 CSV（支持引号字段与 "" 转义）
 */
function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      values.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  values.push(cur.trim())
  return values
}

/**
 * 解析 CSV 文本。表头需含 username、password；email / role 可选。
 * 行号对应文件原始行号（含表头），空白行跳过；格式无效行记入 parseErrors。
 * 字段支持 RFC4180 引号转义（如 `"Smith, Jr."`、`""`）。
 */
export function parseBatchRegisterCSV(csvText: string): ParseBatchCsvResult {
  const lines = csvText.split(/\r?\n/)
  const users: BatchUserInput[] = []
  const parseErrors: BatchRegisterError[] = []

  let headerLineIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      headerLineIdx = i
      break
    }
  }
  if (headerLineIdx === -1) {
    return { users, parseErrors }
  }

  const headers = parseCsvLine(lines[headerLineIdx].toLowerCase())
  const usernameIndex = headers.findIndex((h) => h === 'username')
  const emailIndex = headers.findIndex((h) => h === 'email')
  const passwordIndex = headers.findIndex((h) => h === 'password')
  const roleIndex = headers.findIndex((h) => h === 'role')

  if (usernameIndex === -1 || passwordIndex === -1) {
    throw new Error('CSV文件必须包含 username, password 列（email、role 可选）')
  }

  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const row = i + 1
    const line = lines[i].trim()
    if (!line) continue

    const values = parseCsvLine(line)
    const username = values[usernameIndex] || ''
    const password = values[passwordIndex] || ''

    if (values.length < 2 || (!username && !password)) {
      parseErrors.push({
        row,
        error: '行格式无效：至少需要 username 与 password',
      })
      continue
    }

    const user: BatchUserInput = {
      username,
      password,
      row,
    }
    if (emailIndex !== -1 && values[emailIndex]) {
      user.email = values[emailIndex]
    }
    if (roleIndex !== -1 && values[roleIndex]) {
      user.role = values[roleIndex].toUpperCase()
    }
    users.push(user)
  }

  return { users, parseErrors }
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

  // C-P2-6：批量预取批内已存在的 username/email，避免循环内逐条串行 findUnique
  const candidateUsernames: string[] = []
  const candidateEmails: string[] = []
  for (const user of users) {
    const trimmedUsername = String(user.username ?? '').trim()
    candidateUsernames.push(trimmedUsername)
    const rawEmail = user.email != null ? String(user.email).trim() : ''
    if (rawEmail.length > 0) {
      candidateEmails.push(rawEmail.toLowerCase())
    }
  }
  const [existingUsernameRows, existingEmailRows] = await Promise.all([
    candidateUsernames.length > 0
      ? prisma.user.findMany({
          where: { username: { in: candidateUsernames } },
          select: { username: true },
        })
      : Promise.resolve([] as { username: string }[]),
    candidateEmails.length > 0
      ? prisma.user.findMany({
          where: { email: { in: candidateEmails } },
          select: { email: true },
        })
      : Promise.resolve([] as { email: string }[]),
  ])
  const existingUsernameSet = new Set(existingUsernameRows.map((u) => u.username))
  const existingEmailSet = new Set(existingEmailRows.map((e) => e.email))

  for (let i = 0; i < users.length; i++) {
    const user = users[i]
    const rowNumber = user.row ?? startRow + i
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
      const rawEmail = user.email != null ? String(user.email).trim() : ''
      const hasEmail = rawEmail.length > 0
      // 邮箱列可选：未填时写入唯一占位邮箱（User.email 为必填唯一字段）
      const trimmedEmail = hasEmail
        ? rawEmail.toLowerCase()
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

      if (hasEmail && !validateEmail(trimmedEmail)) {
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

      const roleRaw = user.role != null ? String(user.role).trim() : ''
      let role: BatchUserRole
      if (!roleRaw) {
        role = 'STUDENT'
      } else if (!isBatchUserRole(roleRaw.toUpperCase())) {
        result.failed++
        result.errors.push({
          row: rowNumber,
          username: trimmedUsername,
          email: trimmedEmail,
          error: `无效角色: ${roleRaw}（可选 STUDENT / TEACHER / ADMIN）`,
        })
        continue
      } else {
        role = roleRaw.toUpperCase() as BatchUserRole
      }

      // 校验操作者是否有权分配该角色（SYSTEM_ADMIN 不可被赋予；ADMIN 只能赋予 TEACHER/STUDENT）
      const assignable = getAssignableRoles(operatorRole)
      if (!assignable.includes(role)) {
        result.failed++
        result.errors.push({
          row: rowNumber,
          username: trimmedUsername,
          email: trimmedEmail,
          error: `无权分配该角色: ${role}`,
        })
        continue
      }
      const sanitizedUsername = trimmedUsername
      const sanitizedEmail = trimmedEmail

      if (existingUsernameSet.has(sanitizedUsername)) {
        result.failed++
        result.errors.push({
          row: rowNumber,
          username: sanitizedUsername,
          email: trimmedEmail,
          error: '用户名已存在',
        })
        continue
      }

      if (hasEmail) {
        if (existingEmailSet.has(sanitizedEmail)) {
          result.failed++
          result.errors.push({
            row: rowNumber,
            username: sanitizedUsername,
            email: sanitizedEmail,
            error: '邮箱已存在',
          })
          continue
        }
        const { isEmailInHoldPeriod } = await import('@/lib/user/auth-actions')
        if (await isEmailInHoldPeriod(sanitizedEmail)) {
          result.failed++
          result.errors.push({
            row: rowNumber,
            username: sanitizedUsername,
            email: sanitizedEmail,
            error: '该邮箱处于改绑冷却期，暂时不可注册',
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
          rank: roleDefaults.rank,
          color: roleDefaults.color,
          role: role,
          isBanned: false,
        },
      })

      result.succeeded++
      // 批内后续重复的 username/email 视为已存在（等价于原串行查询语义）
      existingUsernameSet.add(sanitizedUsername)
      existingEmailSet.add(sanitizedEmail)
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
