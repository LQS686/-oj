/**
 * 自定义 Next.js 服务器
 * 集成 WebSocket 支持
 */

// 必须最先导入：确保 globalThis.AsyncLocalStorage 在 next 加载前可用
import './lib/node-als-polyfill'

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { parse } from 'url'
import { join, extname, resolve, relative, isAbsolute, sep } from 'path'
import { readFile, access } from 'fs/promises'
import { timingSafeEqual } from 'crypto'
import next from 'next'
import { initWebSocketServer, closeWebSocket } from './lib/websocket/server'
import dotenv from 'dotenv'
import { logger } from './lib/logger'
import { saveChunk, isValidUploadId } from './lib/upload'
import { assertAvatarUploadOwner } from './lib/avatar-upload-registry'
import { ApiError, errorLike } from '@/lib/api/errors'
import { checkRateLimit, getClientIPFromHeaders } from './lib/rate-limit'
import jwt from 'jsonwebtoken'
import { isSecureAuthCookie, readAuthTokenFromCookieHeader } from './lib/auth/cookie'
import { csrfCookieName } from './lib/security/csrf'
import { validateEnvironment } from './lib/env'
import { formatStartupBanner } from './lib/build-info'
import {
  readBodyWithLimit,
  parseMultipart,
  extractMultipartBoundary,
} from './lib/http/multipart'
import { canAccessAdmin } from './lib/permissions'
import { getCachedUser } from './lib/api/handler'

/** 单个分片大小上限：与 chunk 路由一致 */
const MAX_CHUNK_SIZE = 2 * 1024 * 1024
const MAX_CHUNK_INDEX = 1000
const MAX_BODY_SIZE = 3 * 1024 * 1024 // 比 MAX_CHUNK_SIZE 多 1MB 余量
/** 题库导入 multipart 上限（与 IMPORT_MAX_FILE_BYTES 对齐，另留表单余量） */
const MAX_IMPORT_BODY_SIZE = 51 * 1024 * 1024


/**
 * 前置路由：直接用 Node 原生方式服务 /uploads/ 静态文件。
 *
 * 问题背景：Next.js 16 standalone 模式 + Turbopack 构建时，
 * public 目录的静态文件服务只覆盖构建时已存在的文件，
 * 运行时新增的头像文件（由用户上传）不会被服务，导致 404。
 *
 * 本函数在 Next.js handler 之前拦截 /uploads/ 请求，
 * 直接从文件系统读取并返回，绕开 Next.js 的静态文件服务。
 */
const STATIC_UPLOADS_DIR = join(process.cwd(), 'public', 'uploads')

const MIME_MAP: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

async function serveStaticUpload(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url || ''
  if (!url.startsWith('/uploads/')) return false

  // 安全：resolve + relative，禁止目录穿越。
  // 旧实现用 startsWith(base) 会被 /uploads/../uploads_evil/ 绕过。
  const decoded = decodeURIComponent(url.split('?')[0])
  const relativeUrl = decoded.replace(/^\/uploads\/?/, '')
  if (!relativeUrl || relativeUrl.includes('\0')) {
    res.statusCode = 403
    res.end('Forbidden')
    return true
  }
  const base = resolve(STATIC_UPLOADS_DIR)
  const filePath = resolve(base, relativeUrl)
  const rel = relative(base, filePath)
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    res.statusCode = 403
    res.end('Forbidden')
    return true
  }

  try {
    await access(filePath)
  } catch {
    // 文件不存在，返回 404（不经过 Next.js，减少日志噪音）
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain')
    res.end('Not Found')
    return true
  }

  const ext = extname(filePath).toLowerCase()
  const contentType = MIME_MAP[ext] || 'application/octet-stream'

  try {
    const fileBuffer = await readFile(filePath)
    res.statusCode = 200
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Content-Length', fileBuffer.length)
    res.end(fileBuffer)
  } catch {
    res.statusCode = 500
    res.end('Internal Server Error')
  }
  return true
}

