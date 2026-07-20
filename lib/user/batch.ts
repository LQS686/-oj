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
import { escapeHtml } from '@/lib/sanitize'
import { getAssignableRoles } from './admin'

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
