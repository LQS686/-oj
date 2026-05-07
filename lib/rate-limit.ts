import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined | Promise<RateLimitEntry | undefined>;
  set(key: string, entry: RateLimitEntry): void | Promise<void>;
  delete(key: string): void | Promise<void>;
  cleanup(): void | Promise<void>;
}

class MemoryStore implements RateLimitStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    if (typeof window === 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }
  }

  get(key: string): RateLimitEntry | undefined {
    const entry = this.store.get(key);
    if (entry && entry.resetTime < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

const memoryStore = new MemoryStore();

class RedisStore implements RateLimitStore {
  private redis: any = null;
  private useRedis = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initRedis();
  }

  private async initRedis() {
    try {
      const { default: Redis } = await import('ioredis');
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
      await this.redis.ping();
      this.useRedis = true;
    } catch (error) {
      console.warn('Redis not available, using memory store');
      this.useRedis = false;
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
  }

  async get(key: string): Promise<RateLimitEntry | undefined> {
    await this.ensureReady();
    if (!this.useRedis || !this.redis) return undefined;

    try {
      const data = await this.redis.get(`ratelimit:${key}`);
      if (!data) return undefined;

      const entry = JSON.parse(data);
      if (entry.resetTime < Date.now()) {
        await this.redis.del(`ratelimit:${key}`);
        return undefined;
      }
      return entry;
    } catch {
      return undefined;
    }
  }

  async set(key: string, entry: RateLimitEntry): Promise<void> {
    await this.ensureReady();
    if (!this.useRedis || !this.redis) return;

    try {
      const ttl = Math.ceil((entry.resetTime - Date.now()) / 1000);
      await this.redis.setex(`ratelimit:${key}`, ttl, JSON.stringify(entry));
    } catch {
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureReady();
    if (!this.useRedis || !this.redis) return;

    try {
      await this.redis.del(`ratelimit:${key}`);
    } catch {
    }
  }

  async cleanup(): Promise<void> {
    await this.ensureReady();
  }
}

const redisStore = new RedisStore();

const defaultConfig: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60000,
  keyPrefix: 'default'
};

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = defaultConfig
): Promise<RateLimitResult> {
  const key = `${config.keyPrefix || 'default'}:${identifier}`;
  const now = Date.now();
  const resetTime = now + config.windowMs;

  let entry: RateLimitEntry | undefined;

  try {
    entry = await redisStore.get(key);
  } catch {
  }

  if (!entry) {
    entry = memoryStore.get(key);
  }

  let count = 1;
  if (entry && entry.resetTime > now) {
    count = entry.count + 1;
  }

  const remaining = Math.max(0, config.maxRequests - count);
  const success = count <= config.maxRequests;

  const newEntry: RateLimitEntry = { count, resetTime };

  memoryStore.set(key, newEntry);
  try {
    await redisStore.set(key, newEntry);
  } catch {
  }

  const result: RateLimitResult = {
    success,
    limit: config.maxRequests,
    remaining,
    resetTime
  };

  if (!success) {
    const retryAfterMs = entry ? entry.resetTime - now : config.windowMs;
    result.retryAfter = Math.ceil(retryAfterMs / 1000);
  }

  return result;
}

export interface RateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
  keyGenerator?: (request: NextRequest) => string;
  skip?: (request: NextRequest) => boolean;
  message?: string;
  statusCode?: number;
}

export function rateLimit(options: RateLimitOptions = {}) {
  const config: RateLimitConfig = {
    maxRequests: options.maxRequests || defaultConfig.maxRequests,
    windowMs: options.windowMs || defaultConfig.windowMs,
    keyPrefix: 'api'
  };

  const defaultMessage = options.message || '请求过于频繁，请稍后再试';

  return async function rateLimitMiddleware(request: NextRequest): Promise<NextResponse | null> {
    if (options.skip?.(request)) {
      return null;
    }

    const identifier = options.keyGenerator 
      ? options.keyGenerator(request)
      : getClientIP(request);

    const result = await checkRateLimit(identifier, config);

    const headers = new Headers();
    headers.set('X-RateLimit-Limit', result.limit.toString());
    headers.set('X-RateLimit-Remaining', result.remaining.toString());
    headers.set('X-RateLimit-Reset', result.resetTime.toString());

    if (!result.success && result.retryAfter) {
      headers.set('Retry-After', result.retryAfter.toString());
    }

    if (!result.success) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: defaultMessage,
          retryAfter: result.retryAfter
        }),
        {
          status: 429,
          headers: {
            ...Object.fromEntries(headers),
            'Content-Type': 'application/json'
          }
        }
      );
    }

    return null;
  };
}

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');

  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0] || 'unknown';
  }

  if (realIP) {
    return realIP;
  }

  return 'unknown';
}

export function createRateLimiter(options: RateLimitOptions = {}) {
  const limiter = rateLimit(options);
  
  return async (request: NextRequest): Promise<{ allowed: boolean; headers?: Headers }> => {
    const response = await limiter(request);
    
    if (response) {
      return { allowed: false };
    }
    
    const ip = options.keyGenerator ? options.keyGenerator(request) : getClientIP(request);
    const result = await checkRateLimit(ip, {
      maxRequests: options.maxRequests || defaultConfig.maxRequests,
      windowMs: options.windowMs || defaultConfig.windowMs
    });
    
    const headers = new Headers();
    headers.set('X-RateLimit-Limit', result.limit.toString());
    headers.set('X-RateLimit-Remaining', result.remaining.toString());
    headers.set('X-RateLimit-Reset', result.resetTime.toString());
    
    return { allowed: true, headers };
  };
}

export const authRateLimiter = rateLimit({
  maxRequests: 10,
  windowMs: 60000,
  keyGenerator: (req) => `auth:${getClientIP(req)}`,
  message: '登录尝试过于频繁，请稍后再试'
});

export const submissionRateLimiter = rateLimit({
  maxRequests: 20,
  windowMs: 60000,
  keyGenerator: (req) => `submit:${getClientIP(req)}`,
  message: '提交过于频繁，请稍后再试'
});

export const searchRateLimiter = rateLimit({
  maxRequests: 60,
  windowMs: 60000,
  keyGenerator: (req) => `search:${getClientIP(req)}`,
  message: '搜索请求过于频繁，请稍后再试'
});

export const apiRateLimiter = rateLimit({
  maxRequests: 100,
  windowMs: 60000,
  keyGenerator: (req) => `api:${getClientIP(req)}`,
  message: '请求频率过高，请稍后再试'
});

export { checkRateLimit, getClientIP };
export type { RateLimitConfig, RateLimitResult };