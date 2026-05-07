/**
 * 自定义 Next.js 服务器
 * 集成 WebSocket 支持
 */

import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { initWebSocketServer } from './lib/websocket/server'
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

  logger.info('环境变量验证通过')
}

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

validateEnvironment()

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
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
  logger.info('启动评测 Worker')
  import('./lib/judge/init')
  logger.info('评测 Worker 启动完成')

  httpServer.listen(port, () => {
    logger.info(`服务器运行在 http://${hostname}:${port}`)
    logger.info(`WebSocket 服务在 ws://${hostname}:${port}/socket.io`)
  })
})
