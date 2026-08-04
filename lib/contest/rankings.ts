/**
 * lib/contest/rankings.ts
 * 竞赛排行榜（按 ACM / OI 规则计算 + 排名）
 *
 * 参考 HOJ ContestCalculateRankManager：
 *   - 管理员/比赛创建者提交不入榜（避免测试提交污染榜单）
 *   - 相同分同排名（standard competition ranking，避免名次跳跃）
 *
 * 参考 HOJ sealRank + Hydro lockAt：
 *   - sealRankTime: 封榜时刻，到达后普通用户看不到实时排名
 *   - sealUnlocked: 管理员手动解冻
 *   - isSealed: 计算属性，是否当前处于封榜状态
 */
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { canAccessAdmin } from '@/lib/permissions'
import { ApiError } from '@/lib/api/errors'
import { cache } from '@/lib/cache'
import { CacheKeys } from '@/lib/constants/cache-keys'
import { sanitizeAvatarUrl } from '@/lib/user/avatar-url'

/* ============================================================================
 * 竞赛排行榜（按 ACM / OI 规则计算 + 排名）
 * ========================================================================== */

const PENALTY_PER_WA = 20 * 60 * 1000

/** 排行榜结果缓存 TTL（ms）：提交/封榜变更后会被主动失效，短 TTL 兜底脏读 */
const RANK_CACHE_TTL = 15_000

interface ContestParticipantUser {
  id: string
  username: string
  nickname: string | null
  avatar: string | null
  rank: string
  color: string
  role: string
}

interface ContestUserStats {
  user: ContestParticipantUser
  solved: number
  totalScore: number
  penalty: number
  problems: Record<
    string,
    { status: string; time: number; tries: number; score: number }
  >
}

/**
 * 判断比赛是否处于封榜状态（参考 Hydro isLocked）
 * - sealRankTime 未设置 → 不封榜
 * - 当前时间 < sealRankTime → 不封榜
 * - sealUnlocked=true → 已解冻，不封榜
 * - 否则 → 封榜中
 */
export function isContestSealed(contest: { sealRankTime?: Date | null; sealUnlocked?: boolean }, now: Date = new Date()): boolean {
  if (!contest.sealRankTime) return false
  if (contest.sealUnlocked) return false
  // 到达封榜时刻即封榜（含等于 sealRankTime）
  return contest.sealRankTime.getTime() <= now.getTime()
}

/**
 * 拉取题目+参赛者+提交，并计算排行榜
 *
 * @param options.viewerRole - 查看者角色，管理员可绕过封榜看到实时数据
 * @param options.viewerUserId - 查看者 ID；竞赛作者与管理员一样可绕过封榜
 */