/**
 * 直接处理头像分片上传请求（绕开 Next.js 路由层）
 * 修复「Response body object should not be disturbed or locked」：
 *   Next.js 16 在自定义 server 模式下处理 multipart/form-data 大 body 时，
 *   内部会先把 body 包装为 Web Request，期间会触发响应流被 disturbed/locked 错误。
 *   改在 server.ts 中用 Node 原生方式处理，彻底绕开 Next.js 的 Web Request 适配。
 */
async function handleAvatarChunkDirect(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!assertWriteSecurityRaw(req, res)) return true

  // 独立限流：绕过 Next middleware，需在此单独限制分片上传频率
  const clientIp = getClientIPFromHeaders(req.headers, req.socket?.remoteAddress)
  const rl = await checkRateLimit(`avatar-chunk:${clientIp}`, {
    maxRequests: 60,
    windowMs: 60_000,
    keyPrefix: 'avatar-chunk',
  })
  if (!rl.success) {
    writeJson(res, 429, {
      success: false,
      code: 'RATE_LIMITED',
      error: '上传过于频繁，请稍后再试',
      retryAfter: rl.retryAfter,
    })
    return true
  }

  const contentType = (req.headers['content-type'] as string) || ''
  logger.info('[chunk-direct] enter', { contentType: contentType.substring(0, 80), method: req.method })
  if (!contentType.includes('multipart/form-data')) {
    logger.warn('[chunk-direct] INVALID_CONTENT_TYPE', { contentType })
    writeJson(res, 400, { success: false, code: 'INVALID_CONTENT_TYPE', error: '请求必须是 multipart/form-data' })
    return true
  }

  // 鉴权：从 cookie / Authorization 头解析 JWT
  const user = await getUserFromRawRequest(req)
  logger.info('[chunk-direct] auth', { hasUser: !!user, userId: user?.id?.slice(0, 8) })
  if (!user) {
    writeJson(res, 401, { success: false, code: 'UNAUTHORIZED', error: '未登录' })
    return true
  }

  let body: Buffer
  try {
    body = await readBodyWithLimit(req, MAX_BODY_SIZE)
    logger.info('[chunk-direct] body read', { size: body.length })
  } catch (err: unknown) {
    const e = errorLike(err)
    if (e.message === 'PAYLOAD_TOO_LARGE') {
      writeJson(res, 413, { success: false, code: 'PAYLOAD_TOO_LARGE', error: '请求体过大' })
      return true
    }
    logger.error('读取 chunk body 失败', err instanceof Error ? err : new Error(String(err)))
    writeJson(res, 500, { success: false, code: 'READ_FAILED', error: '读取请求失败' })
    return true
  }

  const boundary = extractMultipartBoundary(contentType)
  if (!boundary) {
    writeJson(res, 400, { success: false, code: 'INVALID_BOUNDARY', error: 'multipart boundary 缺失' })
    return true
  }

  const parts = parseMultipart(body, boundary)
  logger.info('[chunk-direct] parsed parts', { count: parts.length, names: parts.map(p => p.name) })
  const uploadIdPart = parts.find(p => p.name === 'uploadId')
  const chunkIndexPart = parts.find(p => p.name === 'chunkIndex')
  const filePart = parts.find(p => p.name === 'file' && p.filename)

  if (!uploadIdPart || !chunkIndexPart || !filePart) {
    logger.warn('[chunk-direct] INVALID_PARAMS', {
      hasUploadId: !!uploadIdPart,
      hasChunkIndex: !!chunkIndexPart,
      hasFile: !!filePart,
      fileHasFilename: !!filePart?.filename,
    })
    writeJson(res, 400, { success: false, code: 'INVALID_PARAMS', error: 'Invalid params' })
    return true
  }

  const uploadId = uploadIdPart.data.toString('utf8').trim()
  const chunkIndex = parseInt(chunkIndexPart.data.toString('utf8').trim(), 10)
  const chunkBuffer = filePart.data

  if (!isValidUploadId(uploadId)) {
    logger.warn('[chunk-direct] INVALID_UPLOAD_ID', { uploadId })
    writeJson(res, 400, { success: false, code: 'INVALID_UPLOAD_ID', error: '无效的上传ID' })
    return true
  }

  try {
    await assertAvatarUploadOwner(uploadId, user.id)
  } catch (e) {
    if (e instanceof ApiError) {
      logger.warn('[chunk-direct] 鉴权失败', { code: e.code, message: e.message, uploadId: uploadId.slice(0, 8), userId: user.id.slice(0, 8) })
      writeJson(res, e.status, { success: false, code: e.code, error: e.message })
      return true
    }
    throw e
  }

  if (isNaN(chunkIndex) || chunkIndex < 0 || chunkIndex > MAX_CHUNK_INDEX) {
    writeJson(res, 400, { success: false, code: 'INVALID_CHUNK_INDEX', error: `chunkIndex 超出范围 (0-${MAX_CHUNK_INDEX})` })
    return true
  }

  if (chunkBuffer.length > MAX_CHUNK_SIZE) {
    writeJson(res, 400, { success: false, code: 'CHUNK_TOO_LARGE', error: `分片大小超过限制 (Max ${MAX_CHUNK_SIZE} bytes)` })
    return true
  }

  try {
    await saveChunk(uploadId, chunkIndex, chunkBuffer)
    writeJson(res, 200, { success: true, data: {} })
  } catch (e) {
    logger.error('saveChunk 失败', e instanceof Error ? e : new Error(String(e)))
    writeJson(res, 500, { success: false, code: 'SAVE_FAILED', error: '保存分片失败' })
  }
  return true
}

