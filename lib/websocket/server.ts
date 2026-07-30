/**
 * WebSocket 服务器 - Socket.IO
 * 用于实时推送评测结果和系统通知
 */

import type { Server as HTTPServer } from 'http'
import type { Socket } from 'socket.io';
import { Server as SocketIOServer } from 'socket.io'
import type { JWTPayload } from '@/lib/auth';
import { verifyToken } from '@/lib/auth'
import { canAccessAdmin } from '@/lib/permissions'
import { logger } from '@/lib/logger'
import { resolveClientIp } from '@/lib/http/client-ip'
import { readAuthTokenFromCookieHeader } from '@/lib/auth/cookie'

let io: SocketIOServer | null = null
// 定时器引用：优雅关闭时 clearInterval，避免资源泄漏
let rateLimitCleanupTimer: ReturnType<typeof setInterval> | null = null
let staleConnectionCleanupTimer: ReturnType<typeof setInterval> | null = null

const MAX_MESSAGE_SIZE = 1 * 1024 * 1024
const RATE_LIMIT_WINDOW = 60 * 1000
// 开发环境放宽连接限流：Next.js HMR / Turbopack 每次保存都触发客户端重连，
// 加上多个 socket hook（useSubmissionSocket / useNotificationSocket / useAnnouncementSocket）
// 各自建立独立连接，10次/分钟会频繁触发"连接过于频繁"误报。
// 生产环境保持 10 次/分钟严格限流，防御恶意客户端。
const RATE_LIMIT_MAX_CONNECTIONS = process.env.NODE_ENV === 'development' ? 100 : 10
const MAX_HEARTBEATS_PER_MINUTE = 30

const ALLOWED_EVENT_TYPES = [
  'join',
  'leave',
  'watchSubmission',
  'unwatchSubmission',
  'ping',
  'pong',
] as const

function submissionRoom(submissionId: string) {
  return `submission:${submissionId}`
}

const connectionRateLimit = new Map<string, { count: number; resetAt: number }>()

function cleanupRateLimit(): void {
  const now = Date.now()
  for (const [ip, data] of connectionRateLimit.entries()) {
    if (now > data.resetAt) {
      connectionRateLimit.delete(ip)
    }
  }
}

rateLimitCleanupTimer = setInterval(cleanupRateLimit, 60 * 1000)

async function authenticateSocket(socket: Socket): Promise<JWTPayload | null> {
  try {
    const token =
      readAuthTokenFromCookieHeader(socket.handshake.headers.cookie || '')

    if (!token) {
      return null
    }

    const payload = verifyToken(token)
    if (!payload?.userId) return null

    // 校验 tokenVersion / isBanned，与 HTTP withApi 一致
    const { getCachedUser } = await import('@/lib/api/handler')
    const user = await getCachedUser(payload.userId, payload.tokenVersion)
    if (!user) return null

    return {
      ...payload,
      role: user.role,
      username: user.username,
      email: user.email || payload.email,
    }
  } catch (error) {
    logger.error('❌ Socket 认证失败:', error)
    return null
  }
}

function getClientIP(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for']
  const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return resolveClientIp(forwardedStr, socket.handshake.address || null)
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const record = connectionRateLimit.get(ip)

  if (!record || now > record.resetAt) {
    connectionRateLimit.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW
    })
    return { allowed: true, remaining: RATE_LIMIT_MAX_CONNECTIONS - 1 }
  }

  if (record.count >= RATE_LIMIT_MAX_CONNECTIONS) {
    return { allowed: false, remaining: 0 }
  }

  record.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX_CONNECTIONS - record.count }
}

/**
 * 初始化 WebSocket 服务器
 */
