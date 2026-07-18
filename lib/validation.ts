/**
 * @deprecated 此模块已废弃，请使用 lib/api/validation.ts 中的新校验函数
 * 保留是为了向后兼容，新代码应使用 lib/api/validation.ts
 */
import { escapeHtml, stripTags } from './sanitize'
import { isValidDifficulty, migrateDifficulty } from './constants'

export function validateObjectId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false
  }
  if (id.length !== 24 && id.length !== 36) {
    return false
  }
  const hexRegex = /^[a-fA-F0-9]{24}$/
  const uuidRegex = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/
  return hexRegex.test(id) || uuidRegex.test(id)
}

export function validatePagination(page: unknown, limit: unknown): { page: number; limit: number } {
  const defaultPage = 1
  const defaultLimit = 20
  const maxLimit = 100

  let parsedPage = defaultPage
  let parsedLimit = defaultLimit

  if (typeof page === 'string') {
    const num = parseInt(page, 10)
    if (!isNaN(num) && num > 0) {
      parsedPage = num
    }
  } else if (typeof page === 'number' && page > 0) {
    parsedPage = Math.floor(page)
  }

  if (typeof limit === 'string') {
    const num = parseInt(limit, 10)
    if (!isNaN(num) && num > 0) {
      parsedLimit = Math.min(num, maxLimit)
    }
  } else if (typeof limit === 'number' && limit > 0) {
    parsedLimit = Math.min(Math.floor(limit), maxLimit)
  }

  return { page: parsedPage, limit: parsedLimit }
}

export function sanitizeString(str: string): string {
  if (!str || typeof str !== 'string') {
    return ''
  }
  let sanitized = stripTags(str)
  sanitized = escapeHtml(sanitized)
  return sanitized.trim()
}

export function validateRequired(obj: Record<string, unknown>, fields: string[]): string | null {
  if (!obj || typeof obj !== 'object') {
    return '无效的请求数据'
  }

  for (const field of fields) {
    const value = obj[field]
    if (value === undefined || value === null || value === '') {
      return `缺少必填字段: ${field}`
    }
    if (typeof value === 'string' && value.trim() === '') {
      return `字段 ${field} 不能为空`
    }
  }

  return null
}

export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false
  }
  if (email.length > 254) {
    return false
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return emailRegex.test(email)
}

export function validateUsername(username: string): boolean {
  if (!username || typeof username !== 'string') {
    return false
  }
  if (username.length < 3 || username.length > 20) {
    return false
  }
  const usernameRegex = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/
  return usernameRegex.test(username)
}

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['密码不能为空'] }
  }

  if (password.length < 8) {
    errors.push('密码长度至少为8位')
  }

  if (password.length > 128) {
    errors.push('密码长度不能超过128位')
  }

  if (!/[a-zA-Z]/.test(password)) {
    errors.push('密码必须包含至少一个字母')
  }

  if (!/[0-9]/.test(password)) {
    errors.push('密码必须包含至少一个数字')
  }

  const commonPasswords = [
    '12345678', 'password', '123456789', '1234567890', 'qwerty',
    'abc123', '111111', '1234567', '12345', '123456', 'password1', 'qwerty123'
  ]
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('密码过于简单，请使用更强的密码')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export function validateProblemTitle(title: string): boolean {
  if (!title || typeof title !== 'string') {
    return false
  }
  const trimmed = title.trim()
  return trimmed.length >= 1 && trimmed.length <= 200
}

export function validateProblemDescription(description: string): boolean {
  if (!description || typeof description !== 'string') {
    return false
  }
  return description.trim().length >= 10
}

/**
 * @deprecated 已废弃，请改用 lib/constants.ts 的 isValidDifficulty()
 * 难度校验全站统一使用 8 档标准（入门/普及-/普及/普及+/提高/提高+/省选/NOI）
 * 旧版 4 档（简单/中等/困难）可通过 migrateDifficulty() 自动迁移
 */
export function validateDifficulty(difficulty: string): boolean {
  // 兼容旧调用方：接受 8 档标准值或旧版 4 档/英文值（通过 migrateDifficulty 判断是否可迁移）
  return isValidDifficulty(difficulty) || isValidDifficulty(migrateDifficulty(difficulty))
}

export function validateTimeLimit(timeLimit: number): boolean {
  return typeof timeLimit === 'number' && timeLimit > 0 && timeLimit <= 30000
}

export function validateMemoryLimit(memoryLimit: number): boolean {
  return typeof memoryLimit === 'number' && memoryLimit > 0 && memoryLimit <= 1024
}

export function validateTags(tags: unknown): boolean {
  if (!Array.isArray(tags)) {
    return false
  }
  return tags.every(tag => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 50)
}

export function validateTestCases(testCases: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!Array.isArray(testCases)) {
    return { valid: false, errors: ['测试用例必须是数组'] }
  }

  if (testCases.length === 0) {
    return { valid: true, errors: [] }
  }

  testCases.forEach((tc, index) => {
    if (!tc || typeof tc !== 'object') {
      errors.push(`测试用例 ${index + 1} 格式无效`)
      return
    }

    const testCase = tc as Record<string, unknown>

    if (testCase.input === undefined || testCase.input === null) {
      errors.push(`测试用例 ${index + 1} 缺少输入`)
    }

    if (testCase.output === undefined || testCase.output === null) {
      errors.push(`测试用例 ${index + 1} 缺少输出`)
    }

    if (typeof testCase.score === 'number' && (testCase.score < 0 || testCase.score > 100)) {
      errors.push(`测试用例 ${index + 1} 分数必须在 0-100 之间`)
    }
  })

  return {
    valid: errors.length === 0,
    errors
  }
}

export function validateContestTitle(title: string): boolean {
  if (!title || typeof title !== 'string') {
    return false
  }
  const trimmed = title.trim()
  return trimmed.length >= 1 && trimmed.length <= 200
}

export function validateContestDescription(description: string): boolean {
  if (!description || typeof description !== 'string') {
    return false
  }
  return description.trim().length >= 10
}

export function validateContestTime(startTime: Date, endTime: Date): boolean {
  if (!(startTime instanceof Date) || !(endTime instanceof Date)) {
    return false
  }
  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    return false
  }
  return endTime > startTime
}

export function validateClassName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false
  }
  const trimmed = name.trim()
  return trimmed.length >= 2 && trimmed.length <= 50
}

export function validateClassDescription(description: string): boolean {
  if (!description || typeof description !== 'string') {
    return false
  }
  return description.length <= 1000
}

export function validateSolutionTitle(title: string): boolean {
  if (!title || typeof title !== 'string') {
    return false
  }
  const trimmed = title.trim()
  return trimmed.length >= 1 && trimmed.length <= 200
}

export function validateSolutionContent(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false
  }
  return content.trim().length >= 10
}

export function validateAiPrompt(prompt: string): boolean {
  if (!prompt || typeof prompt !== 'string') {
    return false
  }
  const trimmed = prompt.trim()
  return trimmed.length >= 10 && trimmed.length <= 5000
}

export function validateUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false
  }
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export function validateFileSize(size: number, maxSize: number): boolean {
  return typeof size === 'number' && size >= 0 && size <= maxSize
}

export function validateFileType(filename: string, allowedTypes: string[]): boolean {
  if (!filename || typeof filename !== 'string') {
    return false
  }
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext ? allowedTypes.includes(ext) : false
}
