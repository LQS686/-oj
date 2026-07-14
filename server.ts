/**
 * 自定义 Next.js 服务器
 * 集成 WebSocket 支持
 */

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { initWebSocketServer, closeWebSocket } from './lib/websocket/server'
import dotenv from 'dotenv'
import { logger } from './lib/logger'

// 加载环境变量
dotenv.config()

function validateEnvironment(): void {
  const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL']
  const missing: string[] = []

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar)
    }
  }

  if (missing.length > 0) {
    logger.error('缺少必需的环境变量:')
    missing.forEach(envVar => {
      logger.error(`缺少环境变量: ${envVar}`)
    })
    logger.error('请参考 .env.example 文件配置环境变量')
    process.exit(1)
  }

  // 校验 JWT_SECRET 不使用默认占位符
  const DEFAULT_JWT_SECRET = 'your-secure-random-string-at-least-32-characters-long'
  if (process.env.JWT_SECRET === DEFAULT_JWT_SECRET) {
    logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    logger.error('⚠️  JWT_SECRET 使用了默认占位符，存在严重安全风险！')
    logger.error('   请运行以下命令生成安全密钥并写入 .env：')
    logger.error('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
    logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    process.exit(1)
  }

  // 软必需：AI_CONFIG_ENCRYPTION_KEY 用于加密 AI 服务商的 API Key
  // 缺失时仅警告，不退出 — 但会：
  //   1) GET /api/admin/ai/providers 的 maskApiKey 降级为显示 ********
  //   2) POST /api/admin/ai/providers 拒绝写入并返回 400 提示
  //   3) encrypt() 抛错
  if (!process.env.AI_CONFIG_ENCRYPTION_KEY) {
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    logger.warn('⚠️  AI_CONFIG_ENCRYPTION_KEY 未配置！')
    logger.warn('   AI 服务商的 API Key 将无法加密存储与展示。')
    logger.warn('   请运行以下命令生成 32 字节密钥并写入 .env：')
    logger.warn('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  }

  logger.info('环境变量验证通过')
}

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

validateEnvironment()

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      logger.error('请求处理错误', err)
      res.statusCode = 500
      res.end('Internal Server Error')
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
})