export async function computeContestRankings(
  contestId: string,
  options?: { viewerRole?: string; viewerUserId?: string; bypassCache?: boolean }
) {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    include: {
      problems: {
        include: {
          problem: { select: { id: true, title: true, problemNumber: true } },
        },
        orderBy: { orderIndex: 'asc' },
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
              avatar: true,
              rank: true,
              color: true,
              role: true,
            },
          },
        },
      },
    },
  })
  if (!contest) return null

  // 封榜逻辑：
  //   普通用户在封榜期间，只能看到 sealRankTime 之前的提交；
  //   管理员与竞赛作者可绕过封榜看实时数据；
  //   比赛结束且 sealUnlocked=true 时，所有人都能看到完整数据。
  const viewerRole = options?.viewerRole
  const viewerIsAdmin =
    (viewerRole ? canAccessAdmin({ role: viewerRole }) : false) ||
    (!!options?.viewerUserId && options.viewerUserId === contest.authorId)
  const sealed = isContestSealed(contest)

  // C-P1-1 排行榜缓存：
  //   榜单是热点接口，每次全量拉取该竞赛全部提交并做内存聚合，数据量增长后开销显著。
  //   这里对聚合结果做短 TTL 缓存，且缓存键按「视角」区分：
  //   管理员/作者（实时全量）与封榜中普通用户（冻结快照）结果不同，不可共用一个键。
  //   提交/报名/封榜变更后由 cache.deleteByPrefix(CacheKeys.contest.rankPrefix(contestId))
  //   统一失效（见 lib/contest/submissions.ts、lib/contest/crud.ts、lib/contest/admin.ts、
  //   app/api/contests/[id]/register/route.ts）；cache.get 生成键的前缀与 rankPrefix 一致，
  //   前缀删除天然兼容。
  // 榜单计算主体（不含缓存）：finalize 落库等需要精确最新数据的场景传 bypassCache 绕过。
  const compute = async () => {
      // 截止时间：封榜时普通用户只看到 sealRankTime 之前的提交；管理员或未封榜时看完整endTime
      const submissionCutoffTime = sealed && !viewerIsAdmin
        ? contest.sealRankTime!.getTime()
        : (contest.endTime ? contest.endTime.getTime() : null)

      // 只获取必要的字段以减少数据量
      const submissions = await prisma.submission.findMany({
        where: { contestId },
        select: {
          userId: true,
          problemId: true,
          status: true,
          submittedAt: true,
          score: true, // 添加分数
        },
        orderBy: { submittedAt: 'asc' },
      })

      const startTime = contest.startTime.getTime()
      const endTime = contest.endTime ? contest.endTime.getTime() : null

      // 参考 HOJ：管理员（SYSTEM_ADMIN/ADMIN）与比赛创建者提交不入榜，
      // 避免测试提交污染榜单。被排除的用户仍出现在参与者列表中（标记为 unranked）。
      const adminRoleSet = new Set(['SYSTEM_ADMIN', 'ADMIN'])
      const excludedUserIds = new Set<string>([contest.authorId])
      for (const p of contest.participants) {
        if (p.user && adminRoleSet.has(p.user.role)) {
          excludedUserIds.add(p.userId)
        }
      }

      const userStatsMap = new Map<string, ContestUserStats>()

      // 预填充（管理员/系统账号不入榜，避免 0 分假排名）
      contest.participants.forEach((p) => {
        if (excludedUserIds.has(p.userId)) return
        const user = p.user
          ? { ...p.user, avatar: sanitizeAvatarUrl(p.user.avatar) }
          : p.user
        userStatsMap.set(p.userId, {
          user,
          solved: 0,
          totalScore: 0,
          penalty: 0,
          problems: {},
        })
      })

      submissions.forEach((sub) => {
        if (!userStatsMap.has(sub.userId)) return
        // 管理员/创建者提交不计入排名
        if (excludedUserIds.has(sub.userId)) return

        const stats = userStatsMap.get(sub.userId)!

        if (!stats.problems[sub.problemId]) {
          stats.problems[sub.problemId] = {
            status: 'Unsubmitted',
            time: 0,
            tries: 0,
            score: 0,
          }
        }

        const problemStats = stats.problems[sub.problemId]
        const relativeTime = new Date(sub.submittedAt).getTime() - startTime
        if (relativeTime < 0) return
        // 过滤竞赛结束后的提交（管理员补提交或评测延迟不应计入排名）
        if (endTime && new Date(sub.submittedAt).getTime() > endTime) return
        // 封榜逻辑：普通用户在封榜期间只看到 sealRankTime 之前的提交
        if (submissionCutoffTime !== null && new Date(sub.submittedAt).getTime() > submissionCutoffTime) return

        // ACM 逻辑
        if (contest.type === 'ACM') {
          if (problemStats.status === 'AC') return
          if (sub.status === 'AC') {
            problemStats.status = 'AC'
            problemStats.time = relativeTime
            problemStats.score = 1 // ACM 1题1分
            stats.penalty += relativeTime + problemStats.tries * PENALTY_PER_WA
            stats.solved += 1
            stats.totalScore += 1
          } else if (
            ['WA', 'TLE', 'MLE', 'RE'].includes(sub.status)
          ) {
            problemStats.status = 'WA'
            problemStats.tries += 1
          }
        } else {
          // OI 逻辑 (取最高分)
          const currentScore = sub.score || 0
          if (currentScore > problemStats.score) {
            // 更新最高分，同时更新总分
            stats.totalScore += currentScore - problemStats.score
            problemStats.score = currentScore
            problemStats.status =
              currentScore === 100 ? 'AC' : currentScore > 0 ? 'Partial' : 'WA'
          }
          // OI 也可以记录最后一次提交时间作为罚时？或者不计算罚时
        }
      })

      // 4. 排序
      const rankList = Array.from(userStatsMap.values()).sort((a, b) => {
        if (contest.type === 'ACM') {
          if (a.solved !== b.solved) return b.solved - a.solved
          return a.penalty - b.penalty
        } else {
          // OI: 分数优先
          return b.totalScore - a.totalScore
        }
      })

      // 5. 赋予排名
      // 参考 HOJ：相同分同排名（standard competition ranking），避免名次跳跃。
      // 例如：3 人并列第 5 名 → 第 4 名后三名均记为第 5 名，下一名记为第 8 名。
      const finalRankList: Array<ContestUserStats & { rank: number; penaltyMinutes: number }> = []
      let currentRank = 0
      let prevKey = ''
      for (let i = 0; i < rankList.length; i++) {
        const item = rankList[i]
        const sortKey = contest.type === 'ACM'
          ? `${item.solved}-${item.penalty}`
          : `${item.totalScore}`
        if (i === 0 || sortKey !== prevKey) {
          currentRank = i + 1
          prevKey = sortKey
        }
        finalRankList.push({
          rank: currentRank,
          ...item,
          penaltyMinutes: Math.floor(item.penalty / 60000),
        })
      }

      return {
        rankings: finalRankList,
        contestType: contest.type,
        problems: contest.problems.map((cp) => ({
          id: cp.problem.id,
          title: cp.problem.title,
          problemNumber: cp.problem.problemNumber,
          orderIndex: cp.orderIndex,
        })),
        // 封榜状态信息，供前端展示封榜提示横幅
        seal: {
          sealed,
          sealRankTime: contest.sealRankTime,
          sealUnlocked: contest.sealUnlocked,
          // 普通用户在封榜期间，告诉前端"这是封榜快照"
          isFrozenView: sealed && !viewerIsAdmin,
        },
      }
  }

  // finalize 落库等一次性精确操作绕过缓存，避免命中 TTL 内的旧榜单数据
  if (options?.bypassCache) return compute()

  // 缓存键按「视角」区分（admin/sealed/open），prefix 与 rankPrefix 一致，deleteByPrefix 天然兼容
  const rankViewKey = viewerIsAdmin ? 'admin' : sealed ? 'sealed' : 'open'
  return cache.get('contest:rank', [contestId, rankViewKey], compute, {
    ttl: RANK_CACHE_TTL,
  })
}

