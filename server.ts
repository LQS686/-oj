/**
 * 自定义 Next.js 服务器
 * 集成 WebSocket 支持
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { parse } from 'url'
import next from 'next'
import { initWebSocketServer, closeWebSocket } from './lib/websocket/server'
import dotenv from 'dotenv'
import { logger } from './lib/logger'
import { saveChunk, isValidUploadId } from './lib/upload'
import { assertAvatarUploadOwner } from './lib/avatar-upload-registry'
import { getUserFromRequest } from './lib/auth'
import { ApiError } from './lib/api/withApi'
import jwt from 'jsonwebtoken'
import { validateEnvironment } from './lib/env'

/** 单个分片大小上限：与 chunk 路由一致 */
const MAX_CHUNK_SIZE = 2 * 1024 * 1024
const MAX_CHUNK_INDEX = 1000
const MAX_BODY_SIZE = 3 * 1024 * 1024 // 比 MAX_CHUNK_SIZE 多 1MB 余量

/**
 * 从 IncomingMessage 读取完整 body（带大小限制，防止 OOM）
 */
function readBodyWithLimit(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        req.destroy()
        reject(new Error('PAYLOAD_TOO_LARGE'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * 极简 multipart 解析（Node 原生 + 字符串搜索）
 * 输入：完整 body Buffer + boundary
 * 输出：[{ name, filename, contentType, data }]
 */
function parseMultipart(body: Buffer, boundary: string): Array<{
  name: string
  filename: string | null
  contentType: string | null
  data: Buffer
}> {
  const sep = Buffer.from(`--${boundary}`)
  const parts: Array<{
    name: string
    filename: string | null
    contentType: string | null
    data: Buffer
  }> = []

  let cursor = 0
  while (cursor < body.length) {
    const start = body.indexOf(sep, cursor)
    if (start === -1) break
    // 跳过 boundary 后的 \r\n
    let headerStart = start + sep.length
    if (body[headerStart] === 0x2d && body[headerStart + 1] === 0x2d) {
      // -- 结束标记
      break
    }
    if (body[headerStart] === 0x0d && body[headerStart + 1] === 0x0a) {
      headerStart += 2
    }
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), headerStart)
    if (headerEnd === -1) break
    const nextStart = body.indexOf(sep, headerEnd + 4)
    if (nextStart === -1) break
    // data 结束位置：nextStart 之前有 \r\n
    const dataEnd = nextStart - 2

    const headerBuf = body.subarray(headerStart, headerEnd).toString('utf8')
    const data = body.subarray(headerEnd + 4, dataEnd)

    const nameMatch = headerBuf.match(/name="([^"]+)"/i)
    const filenameMatch = headerBuf.match(/filename="([^"]*)"/i)
    const ctMatch = headerBuf.match(/Content-Type:\s*([^\r\n]+)/i)

    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch ? filenameMatch[1] : null,
        contentType: ctMatch ? ctMatch[1].trim() : null,
        data,
      })
    }
    cursor = nextStart
  }
  return parts
}

/**
 * 直接处理头像分片上传请求（绕开 Next.js 路由层）
 * 修复「Response body object should not be disturbed or locked」：
 *   Next.js 16 在自定义 server 模式下处理 multipart/form-data 大 body 时，
 *   内部会先把 body 包装为 Web Request，期间会触发响应流被 disturbed/locked 错误。
 *   改在 server.ts 中用 Node 原生方式处理，彻底绕开 Next.js 的 Web Request 适配。
 */
