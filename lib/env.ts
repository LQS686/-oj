/**
 * lib/env.ts
 * 环境变量集中校验入口（P1-3 修复）
 *
 * 背景：
 *   之前散落在 server.ts / lib/auth/index.ts / lib/crypto.ts / lib/prisma.ts 的
 *   校验逻辑重复且 next dev 路径完全跳过。统一在这里校验 + 触发。
 *
 * 校验范围：
 *   - JWT_SECRET（必填，长度 ≥ 32）
 *   - DATABASE_URL（必填，协议 mongodb）
 *   - AI_CONFIG_ENCRYPTION_KEY（**可选**，缺失仅 warn；AI 功能模块自校验）
 *   - FRONTEND_URL（生产必填，用于 WebSocket CORS；缺失仅 warn）
 *   - NODE_ENV（默认 'development'）
 *
 * 启动行为：
 *   - 通过 `validateEnvironment()` 主动触发校验
 *   - 缺关键变量时输出修复指引并 throw
 *   - 缺非关键变量时 logger.warn
 */

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

let validated = false

export interface EnvironmentCheckResult {
  ok: boolean
  missing: string[]
  warnings: string[]
}

function checkJwtSecret(): string | null {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.trim() === '') {
    return 'JWT_SECRET 缺失。请在 .env 文件中设置：\n  JWT_SECRET="<至少 32 字符的强随机字符串>"\n  生成示例：node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"'
  }
  if (secret.length < 32) {
    return `JWT_SECRET 长度不足（${secret.length} < 32），存在被暴力破解风险。请使用至少 32 字符的强随机字符串。`
  }
  return null
}

function checkDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL
  if (!url || url.trim() === '') {
    return 'DATABASE_URL 缺失。请在 .env 中设置 MongoDB 连接字符串。'
  }
  if (!url.startsWith('mongodb')) {
    return `DATABASE_URL 协议应为 mongodb:// 或 mongodb+srv://，当前为 ${url.split('://')[0]}`
  }
  return null
}

function checkEncryptionKey(): string | null {
  const key = process.env.AI_CONFIG_ENCRYPTION_KEY
  if (!key || key.trim() === '') {
    return 'AI_CONFIG_ENCRYPTION_KEY 缺失。AI Provider API Key 加密功能将不可用。\n  生成示例：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
  }
  // 检查是否为 32 字节（base64 44 字符 / hex 64 字符）
  const isBase64 = /^[A-Za-z0-9+/]{43}=$/.test(key) || /^[A-Za-z0-9+/]{43}$/.test(key)
  const isHex = /^[0-9a-fA-F]{64}$/.test(key)
  if (!isBase64 && !isHex) {
    return 'AI_CONFIG_ENCRYPTION_KEY 格式不正确。应为 32 字节的 base64（44 字符）或 hex（64 字符）字符串。'
  }
  return null
}

function checkFrontendUrl(): string | null {
  if (process.env.NODE_ENV !== 'production') return null
  const url = process.env.FRONTEND_URL
  if (!url || url.trim() === '') {
    return 'FRONTEND_URL 缺失。WebSocket CORS 在生产环境将默认放行所有源。'
  }
  try {
    new URL(url)
  } catch {
    return `FRONTEND_URL 不是合法 URL：${url}`
  }
  return null
}

function checkTz(): string | null {
  if (process.env.NODE_ENV === 'production' && !process.env.TZ) {
    return '生产环境建议设置 TZ 环境变量（如 TZ=Asia/Shanghai），确保日期时间处理一致'
  }
  return null
}

/**
 * 校验 JUDGE_* 关键评测变量。
 * 项目约束：AI 服务操作使用事务，MongoDB 事务要求副本集（DATABASE_URL 含 replicaSet）。
 * 这里仅在 warn 级别提示，不阻塞启动（开发环境可能使用单机 MongoDB）。
 */