/**
 * 从 IncomingMessage 解析当前登录用户。
 * 校验 JWT 后走 getCachedUser（tokenVersion + isBanned），与 withApi 鉴权一致。
 */
async function getUserFromRawRequest(
  req: IncomingMessage
): Promise<{ id: string; role?: string; tokenVersion?: number } | null> {
  const cookieHeader = req.headers['cookie'] || ''
  const token = readAuthTokenFromCookieHeader(cookieHeader)
  if (!token) return null

  let userId: string | undefined
  let tokenVersion: number | undefined
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as
      | { userId?: string; tokenVersion?: number }
      | string
    if (typeof payload === 'object' && payload) {
      userId = payload.userId
      tokenVersion = payload.tokenVersion
    }
  } catch {
    return null
  }
  if (!userId) return null

  const user = await getCachedUser(userId, tokenVersion)
  if (!user) return null
  return { id: user.id, role: user.role, tokenVersion: user.tokenVersion }
}

/** 自定义 server 直通写接口：Origin + CSRF 双提交 */
function isAllowedOriginRaw(req: IncomingMessage): boolean {
  const host = req.headers['host']
  if (!host) return false
  const origin = req.headers['origin']
  const referer = req.headers['referer']
  if (origin) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  if (referer) {
    try {
      return new URL(referer).host === host
    } catch {
      return false
    }
  }
  return false
}