async function handleAvatarChunkDirect(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const contentType = (req.headers['content-type'] as string) || ''
  logger.info('[chunk-direct] enter', { contentType: contentType.substring(0, 80), method: req.method })
  if (!contentType.includes('multipart/form-data')) {
    logger.warn('[chunk-direct] INVALID_CONTENT_TYPE', { contentType })
    writeJson(res, 400, { ok: false, code: 'INVALID_CONTENT_TYPE', error: '请求必须是 multipart/form-data' })
    return true
  }

  // 鉴权：从 cookie / Authorization 头解析 JWT
  const user = await getUserFromRawRequest(req)
  logger.info('[chunk-direct] auth', { hasUser: !!user, userId: user?.id?.slice(0, 8) })
  if (!user) {
    writeJson(res, 401, { ok: false, code: 'UNAUTHORIZED', error: '未登录' })
    return true
  }

  let body: Buffer
  try {
    body = await readBodyWithLimit(req, MAX_BODY_SIZE)
    logger.info('[chunk-direct] body read', { size: body.length })
  } catch (e: any) {
    if (e?.message === 'PAYLOAD_TOO_LARGE') {
      writeJson(res, 413, { ok: false, code: 'PAYLOAD_TOO_LARGE', error: '请求体过大' })
      return true
    }
    logger.error('读取 chunk body 失败', e instanceof Error ? e : new Error(String(e)))
    writeJson(res, 500, { ok: false, code: 'READ_FAILED', error: '读取请求失败' })
    return true
  }

  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2]
  if (!boundary) {
    writeJson(res, 400, { ok: false, code: 'INVALID_BOUNDARY', error: 'multipart boundary 缺失' })
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
    writeJson(res, 400, { ok: false, code: 'INVALID_PARAMS', error: 'Invalid params' })
    return true
  }

  const uploadId = uploadIdPart.data.toString('utf8').trim()
  const chunkIndex = parseInt(chunkIndexPart.data.toString('utf8').trim(), 10)
  const chunkBuffer = filePart.data

  if (!isValidUploadId(uploadId)) {
    logger.warn('[chunk-direct] INVALID_UPLOAD_ID', { uploadId })
    writeJson(res, 400, { ok: false, code: 'INVALID_UPLOAD_ID', error: '无效的上传ID' })
    return true
  }

  try {
    assertAvatarUploadOwner(uploadId, user.id)
  } catch (e) {
    if (e instanceof ApiError) {
      logger.warn('[chunk-direct] 鉴权失败', { code: e.code, message: e.message, uploadId: uploadId.slice(0, 8), userId: user.id.slice(0, 8) })
      writeJson(res, e.status, { ok: false, code: e.code, error: e.message })
      return true
    }
    throw e
  }

  if (isNaN(chunkIndex) || chunkIndex < 0 || chunkIndex > MAX_CHUNK_INDEX) {
    writeJson(res, 400, { ok: false, code: 'INVALID_CHUNK_INDEX', error: `chunkIndex 超出范围 (0-${MAX_CHUNK_INDEX})` })
    return true
  }

  if (chunkBuffer.length > MAX_CHUNK_SIZE) {
    writeJson(res, 400, { ok: false, code: 'CHUNK_TOO_LARGE', error: `分片大小超过限制 (Max ${MAX_CHUNK_SIZE} bytes)` })
    return true
  }

  try {
    await saveChunk(uploadId, chunkIndex, chunkBuffer)
    writeJson(res, 200, { ok: true, success: true, data: {} })
  } catch (e) {
    logger.error('saveChunk 失败', e instanceof Error ? e : new Error(String(e)))
    writeJson(res, 500, { ok: false, code: 'SAVE_FAILED', error: '保存分片失败' })
  }
  return true
}

/**
 * 从 IncomingMessage 解析当前登录用户（与 getUserFromRequest 等价但接受 Node 原生 req）
 */
async function getUserFromRawRequest(req: IncomingMessage): Promise<{ id: string; role?: string } | null> {
  // 1. 从 Authorization 头解析 Bearer token
  const auth = req.headers['authorization']
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as any
      if (payload?.userId) return { id: payload.userId, role: payload.role }
    } catch {
      // ignore
    }
  }
  // 2. 从 cookie 解析 token
  const cookieHeader = req.headers['cookie'] || ''
  const tokenMatch = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/)
  if (tokenMatch) {
    try {
      const payload = jwt.verify(decodeURIComponent(tokenMatch[1]), process.env.JWT_SECRET!) as any
      if (payload?.userId) return { id: payload.userId, role: payload.role }
    } catch {
      // ignore
    }
  }
  // 3. 尝试 getUserFromRequest（NextRequest 形式，需要构造一个伪 request）
  //    简化处理：返回 null，让上层走完整 Next.js 路径
  return null
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
      import('./lib/redis'),
      import('./lib/prisma'),
    ]).then(([{ judgeQueue }, { getRedisClient }, { prisma }]) => {
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
        // 4. 关闭 Redis 连接
        Promise.resolve().then(async () => {
          try {
            await getRedisClient().quit()
            logger.info('Redis 连接已关闭')
          } catch (e) {
            logger.error('关闭 Redis 失败', e)
          }
        }),
        // 5. 断开 Prisma 数据库连接
        Promise.resolve().then(async () => {
          try {
            await prisma.$disconnect()
            logger.info('Prisma 已断开连接')
          } catch (e) {
            logger.error('Prisma 断开失败', e)
          }
        }),
      ]

      // AI 队列（aiQueue / solutionQueue）无 dispose/drain 方法，跳过清理
      logger.info('AI 队列无 dispose 方法，跳过 aiQueue/solutionQueue 清理')

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
  process.on('unhandledRejection', (reason, promise) => {
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
