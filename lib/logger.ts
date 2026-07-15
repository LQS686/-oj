import type { NextRequest } from 'next/server';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  userId?: string;
  [key: string]: any;
}

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
let fs: any = null;
let path: any = null;
let LOG_DIR: string | null = null;

// 只在服务器端环境中导入 Node.js 核心模块
if (typeof window === 'undefined') {
  // 使用 ES 模块的动态导入
  import('fs').then(module => {
    fs = module.default;
    import('path').then(pathModule => {
      path = pathModule.default;
      LOG_DIR = path.join(process.cwd(), 'logs');
      
      // 确保日志目录存在
      if (fs && LOG_DIR && !fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }
    });
  });
}

function parseLogLevel(level: string | undefined): LogLevel {
  if (!level) return 'info';
  const normalized = level.toLowerCase() as LogLevel;
  return LOG_LEVELS.includes(normalized) ? normalized : 'info';
}

/**
 * 敏感字段脱敏
 * 递归遍历对象/数组，将指定字段的值替换为 ***REDACTED***，防止
 * password / token / cookie / apiKey / secret / authorization 等敏感字段泄漏到日志。
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'pwd',
  'token',
  'accessToken',
  'refreshToken',
  'jwt',
  'authorization',
  'cookie',
  'set-cookie',
  'apiKey',
  'apikey',
  'api_key',
  'secret',
  'encryptionKey',
  'privateKey',
  'sessionId',
  'csrfToken',
])

const REDACTED = '***REDACTED***'

function redactValue(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value

  if (seen.has(value as object)) return '[Circular]'
  seen.add(value as object)

  if (Array.isArray(value)) {
    return value.map(v => redactValue(v, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lowerKey = k.toLowerCase()
    const isSensitive = [...SENSITIVE_KEYS].some(s => lowerKey === s.toLowerCase() || lowerKey.includes(s.toLowerCase()))
    if (isSensitive && (typeof v === 'string' || typeof v === 'number')) {
      result[k] = REDACTED
    } else if (typeof v === 'string' && v.length > 0 && (lowerKey.includes('bearer') || /^eyJ[A-Za-z0-9_-]{20,}/.test(v))) {
      // JWT-like 字符串（eyJ... 开头）也脱敏
      result[k] = REDACTED
    } else if (typeof v === 'object' && v !== null) {
      result[k] = redactValue(v, seen)
    } else {
      result[k] = v
    }
  }
  return result
}

class Logger {
  private level: LogLevel;
  private defaultContext: LogContext = {};

  constructor() {
    if (process.env.LOG_LEVEL) {
      this.level = parseLogLevel(process.env.LOG_LEVEL);
    } else if (process.env.NODE_ENV === 'development') {
      this.level = 'debug';
    } else {
      this.level = 'info';
    }
  }

  setContext(context: LogContext) {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  clearContext() {
    this.defaultContext = {};
  }

  private formatMessage(level: LogLevel, message: string, meta?: any, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const mergedContext = redactValue({ ...this.defaultContext, ...context });
    return {
      timestamp,
      level,
      message,
      ...(Object.keys(mergedContext as object).length > 0 && { context: mergedContext }),
      ...(meta && { meta: redactValue(meta) }),
    };
  }

  private writeToFile(level: LogLevel, message: string, meta?: any, context?: LogContext) {
    // 只在服务器端环境中执行文件写入操作，并且确保 fs 和 path 已经加载
    if (typeof window === 'undefined' && fs && path && LOG_DIR) {
      const logMessage = this.formatMessage(level, message, meta, context);
      const logFilePath = path.join(LOG_DIR, `${level}.log`);
      
      try {
        fs.appendFileSync(logFilePath, JSON.stringify(logMessage) + '\n');
        
        // 检查文件大小，超过10MB则轮转
        const stats = fs.statSync(logFilePath);
        if (stats.size > 10 * 1024 * 1024) { // 10MB
          const backupPath = path.join(LOG_DIR, `${level}.log.${Date.now()}`);
          fs.renameSync(logFilePath, backupPath);
        }
      } catch (error) {
        console.error('Failed to write log to file:', error);
      }
    }
  }

  debug(message: string, meta?: any, context?: LogContext) {
    if (this.shouldLog('debug')) {
      const logMessage = this.formatMessage('debug', message, meta, context);
      console.debug(JSON.stringify(logMessage));
      this.writeToFile('debug', message, meta, context);
    }
  }

  info(message: string, meta?: any, context?: LogContext) {
    if (this.shouldLog('info')) {
      const logMessage = this.formatMessage('info', message, meta, context);
      console.info(JSON.stringify(logMessage));
      this.writeToFile('info', message, meta, context);
    }
  }

  warn(message: string, meta?: any, context?: LogContext) {
    if (this.shouldLog('warn')) {
      const logMessage = this.formatMessage('warn', message, meta, context);
      console.warn(JSON.stringify(logMessage));
      this.writeToFile('warn', message, meta, context);
    }
  }

  error(message: string, error?: any, context?: LogContext) {
    if (this.shouldLog('error')) {
      let errorMeta: unknown = error;
      if (error instanceof Error) {
        const { name, message: errMsg, stack, ...rest } = error;
        errorMeta = {
          name,
          message: errMsg,
          stack,
          ...rest
        };
      }
      // 修复：errorMeta 也走脱敏（防止错误对象含敏感字段）
      const redactedErrorMeta = redactValue(errorMeta);
      const logMessage = this.formatMessage('error', message, redactedErrorMeta, context);
      console.error(JSON.stringify(logMessage));
      this.writeToFile('error', message, redactedErrorMeta, context);
    }
  }

  // 记录请求日志
  logRequest(request: NextRequest, responseStatus: number, responseTime: number, context?: LogContext) {
    const url = request.url;
    const method = request.method;
    const userAgent = request.headers.get('user-agent');
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    
    const requestMeta = {
      url,
      method,
      status: responseStatus,
      responseTime,
      userAgent,
      ip
    };
    
    this.info('Request processed', requestMeta, context);
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(this.level);
  }

  withContext(context: LogContext): ContextualLogger {
    return new ContextualLogger(this, context);
  }
}

class ContextualLogger {
  constructor(private logger: Logger, private context: LogContext) {}

  debug(message: string, meta?: any) {
    this.logger.debug(message, meta, this.context);
  }

  info(message: string, meta?: any) {
    this.logger.info(message, meta, this.context);
  }

  warn(message: string, meta?: any) {
    this.logger.warn(message, meta, this.context);
  }

  error(message: string, error?: any) {
    this.logger.error(message, error, this.context);
  }

  logRequest(request: NextRequest, responseStatus: number, responseTime: number) {
    this.logger.logRequest(request, responseStatus, responseTime, this.context);
  }
}

export const logger = new Logger();