export function initWebSocketServer(httpServer: HTTPServer) {
  if (io) {
    logger.info('⚠️  WebSocket 服务器已存在')
    return io
  }

  logger.info('🔧 正在初始化 WebSocket 服务器...')
  
  io = new SocketIOServer(httpServer, {
    cors: {
      // P2 安全修复：开发环境不再使用通配 '*'，仅允许本地 Next.js 默认端口访问
      origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io/',
    // 仅 WebSocket：禁止 Engine.IO HTTP long-polling，降低延迟与代理歧义
    transports: ['websocket'],
    allowUpgrades: false,
    pingInterval: 10000,
    pingTimeout: 5000,
    maxHttpBufferSize: MAX_MESSAGE_SIZE,
  })

  const connectedClients = new Map<string, {
    socketId: string
    userId: string | null
    role: string | null
    tokenVersion: number | null
    /** 最近活跃时间（心跳刷新）；用于清理僵尸连接，勿用「建连年龄」 */
    lastSeenAt: number
    heartbeatCount: number
    heartbeatWindowStart: number
    isAuthenticated: boolean
    watchedSubmissionId: string | null
  }>()

  io.on('connection', async (socket) => {
    const clientIP = getClientIP(socket)
    
    const rateCheck = checkRateLimit(clientIP)
    if (!rateCheck.allowed) {
      logger.warn(`连接被速率限制拒绝: IP=${clientIP}, Socket=${socket.id}`)
      socket.emit('error', { event: 'connection', message: '连接过于频繁，请稍后再试' })
      socket.disconnect(true)
      return
    }

    const auth = await authenticateSocket(socket)
    const isAuthenticated = auth !== null

    logger.info(`✅ 客户端连接: ${socket.id}, IP=${clientIP}, 认证=${isAuthenticated}, 剩余配额=${rateCheck.remaining}`)
    
    connectedClients.set(socket.id, {
      socketId: socket.id,
      userId: auth?.userId ?? null,
      role: auth?.role ?? null,
      tokenVersion: typeof auth?.tokenVersion === 'number' ? auth.tokenVersion : null,
      lastSeenAt: Date.now(),
      heartbeatCount: 0,
      heartbeatWindowStart: Date.now(),
      isAuthenticated: isAuthenticated,
      watchedSubmissionId: null,
    })

    // P0 修复：所有客户端（含未认证）默认加入公共广播房间，
    // 但 broadcastMessage 改为房间隔离后，必须显式 join 才能收到。
    // 这里允许所有客户端加入（含未认证，因为 leaderboard 等公开信息），
    // joinPublicRoom 内部已做异常吞错。
    joinPublicRoom(socket)

    // 根因修复：认证成功后立刻加入 user:{id}，不依赖客户端 emit('join')。
    // 旧路径存在竞态——connection 里 await 认证期间 join 监听器尚未注册，
    // 客户端 connect 后立刻 emit('join') 会被丢掉，房间为空，
    // io.to(room).emit 仍“成功”但无人接收，弹窗永久停在「评测中」。
    if (auth?.userId) {
      const roomName = `user:${auth.userId}`
      socket.join(roomName)
      logger.info(`用户 ${auth.userId} 已自动加入房间: ${roomName}`)
      socket.emit('joined', { userId: auth.userId, room: roomName })
    }

    socket.use((packet, next) => {
      const [eventName, ...args] = packet
      const client = connectedClients.get(socket.id)
      if (client) {
        client.lastSeenAt = Date.now()
        connectedClients.set(socket.id, client)
      }
      
      if (!ALLOWED_EVENT_TYPES.includes(eventName as typeof ALLOWED_EVENT_TYPES[number])) {
        logger.warn(`⚠️  未知消息类型: ${eventName}, Socket=${socket.id}`)
        return next()
      }
      
      const messageSize = JSON.stringify(args).length
      if (messageSize > MAX_MESSAGE_SIZE) {
        logger.warn(`⚠️  消息大小超限: ${messageSize} bytes, Socket=${socket.id}, 事件=${eventName}`)
        return next(new Error('消息大小超过限制'))
      }
      
      if (
        eventName === 'join' ||
        eventName === 'leave' ||
        eventName === 'watchSubmission' ||
        eventName === 'unwatchSubmission'
      ) {
        if (!client?.isAuthenticated) {
          logger.warn(`🚫 未认证用户尝试访问私有房间: Socket=${socket.id}, 事件=${eventName}`)
          socket.emit('error', { event: eventName, message: '请先认证后再访问私有房间' })
          return next(new Error('未认证'))
        }
      }
      
      next()
    })

    socket.on('join', (data: string | { userId: string; token?: string }) => {
      try {
        const client = connectedClients.get(socket.id)
        if (!client?.isAuthenticated) {
          logger.warn(`🚫 未认证用户尝试加入私有房间: Socket=${socket.id}`)
          socket.emit('error', { event: 'join', message: '请先认证后再加入私有房间' })
          return
        }

        let userId: string
        if (typeof data === 'string') {
          userId = data
        } else {
          userId = data.userId
        }

        if (!userId) {
          logger.error('join 事件缺少 userId')
          socket.emit('error', { event: 'join', message: '缺少 userId 参数' })
          return
        }
        
        if (client.userId && client.userId !== userId) {
          logger.warn(`用户ID不匹配: Socket=${socket.id}, 认证用户=${client.userId}, 请求用户=${userId}`)
          socket.emit('error', { event: 'join', message: '用户ID不匹配' })
          return
        }
        
        const roomName = `user:${userId}`
        const alreadyInRoom = socket.rooms.has(roomName)
        if (!alreadyInRoom) {
          socket.join(roomName)
          logger.info(`用户 ${userId} 加入房间: ${roomName}`)
        }
        client.userId = userId
        connectedClients.set(socket.id, client)
        socket.emit('joined', { userId, room: roomName })
      } catch (error) {
        logger.error('❌ 处理 join 事件错误:', error)
        socket.emit('error', { event: 'join', message: '处理加入房间失败' })
      }
    })

    socket.on('leave', (userId: string) => {
      try {
        const client = connectedClients.get(socket.id)
        if (!client?.isAuthenticated) {
          socket.emit('error', { event: 'leave', message: '请先认证后再操作' })
          return
        }

        if (!userId) {
          socket.emit('error', { event: 'leave', message: '缺少 userId 参数' })
          return
        }
        
        const roomName = `user:${userId}`
        socket.leave(roomName)
        logger.info(`👋 用户 ${userId} 离开房间: ${roomName}`)
        socket.emit('left', { userId, room: roomName })
      } catch (error) {
        logger.error('❌ 处理 leave 事件错误:', error)
        socket.emit('error', { event: 'leave', message: '处理离开房间失败' })
      }
    })

    /** 管理员订阅单条提交房间（查看他人提交详情，不依赖选手 user 房间） */
    socket.on('watchSubmission', async (submissionId: string) => {
      try {
        const client = connectedClients.get(socket.id)
        if (!client?.isAuthenticated || !client.userId) {
          socket.emit('error', { event: 'watchSubmission', message: '请先认证' })
          return
        }
        if (!submissionId || typeof submissionId !== 'string') {
          socket.emit('error', { event: 'watchSubmission', message: '缺少 submissionId' })
          return
        }
        // 实时查库角色，避免连接时缓存的旧 role 在降权后仍可订阅
        const { getCachedUser } = await import('@/lib/api/handler')
        const fresh = await getCachedUser(client.userId)
        if (!fresh || !canAccessAdmin(fresh)) {
          client.role = fresh?.role ?? client.role
          connectedClients.set(socket.id, client)
          socket.emit('error', { event: 'watchSubmission', message: '需要管理员权限' })
          return
        }
        client.role = fresh.role
        if (client.watchedSubmissionId) {
          socket.leave(submissionRoom(client.watchedSubmissionId))
        }
        const room = submissionRoom(submissionId)
        socket.join(room)
        client.watchedSubmissionId = submissionId
        connectedClients.set(socket.id, client)
        logger.info(`管理员 ${client.userId} 订阅提交房间: ${room}`)
        socket.emit('watchingSubmission', { submissionId, room })
      } catch (error) {
        logger.error('❌ 处理 watchSubmission 错误:', error)
        socket.emit('error', { event: 'watchSubmission', message: '订阅提交失败' })
      }
    })

    socket.on('unwatchSubmission', async (submissionId?: string) => {
      try {
        const client = connectedClients.get(socket.id)
        if (!client?.isAuthenticated || !client.userId) {
          socket.emit('error', { event: 'unwatchSubmission', message: '请先认证' })
          return
        }
        // 允许离开房间：降权后仍须能离房，避免继续接收提交推送
        const targetId = submissionId || client.watchedSubmissionId
        if (!targetId) return
        socket.leave(submissionRoom(targetId))
        if (client.watchedSubmissionId === targetId) {
          client.watchedSubmissionId = null
          connectedClients.set(socket.id, client)
        }
        socket.emit('unwatchedSubmission', { submissionId: targetId })
      } catch (error) {
        logger.error('❌ 处理 unwatchSubmission 错误:', error)
      }
    })

    socket.on('disconnect', (reason) => {
      logger.info(`❌ 客户端断开: ${socket.id}, 原因: ${reason}`)

      connectedClients.delete(socket.id)
    })

    socket.on('error', (error) => {
      logger.error('❌ Socket 错误:', error)
      socket.emit('error', { event: 'unknown', message: '发生未知错误' })
    })

    socket.on('ping', () => {
      const client = connectedClients.get(socket.id)
      if (!client) return

      const now = Date.now()
      client.lastSeenAt = now
      if (now - client.heartbeatWindowStart > 60 * 1000) {
        client.heartbeatCount = 1
        client.heartbeatWindowStart = now
      } else {
        client.heartbeatCount++
      }

      if (client.heartbeatCount > MAX_HEARTBEATS_PER_MINUTE) {
        logger.warn(`检测到异常心跳模式: Socket=${socket.id}, 心跳次数=${client.heartbeatCount}/分钟`)
        socket.emit('error', { event: 'ping', message: '心跳频率异常' })
        socket.disconnect(true)
        return
      }

      // 已认证连接：周期性复核 tokenVersion / 封禁，吊销后立即断开
      if (client.isAuthenticated && client.userId) {
        void (async () => {
          try {
            const { getCachedUser } = await import('@/lib/api/handler')
            const user = await getCachedUser(
              client.userId!,
              client.tokenVersion ?? undefined
            )
            if (!user) {
              logger.warn(`会话已失效，断开 WebSocket: user=${client.userId}, socket=${socket.id}`)
              socket.emit('error', { event: 'auth', message: '会话已失效，请重新登录' })
              socket.disconnect(true)
              return
            }
            client.role = user.role
            socket.emit('pong')
            connectedClients.set(socket.id, client)
          } catch (err) {
            logger.error('心跳会话复核失败', err)
            socket.emit('pong')
            connectedClients.set(socket.id, client)
          }
        })()
        return
      }

      socket.emit('pong')
      connectedClients.set(socket.id, client)
    })

    socket.conn.on('heartbeat_timeout', () => {
      logger.warn(`⚠️  心跳超时: ${socket.id}`)
      socket.disconnect(true)
    })
  })

  // 仅清理长时间无心跳的僵尸连接（Engine.IO ping 已覆盖正常超时；此处兜底）
  staleConnectionCleanupTimer = setInterval(() => {
    const now = Date.now()
    const idleThreshold = 5 * 60 * 1000

    for (const [socketId, clientInfo] of connectedClients.entries()) {
      if (now - clientInfo.lastSeenAt > idleThreshold) {
        logger.warn(`⚠️  清理空闲连接: ${socketId}`)
        const targetSocket = io?.sockets.sockets.get(socketId)
        if (targetSocket) {
          targetSocket.disconnect(true)
        }
        connectedClients.delete(socketId)
      }
    }
  }, 60 * 1000)

  logger.info('WebSocket 服务器已启动')
  logger.info(`WebSocket 实例状态: ${io ? '已初始化' : '未初始化'}`)
  return io
}

/**
 * 关闭 WebSocket 服务器并清理定时器
 * 供 server.ts 优雅关闭时调用：clearInterval 两个定时器 + io.close()
 */
export function closeWebSocket(): void {
  if (rateLimitCleanupTimer) {
    clearInterval(rateLimitCleanupTimer)
    rateLimitCleanupTimer = null
  }
  if (staleConnectionCleanupTimer) {
    clearInterval(staleConnectionCleanupTimer)
    staleConnectionCleanupTimer = null
  }
  if (io) {
    try {
      io.close()
    } catch (e) {
      logger.error('关闭 WebSocket 服务器失败', e)
    }
    io = null
  }
}

/**
 * 获取 WebSocket 服务器实例
 */
export function getIO(): SocketIOServer | null {
  if (!io) {
    logger.warn('⚠️  WebSocket 服务器尚未初始化')
    return null
  }
  return io
}

/**
 * 发送提交状态更新到指定用户
 */
export function emitSubmissionUpdate(userId: string, data: {
  id: string
  status: string
  score: number
  time?: number
  memory?: number
  passedTests?: number
  totalTests?: number
  problemId?: string
  message?: string
  testResults?: Array<{
    testId: string
    status: string
    time: number
    memory: number
    message?: string
  }>
  timeElapsedMs?: number
  assignmentSubmissionId?: string
}) {
  const ioInstance = getIO()
  if (!ioInstance) {
    logger.warn('⚠️  WebSocket 服务器未初始化，跳过推送')
    return
  }

  const roomName = `user:${userId}`
  const subRoom = submissionRoom(data.id)
  ioInstance.to(roomName).emit('submission:update', data)
  ioInstance.to(subRoom).emit('submission:update', data)

  // 异步核对房间人数，便于发现「推了但无人在房」的回归
  void ioInstance.in(roomName).fetchSockets().then((sockets) => {
    logger.info(`📤 推送提交更新到 ${roomName} / ${subRoom}:`, {
      id: data.id,
      status: data.status,
      score: data.score,
      time: data.time,
      memory: data.memory,
      roomSize: sockets.length,
    })
    if (sockets.length === 0) {
      logger.warn(`⚠️  提交更新推送时用户房间为空: ${roomName}，客户端可能未入房`)
    }
  }).catch(() => {
    logger.info(`📤 推送提交更新到 ${roomName} / ${subRoom}:`, {
      id: data.id,
      status: data.status,
      score: data.score,
    })
  })
}

/**
 * 发送评测进度到指定用户
 */
export function emitJudgeProgress(userId: string, data: {
  submissionId: string
  currentTest: number
  totalTests: number
  status: string
}) {
  const ioInstance = getIO()
  if (!ioInstance) return

  const roomName = `user:${userId}`
  const subRoom = submissionRoom(data.submissionId)
  ioInstance.to(roomName).emit('judge:progress', data)
  ioInstance.to(subRoom).emit('judge:progress', data)
  logger.info(`📊 推送评测进度到 ${roomName} / ${subRoom}: ${data.currentTest}/${data.totalTests}`)
}

/**
 * 发送系统通知到指定用户
 */
export function emitNotification(userId: string, notification: {
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  unreadCount?: number
  id?: string
}) {
  const ioInstance = getIO()
  if (!ioInstance) return

  const roomName = `user:${userId}`
  ioInstance.to(roomName).emit('notification', notification)
  logger.info(`🔔 发送通知到用户 ${userId}:`, notification.title)
}

/**
 * 广播消息到所有在线用户
 *
 * 修复 P0：改为房间隔离。
 *   - 之前用 ioInstance.emit(...) 推送给所有客户端（含未认证连接），
 *     可能导致跨用户信息泄漏。
 *   - 现在使用公共房间 'broadcast:public'，未订阅该房间的客户端拿不到。
 *   - 调用方需在用户 connect 时 socket.join('broadcast:public')。
 */
const BROADCAST_PUBLIC_ROOM = 'broadcast:public'

export function broadcastMessage(event: string, data: unknown) {
  const ioInstance = getIO()
  if (!ioInstance) return

  ioInstance.to(BROADCAST_PUBLIC_ROOM).emit(event, data)
  logger.info(`广播消息: ${event}`)
}

/**
 * 显式加入公共广播房间（已认证用户默认自动加入）
 */
export function joinPublicRoom(socket: Socket) {
  if (!socket) return
  try {
    socket.join(BROADCAST_PUBLIC_ROOM)
  } catch {
    // ignore
  }
}

/**
 * 获取在线用户数
 */
export function getOnlineUserCount(): number {
  const ioInstance = getIO()
  if (!ioInstance) return 0
  return ioInstance.sockets.sockets.size
}