function verifyCsrfRaw(req: IncomingMessage): boolean {
  // 与 lib/security/csrf 一致：双提交 Cookie，无 Bearer 旁路
  const headerToken = String(req.headers['x-csrf-token'] || '').trim()
  if (!headerToken) return false

  const name = csrfCookieName(isSecureAuthCookie())
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const cookieHeader = req.headers['cookie'] || ''
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`))
  const cookieToken = decodeURIComponent((match?.[1] || '').trim())
  if (!cookieToken || headerToken.length !== cookieToken.length) return false
  try {
    return timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))
  } catch {
    return false
  }
}

function assertWriteSecurityRaw(req: IncomingMessage, res: ServerResponse): boolean {
  if (!isAllowedOriginRaw(req) || !verifyCsrfRaw(req)) {
    writeJson(res, 403, { success: false, code: 'CSRF_INVALID', error: '跨站请求被拒绝或 CSRF 校验失败' })
    return false
  }
  return true
}

/**
 * 直接处理题库批量导入 multipart（绕开 Next.js 路由层）
 * 与头像分片同因：大 ZIP + formData/body clone 会触发
 * 「Response body object should not be disturbed or locked」。
 */
async function handleProblemImportDirect(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (!assertWriteSecurityRaw(req, res)) return true

  const contentType = (req.headers['content-type'] as string) || ''
  if (!contentType.includes('multipart/form-data')) {
    // 非 multipart（JSON）仍走 Next.js 路由
    return false
  }

  const session = await getUserFromRawRequest(req)
  if (!session) {
    writeJson(res, 401, { success: false, code: 'UNAUTHORIZED', error: '未登录' })
    return true
  }

  const user = await getCachedUser(session.id, session.tokenVersion)
  if (!user || !canAccessAdmin(user)) {
    writeJson(res, 403, { success: false, code: 'FORBIDDEN', error: '需要管理员权限' })
    return true
  }

  let body: Buffer
  try {
    body = await readBodyWithLimit(req, MAX_IMPORT_BODY_SIZE)
  } catch (err: unknown) {
    const e = errorLike(err)
    if (e.message === 'PAYLOAD_TOO_LARGE') {
      writeJson(res, 413, {
        success: false,
        code: 'FILE_TOO_LARGE',
        error: '文件大小超过 50MB 限制',
      })
      return true
    }
    logger.error('读取题库导入 body 失败', err instanceof Error ? err : new Error(String(err)))
    writeJson(res, 500, { success: false, code: 'READ_FAILED', error: '读取请求失败' })
    return true
  }

  const boundary = extractMultipartBoundary(contentType)
  if (!boundary) {
    writeJson(res, 400, { success: false, code: 'INVALID_BOUNDARY', error: 'multipart boundary 缺失' })
    return true
  }

  try {
    const { executeProblemImport, VALID_IMPORT_FORMATS, IMPORT_MAX_FILE_BYTES } =
      await import('./lib/problem/import/execute')

    const parts = parseMultipart(body, boundary, {
      maxPartBytes: IMPORT_MAX_FILE_BYTES,
    })
    const formatPart = parts.find((p) => p.name === 'format')
    const optionsPart = parts.find((p) => p.name === 'options')
    const filePart = parts.find((p) => p.name === 'file')

    const formatStr = formatPart?.data.toString('utf8').trim() || ''
    if (!formatStr || !(VALID_IMPORT_FORMATS as string[]).includes(formatStr)) {
      writeJson(res, 400, {
        success: false,
        code: 'INVALID_FORMAT',
        error: `缺少或无效的 format 参数，支持: ${VALID_IMPORT_FORMATS.join(', ')}`,
      })
      return true
    }

    let rawOptions: unknown = {}
    if (optionsPart) {
      try {
        rawOptions = JSON.parse(optionsPart.data.toString('utf8'))
      } catch {
        writeJson(res, 400, {
          success: false,
          code: 'INVALID_OPTIONS',
          error: 'options 不是合法 JSON',
        })
        return true
      }
    }

    let content: Buffer | null = null
    if (formatStr !== 'codeforces') {
      if (!filePart || filePart.data.length === 0) {
        writeJson(res, 400, { success: false, code: 'NO_FILE', error: '未选择文件' })
        return true
      }
      if (filePart.data.length > IMPORT_MAX_FILE_BYTES) {
        writeJson(res, 413, {
          success: false,
          code: 'FILE_TOO_LARGE',
          error: '文件大小超过 50MB 限制',
        })
        return true
      }
      content = filePart.data
    }

    const result = await executeProblemImport({
      format: formatStr as typeof VALID_IMPORT_FORMATS[number],
      content,
      rawOptions,
      authorId: user.id,
    })
    writeJson(res, 200, { success: true, data: result })
  } catch (e) {
    if (e instanceof ApiError) {
      writeJson(res, e.status, { success: false, code: e.code, error: e.message })
      return true
    }
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'PART_TOO_LARGE') {
      writeJson(res, 413, {
        success: false,
        code: 'FILE_TOO_LARGE',
        error: '文件大小超过 50MB 限制',
      })
      return true
    }
    if (msg === 'TOO_MANY_PARTS') {
      writeJson(res, 400, {
        success: false,
        code: 'TOO_MANY_PARTS',
        error: '表单字段过多',
      })
      return true
    }
    logger.error('题库导入直通失败', e instanceof Error ? e : new Error(String(e)))
    writeJson(res, 500, { success: false, code: 'IMPORT_FAILED', error: '导入失败' })
  }
  return true
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

// 加载环境变量
dotenv.config()

const dev = process.env.NODE_ENV !== 'production'
// 必须绑定 0.0.0.0 而非 localhost，否则 Docker 容器外无法访问服务。
// Dockerfile 中已设置 ENV HOSTNAME="0.0.0.0"，这里读取环境变量以保持一致。
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

validateEnvironment()

// 参考 Hydro loader.ts：启动时输出 git hash + Node 版本 + 内存信息，
// 便于线上排查问题（日志聚合时可定位到具体 commit）。
logger.info(formatStartupBanner())

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
  const httpServer = createServer(async (req, res) => {
    try {
      // 前置路由：头像分片上传 chunk 路径在 Next.js 16 自定义 server 模式下
      // 会触发「Response body object should not be disturbed or locked」。
      // 在 server.ts 中用 Node 原生方式处理，绕开 Next.js 路由层。
      if (req.method === 'POST' && req.url === '/api/users/avatar/upload/chunk') {
        const handled = await handleAvatarChunkDirect(req, res)
        if (handled) return
      }

      // 前置路由：题库批量导入 multipart（大 ZIP）绕开 Next.js body 适配层
      if (
        req.method === 'POST' &&
        (req.url === '/api/admin/problems/import' ||
          req.url?.startsWith('/api/admin/problems/import?'))
      ) {
        const handled = await handleProblemImportDirect(req, res)
        if (handled) return
      }

      // 前置路由：直接服务 /uploads/ 静态文件
      // Next.js 16 standalone + Turbopack 构建时，public 目录的静态文件服务
      // 只覆盖构建时已存在的文件，运行时新增的头像文件不会被服务，导致 404。
      // 在 Next.js handler 之前拦截 /uploads/ 请求，用 Node 原生 fs 直接读取返回。
      if (await serveStaticUpload(req, res)) return

      const parsedUrl = parse(req.url!, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      // 自定义 server 兜底：仅在响应尚未开始写入时返回 500。
      // 修复「Response body object should not be disturbed or locked」：
      // Next.js App Router 在路由处理中可能已经部分写入响应流，
      // 此时再调用 res.statusCode/end 会抛 ERR_STREAM_DESTROYED 等错误。
      // 通过 res.headersSent 判断是否可安全写入。
      logger.error('自定义 server 兜底捕获错误', err)
      if (!res.headersSent && !res.writableEnded) {
        res.statusCode = 500
        try {
          res.end('Internal Server Error')
        } catch (writeErr) {
          logger.error('兜底写入响应失败', writeErr)
        }
      }
    }
  })

  // 初始化 WebSocket 服务器
  initWebSocketServer(httpServer)
  logger.info('WebSocket 服务器初始化完成')

  // WebSocket 初始化后，再启动评测 Worker
  // 必须 await 确保 Worker 事件监听器在服务器开始接收请求前注册完毕，
  // 否则首次提交若评测很快完成（如编译错误），completed 事件会因无监听器而丢失，
  // 导致提交永远停留在 Pending 状态，表现为"评测超时"。
  logger.info('启动评测 Worker')
  await import('./lib/judge/init')
  logger.info('评测 Worker 启动完成')

  httpServer.listen(port, () => {
    logger.info(`服务器运行在 http://${hostname}:${port}`)
    logger.info(`WebSocket 服务在 ws://${hostname}:${port}/socket.io`)
  })

  // ----------------------------------------------------------------
  // 优雅关闭：收到 SIGTERM/SIGINT 时停止接收新请求、关闭各连接与队列
  // 各步骤用 try/catch 包裹，任一失败不阻塞后续；并行关闭以加速；带 10s 兜底超时
  // ----------------------------------------------------------------
  let isShuttingDown = false

  function gracefulShutdown(signal: string): void {
    if (isShuttingDown) {
      logger.warn(`再次收到 ${signal} 信号，强制退出`)
      process.exit(1)
      return
    }
    isShuttingDown = true
    logger.info(`收到关闭信号（${signal}），开始优雅关闭...`)

    // 10 秒兜底超时：防止 in-flight 请求或 keep-alive 连接导致进程长时间挂起
    const forceExitTimer = setTimeout(() => {
      logger.error('优雅关闭超时（10s），强制退出')
      process.exit(1)
    }, 10000)

    // 动态导入避免在 dotenv 加载前初始化 prisma/redis（这些模块在加载时读取环境变量）
    Promise.all([
      import('./lib/judge/queue'),
      import('./lib/judge/worker'),
      import('./lib/redis'),
      import('./lib/prisma'),
      import('./lib/mongodb/client'),
      import('./lib/rate-limit'),
    ]).then(([{ judgeQueue }, { disposeWorker }, { getRedisClient }, { prisma }, { closeMongoClient }, { destroyMemoryRateLimitStore }]) => {
      const tasks: Promise<void>[] = [
        // 1. 停止接收新请求，等待 in-flight 请求结束
        new Promise<void>((resolve) => {
          httpServer.close((err) => {
            if (err) logger.error('停止 HTTP 服务器失败', err)
            else logger.info('HTTP 服务器已停止接收新请求')
            resolve()
          })
        }),
        // 2. 关闭 Socket.IO + 清理 WebSocket 定时器
        Promise.resolve().then(() => {
          try {
            closeWebSocket()
            logger.info('WebSocket 服务器已关闭')
          } catch (e) {
            logger.error('关闭 WebSocket 失败', e)
          }
        }),
        // 3. 释放评测队列资源（停止死任务检测定时器）
        Promise.resolve().then(() => {
          try {
            judgeQueue.dispose()
            logger.info('评测队列资源已释放')
          } catch (e) {
            logger.error('释放评测队列失败', e)
          }
        }),
        // 4. 释放评测 Worker 定时器（statsInterval / cleanupInterval）
        Promise.resolve().then(() => {
          try {
            disposeWorker()
            logger.info('评测 Worker 定时器已清理')
          } catch (e) {
            logger.error('清理评测 Worker 定时器失败', e)
          }
        }),
        // 4b. 清理内存限流定时器
        Promise.resolve().then(() => {
          try {
            destroyMemoryRateLimitStore()
            logger.info('内存限流 Store 已清理')
          } catch (e) {
            logger.error('清理内存限流 Store 失败', e)
          }
        }),
        // 5. 关闭 Redis 连接
        Promise.resolve().then(async () => {
          try {
            await getRedisClient().quit()
            logger.info('Redis 连接已关闭')
          } catch (e) {
            logger.error('关闭 Redis 失败', e)
          }
        }),
        // 6. 关闭原生 MongoDB 客户端（submission-direct / assignment-direct 等使用）
        Promise.resolve().then(async () => {
          try {
            await closeMongoClient()
          } catch (e) {
            logger.error('关闭 MongoDB 客户端失败', e)
          }
        }),
        // 7. 断开 Prisma 数据库连接
        Promise.resolve().then(async () => {
          try {
            await prisma.$disconnect()
            logger.info('Prisma 已断开连接')
          } catch (e) {
            logger.error('Prisma 断开失败', e)
          }
        }),
      ]

      // 评测队列（judgeQueue）无 dispose/drain 方法，跳过清理
      logger.info('评测队列无 dispose 方法，跳过 judgeQueue 清理')

      return Promise.allSettled(tasks)
    }).then(() => {
      clearTimeout(forceExitTimer)
      logger.info('优雅关闭完成，退出进程')
      process.exit(0)
    }).catch((e) => {
      logger.error('优雅关闭过程中发生未预期错误', e)
      clearTimeout(forceExitTimer)
      process.exit(1)
    })
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))

  // 修复 P0：注册全局未捕获异常 / Promise 拒绝处理器
  // 防止单次未捕获异常让 Node 进程进入未定义状态或泄漏文件描述符。
  process.on('unhandledRejection', (reason, _promise) => {
    logger.error('Unhandled Promise Rejection', reason instanceof Error ? reason : new Error(String(reason)))
  })
  process.on('uncaughtException', (err, origin) => {
    logger.error(`Uncaught Exception (origin: ${origin})`, err)
    // 生产环境触发 graceful shutdown，避免在不一致状态下继续运行
    if (process.env.NODE_ENV === 'production') {
      gracefulShutdown('uncaughtException')
    }
  })
})