/**
 * 竞赛结束后将最终排名写入 ContestParticipant 表
 * 应在竞赛结束时调用（定时任务或管理员手动触发）
 */
export async function finalizeContestRankings(contestId: string) {
  const contest = await prisma.contest.findUnique({ where: { id: contestId } })
  if (!contest) throw new Error('竞赛不存在')

  // 仅允许比赛结束后落库，避免封榜中提前 finalize 与展示不一致
  if (new Date() <= contest.endTime) {
    throw new ApiError('CONTEST_NOT_ENDED', '竞赛尚未结束，不能固化排名', 400)
  }

  // 落库时管理员视角，记录完整数据；bypassCache 确保拿到实时最新排名而非缓存快照
  const result = await computeContestRankings(contestId, {
    viewerRole: 'SYSTEM_ADMIN',
    bypassCache: true,
  })
  if (!result) return

  const rankList = result.rankings

  // C-P2-4：先批量查询仍存在的参赛者，避免对已退出的用户发无效写操作；
  // 再按 contestId+userId 用 updateMany 逐条写入（Mongo 无按不同 data 批量更新的能力），
  // 失败时记录 error 日志而非静默吞掉。
  const participants = await prisma.contestParticipant.findMany({
    where: { contestId, userId: { in: rankList.map((entry) => entry.user.id) } },
    select: { userId: true },
  })
  const existingUserIds = new Set(participants.map((p) => p.userId))

  await Promise.all(
    rankList.map(async (entry) => {
      // 参与者可能已退出竞赛（participant 记录被删），跳过
      if (!existingUserIds.has(entry.user.id)) return
      try {
        await prisma.contestParticipant.updateMany({
          where: { contestId, userId: entry.user.id },
          data: {
            rank: entry.rank,
            score: entry.totalScore,
          },
        })
      } catch (error) {
        logger.error(
          `竞赛 ${contestId} 排名落库失败（userId=${entry.user.id}）`,
          error instanceof Error ? error : new Error(String(error))
        )
      }
    })
  )

  logger.info(`竞赛 ${contestId} 排名已落库，共 ${rankList.length} 名参赛者`)
  cache.deleteByPrefix(CacheKeys.contest.rankPrefix(contestId))
}