function checkJudgeAndMongoReplica(): string[] {
  const warnings: string[] = []

  // 1) 评测相关变量：缺失时使用代码默认值，但显式提示便于排查
  const judgeVars: Record<string, string> = {
    JUDGE_MAX_CONCURRENT: '评测并发数（默认 1）',
    JUDGE_JOB_TIMEOUT: '单次评测任务超时秒数（默认 300）',
    JUDGE_COMPILE_TIMEOUT: '编译超时毫秒数（默认 20000）',
    JUDGE_EXTRA_TIME_RATIO: '评测额外时间比例（默认 0.1）',
    JUDGE_REJUDGE_TIMES: '临界 TLE 重测次数（默认 1）',
  }
  for (const [k, desc] of Object.entries(judgeVars)) {
    if (process.env[k] === undefined) {
      // 仅在 production 提示，dev 环境使用默认值即可
      if (process.env.NODE_ENV === 'production') {
        warnings.push(`${k} 未设置，使用代码默认值（${desc}）`)
      }
    }
  }

  // 2) AI 服务相关变量
  const aiVars: Record<string, string> = {
    AI_JOB_TIMEOUT_MS: 'AI 生成任务超时毫秒数（默认 300000）',
    AI_SOLUTION_TIMEOUT_MS: 'AI 题解生成超时毫秒数（默认 180000）',
    AI_SOLUTION_MAX_CONCURRENT: 'AI 题解生成最大并发数（默认 2）',
  }
  for (const [k, desc] of Object.entries(aiVars)) {
    if (process.env[k] === undefined && process.env.NODE_ENV === 'production') {
      warnings.push(`${k} 未设置，使用代码默认值（${desc}）`)
    }
  }

  // 3) MongoDB 副本集检测：项目硬约束要求 AI 服务使用事务，
  //    MongoDB 事务仅支持副本集（或分片集群）。生产环境缺失 replicaSet 会导致事务失败。
  const dbUrl = process.env.DATABASE_URL || ''
  if (dbUrl && process.env.NODE_ENV === 'production') {
    if (!/replicaSet\s*=/.test(dbUrl)) {
      warnings.push(
        'DATABASE_URL 未包含 replicaSet 参数。AI 服务事务操作将失败。' +
        '请在 MongoDB 连接字符串中追加 ?replicaSet=rs0'
      )
    }
  }

  return warnings
}

/**
 * 执行完整环境变量校验。
 * - 缺关键变量：抛出 Error（含修复指引）
 * - 缺非关键变量：logger.warn
 * - 可多次调用，已校验过则直接返回
 */
export function validateEnvironment(): EnvironmentCheckResult {
  if (validated) {
    return { ok: true, missing: [], warnings: [] }
  }

  const isProd = process.env.NODE_ENV === 'production'
  const errors: string[] = []
  const warnings: string[] = []

  // JWT_SECRET：所有环境必填
  const jwtErr = checkJwtSecret()
  if (jwtErr) errors.push(jwtErr)

  // DATABASE_URL：所有环境必填
  const dbErr = checkDatabaseUrl()
  if (dbErr) errors.push(dbErr)

  // AI_CONFIG_ENCRYPTION_KEY：所有环境都仅 warn，不 throw。
  //   原因：
  //     1) AI 功能（题解生成/AI Provider 配置）是 P2 增强功能，不是核心 OJ 链路。
  //     2) 即便不配，OJ 题目提交、评测、用户系统都能正常工作。
  //     3) 严格 throw 会导致全新部署"只要不用 AI 就必须先生成密钥"，体验差。
  //   实际校验下移到 /api/admin/ai/providers 路由 handler：
  //     - GET 路由：缺密钥时 maskApiKey 降级为 ********
  //     - POST 路由：缺密钥时返回 400 提示用户配置
  const encErr = checkEncryptionKey()
  if (encErr) warnings.push(encErr)

  // FRONTEND_URL：仅生产必填
  const feErr = checkFrontendUrl()
  if (feErr) warnings.push(feErr)

  // TZ：生产环境建议设置，确保日期时间处理一致
  const tzErr = checkTz()
  if (tzErr) warnings.push(tzErr)

  // JUDGE_* / AI_* / MongoDB 副本集校验（仅生产环境 warn，dev 环境使用默认值）
  warnings.push(...checkJudgeAndMongoReplica())

  if (warnings.length > 0) {
    for (const w of warnings) {
      logger.warn(`[env] ${w}`)
    }
  }

  if (errors.length > 0) {
    const msg = ['环境变量校验失败：', ...errors.map((e, i) => `  ${i + 1}. ${e}`)].join('\n')
    logger.error('[env] ' + msg)
    throw new Error(msg)
  }

  validated = true
  // 校验 Prisma client 是否正确生成（warn 而非 throw：旧 client 仍可工作，仅功能降级）
  if (!(prisma as any).solutionView) {
    logger.warn('⚠️  Prisma client 未正确生成（缺少 solutionView 模型）。请运行: npx prisma generate')
  }
  logger.info('[env] 环境变量校验通过', {
    NODE_ENV: process.env.NODE_ENV || 'development',
    hasRedis: !!process.env.REDIS_URL,
    hasJudge: !!process.env.JUDGE_RUNNER_PATH,
  })
  return { ok: true, missing: [], warnings }
}

/**
 * 仅检查必要变量（不抛错，返回结果）
 */
export function checkEnvironment(): EnvironmentCheckResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (checkJwtSecret()) errors.push('JWT_SECRET')
  if (checkDatabaseUrl()) errors.push('DATABASE_URL')
  // AI 密钥始终为软警告，不影响 OJ 核心功能
  const encErr = checkEncryptionKey()
  if (encErr) warnings.push('AI_CONFIG_ENCRYPTION_KEY')
  const feErr = checkFrontendUrl()
  if (feErr) warnings.push('FRONTEND_URL')

  return { ok: errors.length === 0, missing: errors, warnings }
}