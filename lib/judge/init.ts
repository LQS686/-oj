/**
 * 评测系统初始化
 * 在应用启动时导入此模块以启动 Worker
 */

// 导入 Worker 以启动事件监听
import './worker'
import { logger } from '@/lib/logger'

logger.info('评测系统已初始化')

export {}
