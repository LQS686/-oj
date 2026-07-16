import { logger, formatLogTimestamp } from './logger';
import { redisCache } from './redis';

export interface ErrorStats {
  count: number;
  lastOccurred: string;
  occurrences: Array<{
    timestamp: string;
    message: string;
    stack?: string;
    context?: Record<string, any>;
  }>;
}

export interface ErrorThreshold {
  maxCount: number;
  timeWindow: number; // 时间窗口（秒）
  action: 'alert' | 'block' | 'log';
}

class ErrorMonitor {
  private errorStats: Map<string, ErrorStats> = new Map();
  private thresholds: Map<string, ErrorThreshold> = new Map();
  private readonly MAX_OCCURRENCES = 100; // 每个错误最多保存的发生记录数
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // 初始化默认阈值
    this.setDefaultThresholds();
    // 启动定期清理任务
    this.startCleanupTask();
  }

  private setDefaultThresholds() {
    // 通用错误阈值
    this.thresholds.set('default', {
      maxCount: 10,
      timeWindow: 60, // 1分钟
      action: 'alert'
    });

    // 数据库错误阈值
    this.thresholds.set('database', {
      maxCount: 5,
      timeWindow: 60,
      action: 'alert'
    });

    // 认证错误阈值
    this.thresholds.set('auth', {
      maxCount: 20,
      timeWindow: 60,
      action: 'block'
    });

    // 系统错误阈值
    this.thresholds.set('system', {
      maxCount: 3,
      timeWindow: 60,
      action: 'alert'
    });
  }

  private startCleanupTask() {
    // 每小时清理一次过期的错误统计
    this.cleanupTimer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  dispose() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.errorStats.clear();
  }

  private cleanup() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    for (const [key, stats] of this.errorStats.entries()) {
      // 清理1小时前的错误记录
      stats.occurrences = stats.occurrences.filter(occurrence => {
        const timestamp = new Date(occurrence.timestamp).getTime();
        return timestamp > oneHourAgo;
      });

      // 如果没有发生记录，删除该错误统计
      if (stats.occurrences.length === 0) {
        this.errorStats.delete(key);
      } else {
        stats.count = stats.occurrences.length;
      }
    }
  }

  private getErrorKey(error: Error | string, context?: Record<string, any>): string {
    let key: string;
    if (typeof error === 'string') {
      key = error;
    } else {
      key = error.message || error.name || 'unknown';
    }

    // 如果有上下文信息，添加到key中
    if (context?.errorType) {
      key = `${context.errorType}:${key}`;
    }

    return key;
  }

  async trackError(error: Error | string, context?: Record<string, any>) {
    const key = this.getErrorKey(error, context);
    const now = formatLogTimestamp();

    // 更新错误统计
    let stats = this.errorStats.get(key);
    if (!stats) {
      stats = {
        count: 0,
        lastOccurred: now,
        occurrences: []
      };
    }

    const errorInfo = {
      timestamp: now,
      message: typeof error === 'string' ? error : error.message,
      stack: error instanceof Error ? error.stack : undefined,
      context
    };

    // 添加到发生记录中
    stats.occurrences.unshift(errorInfo);
    
    // 限制发生记录数量
    if (stats.occurrences.length > this.MAX_OCCURRENCES) {
      stats.occurrences = stats.occurrences.slice(0, this.MAX_OCCURRENCES);
    }

    stats.count = stats.occurrences.length;
    stats.lastOccurred = now;
    this.errorStats.set(key, stats);

    // 保存到Redis以便跨实例共享
    await redisCache.set(`error:${key}`, stats, { ttl: 3600 });

    // 检查阈值
    await this.checkThreshold(key, stats, context);
  }

  private async checkThreshold(key: string, stats: ErrorStats, context?: Record<string, any>) {
    // 确定适用的阈值
    let threshold = this.thresholds.get('default');
    if (key.includes('database')) {
      threshold = this.thresholds.get('database');
    } else if (key.includes('auth') || key.includes('unauthorized')) {
      threshold = this.thresholds.get('auth');
    } else if (key.includes('system') || key.includes('internal')) {
      threshold = this.thresholds.get('system');
    }

    if (!threshold) return;

    // 计算时间窗口内的错误数量
    const timeWindowMs = threshold.timeWindow * 1000;
    const now = Date.now();
    const recentOccurrences = stats.occurrences.filter(occurrence => {
      const timestamp = new Date(occurrence.timestamp).getTime();
      return now - timestamp <= timeWindowMs;
    });

    const recentCount = recentOccurrences.length;

    // 检查是否超过阈值
    if (recentCount >= threshold.maxCount) {
      await this.handleThresholdExceeded(key, recentCount, threshold, context);
    }
  }

  private async handleThresholdExceeded(key: string, count: number, threshold: ErrorThreshold, context?: Record<string, any>) {
    const message = `Error threshold exceeded: ${key} (${count} occurrences in ${threshold.timeWindow}s)`;
    
    switch (threshold.action) {
      case 'alert':
        logger.error(message, { key, count, threshold, context });
        // 这里可以添加发送邮件、短信等通知机制
        break;
      case 'block':
        logger.warn(message, { key, count, threshold, context });
        // 这里可以添加临时阻止相关请求的机制
        break;
      case 'log':
        logger.info(message, { key, count, threshold, context });
        break;
    }
  }

  getErrorStats(): Record<string, ErrorStats> {
    const stats: Record<string, ErrorStats> = {};
    for (const [key, value] of this.errorStats.entries()) {
      stats[key] = value;
    }
    return stats;
  }

  getErrorStatsByType(type: string): Record<string, ErrorStats> {
    const stats: Record<string, ErrorStats> = {};
    for (const [key, value] of this.errorStats.entries()) {
      if (key.startsWith(`${type}:`)) {
        stats[key] = value;
      }
    }
    return stats;
  }

  async getErrorStatsFromRedis(): Promise<Record<string, ErrorStats>> {
    const keys = await redisCache.keys('error:*');
    const stats: Record<string, ErrorStats> = {};

    for (const key of keys) {
      const errorKey = key.replace('error:', '');
      const value = await redisCache.get<ErrorStats>(key);
      if (value) {
        stats[errorKey] = value;
      }
    }

    return stats;
  }

  clearErrorStats(key?: string) {
    if (key) {
      this.errorStats.delete(key);
      redisCache.delete(`error:${key}`);
    } else {
      this.errorStats.clear();
      redisCache.clear('error:*');
    }
  }
}

// 导出单例实例
export const errorMonitor = new ErrorMonitor();
