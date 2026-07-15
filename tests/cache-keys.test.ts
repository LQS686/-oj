/**
 * tests/cache-keys.test.ts
 * CacheKeys 单元测试（P0：缓存键统一后的回归保护）
 */
import { describe, it, expect } from 'vitest'
import { CacheKeys } from '../lib/constants/cache-keys'

describe('CacheKeys', () => {
  it('problem.byId 应返回一致格式', () => {
    expect(CacheKeys.problem.byId('abc')).toBe('problem:byId:abc')
  })

  it('problem.statusCounts 应返回一致格式', () => {
    expect(CacheKeys.problem.statusCounts('xyz')).toBe('problem:statusCounts:xyz')
  })

  it('contest.byId / rankPrefix 应返回一致格式', () => {
    expect(CacheKeys.contest.byId('c1')).toBe('contest:byId:c1')
    expect(CacheKeys.contest.rankPrefix('c1')).toBe('contest:rank:c1')
  })

  it('training.byId 应返回一致格式', () => {
    expect(CacheKeys.training.byId('t1')).toBe('training:byId:t1')
  })

  it('用户/榜单/通知 key 应返回非空前缀', () => {
    expect(CacheKeys.user.profilePrefix()).toBeTruthy()
    expect(CacheKeys.user.statsPrefix()).toBeTruthy()
    expect(CacheKeys.ranking.listPrefix()).toBeTruthy()
    expect(CacheKeys.announcement.listPrefix()).toBeTruthy()
    expect(CacheKeys.home.dashboardPrefix()).toBeTruthy()
  })

  it('同输入应返回相同 key（缓存命中前提）', () => {
    expect(CacheKeys.contest.byId('xx')).toBe(CacheKeys.contest.byId('xx'))
    expect(CacheKeys.contest.rankPrefix('yy')).toBe(CacheKeys.contest.rankPrefix('yy'))
  })
})