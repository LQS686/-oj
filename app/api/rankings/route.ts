import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { RankingUser } from '@/types/api'
import type { Prisma } from '@prisma/client'

interface RankingResponseData {
  success: boolean
  data: {
    users: RankingUser[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
}

interface CacheConfig {
  ttl: number
  maxSize: number
}

interface CacheStats {
  hits: number
  misses: number
  size: number
}

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

/**
 * 缓存适配器接口
 * 
 * 可通过实现此接口来切换不同的缓存后端：
 * - 当前实现：MemoryCacheAdapter (内存缓存)
 * - 可选实现：RedisCacheAdapter (Redis 缓存)
 * 
 * 切换到 Redis 示例：
 * 1. 安装 ioredis: npm install ioredis
 * 2. 创建 RedisCacheAdapter 实现此接口
 * 3. 替换 cacheAdapter 实例为 Redis 实现
 */
interface CacheAdapter<T> {
  get(key: string): CacheEntry<T> | undefined
  set(key: string, entry: CacheEntry<T>): void
  delete(key: string): boolean
  clear(): void
  size(): number
}

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttl: 60 * 1000,
  maxSize: 100,
}

class MemoryCacheAdapter<T> implements CacheAdapter<T> {
  private cache = new Map<string, CacheEntry<T>>()
  private maxSize: number

  constructor(maxSize: number = DEFAULT_CACHE_CONFIG.maxSize) {
    this.maxSize = maxSize
  }

  get(key: string): CacheEntry<T> | undefined {
    return this.cache.get(key)
  }

  set(key: string, entry: CacheEntry<T>): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(key, entry)
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }

  entries(): IterableIterator<[string, CacheEntry<T>]> {
    return this.cache.entries()
  }
}

let cacheHits = 0
let cacheMisses = 0
const cacheAdapter = new MemoryCacheAdapter<RankingResponseData>(DEFAULT_CACHE_CONFIG.maxSize)

function setCache(key: string, data: RankingResponseData, ttl: number = DEFAULT_CACHE_CONFIG.ttl): void {
  const entry: CacheEntry<RankingResponseData> = {
    data,
    timestamp: Date.now(),
    ttl,
  }
  cacheAdapter.set(key, entry)
}

function getCache(key: string): RankingResponseData | null {
  const entry = cacheAdapter.get(key)
  if (!entry) {
    cacheMisses++
    return null
  }
  if (Date.now() - entry.timestamp > entry.ttl) {
    cacheAdapter.delete(key)
    cacheMisses++
    return null
  }
  cacheHits++
  return entry.data
}

function clearCache(): void {
  cacheAdapter.clear()
  cacheHits = 0
  cacheMisses = 0
}

function clearExpiredCache(): void {
  const now = Date.now()
  const keysToDelete: string[] = []
  
  for (const [key, entry] of (cacheAdapter as MemoryCacheAdapter<RankingResponseData>).entries()) {
    if (now - entry.timestamp > entry.ttl) {
      keysToDelete.push(key)
    }
  }
  
  for (const key of keysToDelete) {
    cacheAdapter.delete(key)
  }
}

function getCacheStats(): CacheStats {
  return {
    hits: cacheHits,
    misses: cacheMisses,
    size: cacheAdapter.size(),
  }
}

function getHitRate(): number {
  const total = cacheHits + cacheMisses
  if (total === 0) return 0
  return cacheHits / total
}

// GET /api/rankings - 获取排行榜
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'rating'
    let page = parseInt(searchParams.get('page') || '1')
    let limit = parseInt(searchParams.get('limit') || '50')
    
    if (isNaN(page) || page < 1) page = 1
    if (isNaN(limit) || limit < 1) limit = 20
    if (limit > 50) limit = 50

    const cacheKey = `ranking_${type}_${page}_${limit}`
    const cached = getCache(cacheKey)
    if (cached) {
      return NextResponse.json(cached)
    }

    let orderBy: Prisma.UserOrderByWithRelationInput[] = []
    if (type === 'solved') {
      orderBy = [
        { solvedCount: 'desc' },
        { rating: 'desc' }
      ]
    } else {
      orderBy = [
        { rating: 'desc' },
        { solvedCount: 'desc' }
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: {
          isBanned: false,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        select: {
          id: true,
          username: true,
          nickname: true,
          rating: true,
          solvedCount: true, // 使用新字段 (Requirement: Database level sorting)
          rank: true,
          color: true,
          avatar: true,
        },
      }),
      prisma.user.count({
        where: {
          isBanned: false,
        },
      }),
    ])

    const rankedUsers: RankingUser[] = users.map((user, index) => ({
      ...user,
      position: (page - 1) * limit + index + 1,
      solvedProblems: user.solvedCount,
    }))

    const responseData = {
      success: true,
      data: {
        users: rankedUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    }

    setCache(cacheKey, responseData)

    return NextResponse.json(responseData)
  } catch (error) {
    logger.error('获取排行榜错误', error)
    return NextResponse.json(
      { success: false, error: '获取排行榜失败' },
      { status: 500 }
    )
  }
}
