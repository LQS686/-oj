/**
 * lib/constants/cache-keys.ts
 * 统一缓存键命名规范（P3-3 修复：消除散落的字符串拼接）
 *
 * 用法：
 *   cache.deleteByPrefix(CacheKeys.contest.byId(id))
 *   cache.deleteByPrefix(CacheKeys.contest.rankPrefix(contestId))
 *
 * 严禁：
 *   - 直接写 `cache.delete('contest:byId:${id}')`
 *   - 在新代码中拼接新的字符串键
 */

export const CacheKeys = {
  problem: {
    byId: (id: string) => `problem:byId:${id}`,
    byIdPrefix: () => 'problem:byId',
    listPrefix: () => 'problem:list',
    tags: () => 'problem:tags',
    statusCounts: (id: string) => `problem:statusCounts:${id}`,
    /** 与 cache.get('problem:stats', [id]) 生成的键一致 */
    stats: (id: string) => `problem:stats:${id}`,
  },
  contest: {
    byId: (id: string) => `contest:byId:${id}`,
    rankPrefix: (contestId: string) => `contest:rank:${contestId}`,
  },
  training: {
    byId: (id: string) => `training:byId:${id}`,
    listPrefix: () => 'training:list',
  },
  ranking: {
    listPrefix: () => 'ranking:list',
  },
  user: {
    profilePrefix: () => 'user:profile',
    statsPrefix: () => 'user:stats',
  },
  announcement: {
    listPrefix: () => 'announcement:list',
  },
  home: {
    dashboardPrefix: () => 'home:dashboard',
  },
  // 班级作业题目作答进度（计时核心）
  timing: {
    progressPrefix: () => 'timing:progress',
    progress: (assignmentId: string, problemId: string, userId: string) =>
      `timing:progress:${assignmentId}:${problemId}:${userId}`,
  },
} as const