/**
 * WebSocket 服务器 - Socket.IO
 * 用于实时推送评测结果和系统通知
 */

import type { Server as HTTPServer } from 'http'
import type { Socket } from 'socket.io';
import { Server as SocketIOServer } from 'socket.io'
import { verifyToken, JWTPayload } from '@/lib/auth'
import { logger } from '@/lib/logger'

let io: SocketIOServer | null = null
// 定时器引用：优雅关闭时 clearInterval，避免资源泄漏
let rateLimitCleanupTimer: ReturnType<typeof setInterval> | null = null
let staleConnectionCleanupTimer: ReturnType<typeof setInterval> | null = null

const MAX_MESSAGE_SIZE = 1 * 1024 * 1024
const RATE_LIMIT_WINDOW = 60 * 1000
const RATE_LIMIT_MAX_CONNECTIONS = 10
const MAX_HEARTBEATS_PER_MINUTE = 30

const ALLOWED_EVENT_TYPES = [
  'join',
  'leave',
  'ping',
  'pong',
] as const

const connectionRateLimit = new Map<string, { count: number; resetAt: number }>()

function parseCookies(cookieString: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!cookieString) return cookies
  cookieString.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=')
    if (name && value) {
      cookies[name] = decodeURIComponent(value)
    }
  })
  return cookies
}

function cleanupRateLimit(): void {
  const now = Date.now()
  for (const [ip, data] of connectionRateLimit.entries()) {
    if (now > data.resetAt) {
      connectionRateLimit.delete(ip)
    }
  }
}

rateLimitCleanupTimer = setInterval(cleanupRateLimit, 60 * 1000)

async function authenticateSocket(socket: Socket): Promise<string | null> {
  try {
    const token = socket.handshake.auth.token || 
                  socket.handshake.headers.authorization?.replace('Bearer ', '') ||
                  parseCookies(socket.handshake.headers.cookie || '').token

    if (!token) {
      return null
    }

    const payload = verifyToken(token)
    if (!payload) {
      return null
    }

    return payload.userId
  } catch (error) {
    logger.error('❌ Socket 认证失败:', error)
    return null
  }
}

function getClientIP(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  return socket.handshake.address || 'unknown'
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
    pingInterval: 10000,
    pingTimeout: 5000,
    maxHttpBufferSize: MAX_MESSAGE_SIZE,
  })

  const connectedClients = new Map<string, { 
    socketId: string, 
    userId: string | null, 
    connectedAt: number, 
    heartbeatCount: number,
    heartbeatWindowStart: number,
    isAuthenticated: boolean
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

    const userId = await authenticateSocket(socket)
    const isAuthenticated = userId !== null

    logger.info(`✅ 客户端连接: ${socket.id}, IP=${clientIP}, 认证=${isAuthenticated}, 剩余配额=${rateCheck.remaining}`)
    
    connectedClients.set(socket.id, {
      socketId: socket.id,
      userId: userId,
      connectedAt: Date.now(),
      heartbeatCount: 0,
      heartbeatWindowStart: Date.now(),
      isAuthenticated: isAuthenticated
    })

    // P0 修复：所有客户端（含未认证）默认加入公共广播房间，
    // 但 broadcastMessage 改为房间隔离后，必须显式 join 才能收到。
    // 这里允许所有客户端加入（含未认证，因为 leaderboard 等公开信息），
    // joinPublicRoom 内部已做异常吞错。
    joinPublicRoom(socket)

    socket.use((packet, next) => {
      const [eventName, ...args] = packet
      const client = connectedClients.get(socket.id)
      
      if (!ALLOWED_EVENT_TYPES.includes(eventName as any)) {
        logger.warn(`⚠️  未知消息类型: ${eventName}, Socket=${socket.id}`)
        return next()
      }
      
      const messageSize = JSON.stringify(args).length
      if (messageSize > MAX_MESSAGE_SIZE) {
        logger.warn(`⚠️  消息大小超限: ${messageSize} bytes, Socket=${socket.id}, 事件=${eventName}`)
        return next(new Error('消息大小超过限制'))
      }
      
      if (eventName === 'join' || eventName === 'leave') {
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
        socket.join(roomName)
        logger.info(`用户 ${userId} 加入房间: ${roomName}`)
        
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

      socket.emit('pong')
      connectedClients.set(socket.id, client)
    })

    socket.conn.on('heartbeat_timeout', () => {
      logger.warn(`⚠️  心跳超时: ${socket.id}`)
      socket.disconnect(true)
    })
  })

  // 定期清理无效连接
  staleConnectionCleanupTimer = setInterval(() => {
    const now = Date.now()
    const timeoutThreshold = 5 * 60 * 1000 // 5分钟超时
    
    for (const [socketId, clientInfo] of connectedClients.entries()) {
      if (now - clientInfo.connectedAt > timeoutThreshold) {
        logger.warn(`⚠️  清理超时连接: ${socketId}`)
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
export function emitSubmissionUpdate(userId: string, data: { id: string; status: string; score: number; time?: number; memory?: number; passedTests?: number; totalTests?: number; problemId?: string; message?: string; testResults?: any[]; timeElapsedMs?: number }) {
  const ioInstance = getIO()
  if (!ioInstance) {
    logger.warn('⚠️  WebSocket 服务器未初始化，跳过推送')
    return
  }

  const roomName = `user:${userId}`
  ioInstance.to(roomName).emit('submission:update', data)
  logger.info(`📤 推送提交更新到用户 ${userId}:`, {
    id: data.id,
    status: data.status,
    score: data.score,
    time: data.time,
    memory: data.memory,
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
  ioInstance.to(roomName).emit('judge:progress', data)
  logger.info(`📊 推送评测进度到用户 ${userId}: ${data.currentTest}/${data.totalTests}`)
}

/**
 * 发送系统通知到指定用户
 */
export function emitNotification(userId: string, notification: {
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
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
export function joinPublicRoom(socket: any) {
  if (!socket) return
  try {
    socket.join(BROADCAST_PUBLIC_ROOM)
  } catch (e) {
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
