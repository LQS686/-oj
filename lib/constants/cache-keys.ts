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
    /** 后台题目列表的聚合快照（候选行 + 测点计数 + 全库总数），按筛选条件缓存 */
    adminListSnapshot: () => 'problem:adminListSnapshot',
    /** 题面详情（按 ObjectId 或 problemNumber）缓存前缀 */
    byIdOrNumberPrefix: () => 'problem:byIdOrNumber',
    statusCounts: (id: string) => `problem:statusCounts:${id}`,
    // 注意：写入侧 cache.get('problem:statusCounts', [problemId, contestId, viewerId])
    // 生成的 key 带 contestId/viewerId 变体，因此失效时必须用
    // cache.deleteByPrefix(CacheKeys.problem.statusCounts(id)) 按题目前缀删除
    //（cache.delete 精确删除永远无法命中多参数变体 key）
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
  notification: {
    unread: (userId: string) => `notification:unread:${userId}`,
    unreadPrefix: () => 'notification:unread',
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