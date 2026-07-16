# DSOJ 项目问题复核报告

> **生成时间**: 2026-07-16
> **排查模式**: 4 路并行深度排查（安全 / 逻辑 / 性能 / 代码质量）
> **排查范围**: 全量代码库（app/ + lib/ + components/ + contexts/ + hooks/ + scripts/ + tests/）
> **问题总数**: 44 个（严重 2 / 高危 8 / 中危 17 / 低危 17）

---

## 📊 问题统计总览

| 严重度             | 安全  | 逻辑   | 性能   | 代码质量 | 合计   |
| ------------------ | ----- | ------ | ------ | -------- | ------ |
| 🔴 严重 (Critical) | 2     | 0      | 0      | 0        | **2**  |
| 🟠 高危 (High)     | 1     | 4      | 1      | 2        | **8**  |
| 🟡 中危 (Medium)   | 1     | 7      | 5      | 4        | **17** |
| 🔵 低危 (Low)      | 0     | 2      | 6      | 9        | **17** |
| **合计**           | **4** | **13** | **12** | **15**   | **44** |

---

# 🛡️ 一、安全问题（4 个）

## 🔴 SEC-01: 提交详情接口未鉴权，任意用户代码可被读取

**严重度**: 严重 (Critical)
**文件**: [app/api/submissions/[id]/route.ts:10-16](file:///e:/桌面/dsoj/app/api/submissions/%5Bid%5D/route.ts#L10-L16) + [lib/submission/service.ts:232-285](file:///e:/桌面/dsoj/lib/submission/service.ts#L232-L285)

**问题代码**:

```ts
export const GET = withApi.public(async (_req, ctx) => {
  const { id } = ctx.params;
  const data = await getSubmissionDetailOrClassAssignment(id);
  if (!data) throw404("提交记录不存在");
  return ok(data);
});
```

**分析**: 使用 `withApi.public`（无需登录），`getSubmissionDetailOrClassAssignment` 按 `id` 查询返回完整数据，包含 `code` 字段。任何人通过枚举 ObjectId 即可读取任意用户的提交代码（含竞赛/作业代码）。

**影响**: 竞赛作弊、作业抄袭。

**修复建议**: 改为 `withApi.auth`，在 service 层校验 `submission.userId === user.id || isAdmin`。

---

## 🔴 SEC-02: 提交列表接口 include 未限制字段，代码批量泄露

**严重度**: 严重 (Critical)
**文件**: [app/api/submissions/route.ts:15-36](file:///e:/桌面/dsoj/app/api/submissions/route.ts#L15-L36) + [lib/submission/service.ts:200-210](file:///e:/桌面/dsoj/lib/submission/service.ts#L200-L210)

**问题代码**:

```ts
prisma.submission.findMany({
  where,
  include: {
    problem: { select: { id: true, title: true } },
    user: { select: { id: true, username: true, nickname: true } },
  },
});
```

**分析**: `include` 不限制主表字段，返回 `Submission` 全部标量字段（含 `code`）。攻击者可通过 `?userId=<目标用户ID>` 批量拉取该用户全部代码。

**修复建议**: 将 `include` 改为 `select`，显式排除 `code` 字段；列表接口仅返回元数据，`code` 只在详情接口按权限返回。

---

## 🟠 SEC-03: 竞赛提交列表选手间代码互相可见

**严重度**: 高危 (High)
**文件**: [app/api/contests/[id]/submissions/route.ts:38-57](file:///e:/桌面/dsoj/app/api/contests/%5Bid%5D/submissions/route.ts#L38-L57) + [lib/contest/service.ts:474-484](file:///e:/桌面/dsoj/lib/contest/service.ts#L474-L484)

**分析**: `listContestSubmissionsPaged` 同样使用 `include` 返回 `code` 字段。竞赛进行中，任何报名选手可读取其他选手的提交代码，构成作弊风险。

**修复建议**: 竞赛进行中对非管理员/非提交者本人的记录脱敏 `code` 字段；竞赛结束后或管理员可见完整代码。

---

## 🟡 SEC-04: getUserFullInfo 死代码返回完整 User 记录（含 password 哈希）

**严重度**: 中危 (Medium)
**文件**: [lib/user/service.ts:1200-1202](file:///e:/桌面/dsoj/lib/user/service.ts#L1200-L1202)

```ts
export async function getUserFullInfo(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}
```

**分析**: 未使用 `select` 限制字段，返回完整记录（含 `password`、`tokenVersion`）。当前无调用方（死代码），但一旦未来被误用且响应直接返回，将泄露密码哈希。

**修复建议**: 删除该函数或强制使用 `select` 排除敏感字段。

---

# 🧩 二、逻辑缺陷（13 个）

## 🟠 LOGIC-01: 题目删除后 User.solvedCount 不回退

**严重度**: 高危 (High)
**文件**: [lib/problem/service.ts:755-769](file:///e:/桌面/dsoj/lib/problem/service.ts#L755-L769) + [lib/judge/worker.ts:49-62](file:///e:/桌面/dsoj/lib/judge/worker.ts#L49-L62)

**分析**: `deleteAdminProblem` 连带删除所有 `Submission` 但未回退 `User.solvedCount`。全代码库无 `solvedCount: { decrement }` 调用。删除题目后做过该题的用户 `solvedCount` 永久虚高，排行榜失真。

**修复建议**: 删除题目时批量查询受影响用户，回退 `solvedCount`（或改用 `Submission` 表实时 `count` 替代冗余字段）。

---

## 🟠 LOGIC-02: isFirstAccepted 走从库读，并发 AC 重复计数

**严重度**: 高危 (High)
**文件**: [lib/mongodb-direct.ts:232-246](file:///e:/桌面/dsoj/lib/mongodb-direct.ts#L232-L246) + [lib/judge/worker.ts:49-72](file:///e:/桌面/dsoj/lib/judge/worker.ts#L49-L72)

**分析**: `isFirstAccepted` 使用 `SECONDARY_PREFERRED` 从库读，MongoDB 复制延迟下两个并发 AC 提交可能都返回 `true`，导致 `totalAccepted` 和 `User.solvedCount` 被自增两次。

**修复建议**: `isFirstAccepted` 改用主库读 + 唯一索引约束（`ProblemId + UserId + status=AC`），或使用原子操作 `findOneAndUpdate`。

---

## 🟠 LOGIC-03: ContestParticipant.rank/score 永不落库

**严重度**: 高危 (High)
**文件**: [lib/mongodb-direct.ts:417-428](file:///e:/桌面/dsoj/lib/mongodb-direct.ts#L417-L428) + [lib/contest/service.ts:318-451](file:///e:/桌面/dsoj/lib/contest/service.ts#L318-L451)

**分析**: `ContestParticipant` 的 `score` 和 `rank` 字段自创建后从不更新（全代码库无 `contestParticipant.update` 调用）。`computeContestRankings` 计算结果只用于 HTTP 响应，未回写。查询"我的竞赛成绩"列表会拿到全 0 数据。

**修复建议**: 竞赛结束时触发排名计算并 `prisma.contestParticipant.update` 回写 `score` 和 `rank`。

---

## 🟠 LOGIC-04: OI 模式未过滤竞赛结束后的提交

**严重度**: 高危 (High)
**文件**: [lib/contest/service.ts:388-420](file:///e:/桌面/dsoj/lib/contest/service.ts#L388-L420)

**问题代码**:

```ts
const relativeTime = new Date(sub.submittedAt).getTime() - startTime;
if (relativeTime < 0) return; // 只校验了开始前
// 缺少: if (new Date(sub.submittedAt).getTime() > endTime) return
```

**分析**: OI 模式下未校验 `submittedAt > endTime`，管理员补提交或评测延迟完成的提交会被计入排名。

**修复建议**: 增加 `if (new Date(sub.submittedAt).getTime() > endTime) return`。

---

## 🟡 LOGIC-05: Solution.likes 并发点赞 P2002 被吞但返回 liked:true

**严重度**: 中危 (Medium)
**文件**: [lib/solution/service.ts:395-418](file:///e:/桌面/dsoj/lib/solution/service.ts#L395-L418)

**分析**: 两个并发请求同时点赞：两个 `findUnique` 都返回 null，两个事务都尝试 create。一个成功（likes +1），另一个 P2002 被吞掉（likes 不变）但仍返回 `{ liked: true }`。用户下次取消点赞时 `findUnique` 返回 null，走 create 分支再次失败，点赞状态永久错乱。

**修复建议**: 捕获 P2002 后重新查询 `findUnique` 确认实际状态再返回。

---

## 🟡 LOGIC-06: 用户注册 findUnique 后 create 无事务（TOCTOU）

**严重度**: 中危 (Medium)
**文件**: [lib/user/service.ts:1234-1250](file:///e:/桌面/dsoj/lib/user/service.ts#L1234-L1250)

**分析**: 两个并发注册请求同时通过 `findUnique` 检查，随后只有一个 `create` 成功，另一个抛 `P2002`。service 层未捕获 P2002，用户看到 500 错误而非"用户名已被使用"。

**修复建议**: 捕获 P2002 并返回友好错误提示，或使用事务包裹 check + create。

---

## 🟡 LOGIC-07: 班级加入审批容量检查 TOCTOU

**严重度**: 中危 (Medium)
**文件**: [lib/class/service.ts:2144-2173](file:///e:/桌面/dsoj/lib/class/service.ts#L2144-L2173)

**分析**: `count` 检查与 `classMember.create` 不在同一事务中。两个管理员同时审批两个申请，两个 count 都 < maxMembers，两个事务都创建成员，最终成员数超过 maxMembers。

**修复建议**: 事务内重新检查容量，或使用 MongoDB 原子操作 `findOneAndUpdate` with capacity guard。

---

## 🟡 LOGIC-08: 题单加入 create + joinCount 自增非事务

**严重度**: 中危 (Medium)
**文件**: [lib/training/service.ts:477-489](file:///e:/桌面/dsoj/lib/training/service.ts#L477-L489) + [lib/training/service.ts:548-558](file:///e:/桌面/dsoj/lib/training/service.ts#L548-L558)

**分析**: `create` 与 `incrementJoinCount` 不在同一事务。若 `incrementJoinCount` 失败被吞掉，`TrainingEnrollment` 已创建但 `Training.joinCount` 未自增，永久不一致。

**修复建议**: 用 `prisma.$transaction` 包裹 create + update。

---

## 🟡 LOGIC-09: 缓存先于 DB 写入清除，存在 stale window

**严重度**: 中危 (Medium)
**文件**: [lib/problem/service.ts:85-88](file:///e:/桌面/dsoj/lib/problem/service.ts#L85-L88) + [lib/solution/service.ts:54-57](file:///e:/桌面/dsoj/lib/solution/service.ts#L54-L57)

**分析**: 缓存在 DB 写入之前清除。并发场景：请求 A 清缓存 → 请求 B 读缓存未命中、从 DB 读到旧值并写入缓存 → 请求 A 写 DB。此时缓存中是旧值，TTL 内所有读都拿到陈旧数据。

**修复建议**: 先写 DB 再清缓存（Cache-Aside 标准模式），或采用延迟双删。

---

## 🟡 LOGIC-10: deleteUserSolution 漏清 solution:list 缓存

**严重度**: 中危 (Medium)
**文件**: [lib/solution/service.ts:341-362](file:///e:/桌面/dsoj/lib/solution/service.ts#L341-L362)

**分析**: `deleteUserSolution` 只清了 `solution:byId:${id}`，漏清 `solution:list:` 前缀。列表页在 TTL 内显示已删除的题解。对比 `deleteSolution`（行 59-63）正确清了两个。

**修复建议**: 在 `deleteUserSolution` 中增加 `cache.deleteByPrefix('solution:list:')`。

---

## 🟡 LOGIC-11: 分页 page=0 / pageSize=0 多处未校验

**严重度**: 中危 (Medium)
**文件**: 10+ 个 service 文件

**分析**: 大量路由直接 `parseInt` 后传入 service，service 仅用 `?? 1` 兜底但允许 `page=0`/`pageSize=0` 通过。`page=0` 时 `skip = -pageSize`（Prisma 报错）；`pageSize=0` 时 `totalPages = Infinity`（前端分页器卡死）。仅 3 个路由正确校验（submissions、admin/trainings、admin/ai/logs），其余 10+ 个未校验。

**修复建议**: 在 `lib/api/validation.ts` 的 `toInt` 中统一增加下限校验。

---

## 🟡 LOGIC-12: datetime-local 无时区，跨时区部署时间错位

**严重度**: 中危 (Medium)
**文件**: [app/contests/create/page.tsx:265-271](file:///e:/桌面/dsoj/app/contests/create/page.tsx#L265-L271) + [lib/contest/service.ts:643-653](file:///e:/桌面/dsoj/lib/contest/service.ts#L643-L653)

**分析**: `<input type="datetime-local">` 产出 `"2024-06-01T14:30"` 无时区信息。浏览器按本地时区解析，服务端按服务端时区解析（Docker 默认 UTC），差 8 小时。项目未设置 `TZ` 环境变量。

**修复建议**: 前端提交时附加时区偏移量，或统一转为 ISO 8601 with offset；服务端设置 `TZ=Asia/Shanghai`。

---

## 🟡 LOGIC-13: 热力图用 toISOString 截断日期，凌晨活动记到前一天

**严重度**: 中危 (Medium)
**文件**: [lib/user/service.ts:259-264](file:///e:/桌面/dsoj/lib/user/service.ts#L259-L264) + [lib/home/dashboard.ts:16](file:///e:/桌面/dsoj/lib/home/dashboard.ts#L16) + [lib/class/service.ts:1750-1754](file:///e:/桌面/dsoj/lib/class/service.ts#L1750-L1754)

**分析**: 用户在上海时间 23:30 AC 一道题（UTC 15:30），`.toISOString().split('T')[0]` 得到 UTC 当天日期，与用户感知的"当天"差一天。`setHours(0,0,0,0)` 取服务端本地午夜再转 UTC 也有同样问题。

**修复建议**: 统一使用 `Asia/Shanghai` 时区计算日期边界，或使用 `date-fns-tz` 等库。

---

## 🔵 LOGIC-14: prisma generate 未执行时 views/likes 静默失效

**严重度**: 低危 (Low)
**文件**: [lib/solution/view-helper.ts:32-36](file:///e:/桌面/dsoj/lib/solution/view-helper.ts#L32-L36) + [lib/solution/like-helper.ts:33-37](file:///e:/桌面/dsoj/lib/solution/like-helper.ts#L33-L37)

**分析**: `prisma.solutionView` / `prisma.solutionLike` 模型不可用时仅 `logger.warn` 后 `return false`，用户看不到点赞状态，views 永远不增长，无任何用户侧提示。

**修复建议**: 增加启动期校验，若 Prisma client 未正确生成则阻止启动。

---

## 🔵 LOGIC-15: Solution.views 写记录与自增非事务，fire-and-forget

**严重度**: 低危 (Low)
**文件**: [lib/solution/service.ts:255-268](file:///e:/桌面/dsoj/lib/solution/service.ts#L255-L268)

**分析**: `recordUniqueView`（创建 `SolutionView`）与 `prisma.solution.update views:increment` 不在同一事务中，且 fire-and-forget（`.catch(logger.error)`）。若第二步失败，`SolutionView` 已存在但 `views` 未自增，永远追不回来。

**修复建议**: 用 `prisma.$transaction` 包裹，或改为定时批量回写。

---

# ⚡ 三、性能问题（12 个）

## 🟠 PERF-01: judge/executor.ts Windows 路径每 100ms execSync('tasklist') 阻塞主线程

**严重度**: 高危 (High)
**文件**: [lib/judge/executor.ts:101-128](file:///e:/桌面/dsoj/lib/judge/executor.ts#L101-L128) + [lib/judge/executor.ts:364-411](file:///e:/桌面/dsoj/lib/judge/executor.ts#L364-L411)

**分析**: Windows 下每 100ms 调用 `execSync('tasklist /fi "PID eq ..."')`，每次 spawn 一个 cmd 子进程，开销 5-50ms，阻塞 Node.js 主线程。`JUDGE_MAX_CONCURRENT > 1` 时多个选手进程同时监控会叠加阻塞，影响 WebSocket 推送和 API 响应。

**修复建议**: 生产环境必须 `USE_DOCKER=true` 走 Linux 容器路径；Windows 开发环境可接受但需注意。

---

## 🟡 PERF-02: ensureDockerImage 首次 docker pull 同步阻塞 5 分钟

**严重度**: 中危 (Medium)
**文件**: [lib/judge/executor.ts:708-732](file:///e:/桌面/dsoj/lib/judge/executor.ts#L708-L732)

**分析**: 首次评测时 `execSync('docker pull ...')` 同步阻塞 Node.js 主线程长达 5 分钟（`timeout: 300_000`），期间所有 HTTP / WebSocket 请求被挂起。模块级 `pulledImages` Set 缓存只首次触发。

**修复建议**: 改为 `spawn` + await 流式处理，或启动时预拉取镜像。

---

## 🟡 PERF-03: testcase.ts writeFileSync / rmSync 阻塞主线程

**严重度**: 中危 (Medium)
**文件**: [lib/problem/testcase.ts:307-332](file:///e:/桌面/dsoj/lib/problem/testcase.ts#L307-L332)

**分析**: `saveTestCaseFiles` 是 `async` 函数但内部用 `writeFileSync` 串行同步写入最多 100 个文件，`rmSync` 递归删除也阻塞。只要被任何 API 触发就会阻塞事件循环。

**修复建议**: 改用 `fs/promises` 的 `writeFile` / `rm`。

---

## 🟡 PERF-04: testcase 上传 50MB 一次性读入内存 + AdmZip 全量解压

**严重度**: 中危 (Medium)
**文件**: [app/api/admin/testcases/upload/route.ts:42-49](file:///e:/桌面/dsoj/app/api/admin/testcases/upload/route.ts#L42-L49) + [lib/problem/testcase.ts:198-298](file:///e:/桌面/dsoj/lib/problem/testcase.ts#L198-L298)

**分析**: `MAX_FILE_SIZE = 50MB`，`file.arrayBuffer()` 一次性读入内存，`AdmZip` 全量解压所有 entry。内存峰值约为解压后总大小的 2-3 倍。并发上传时 RSS 暴涨。

**修复建议**: 改用流式解压（如 `unzipper` / `yauzl`），或限制并发上传数。

---

## 🟡 PERF-05: cache.get 无 singleflight，热点 key 过期瞬间击穿

**严重度**: 中危 (Medium)
**文件**: [lib/cache.ts:48-73](file:///e:/桌面/dsoj/lib/cache.ts#L48-L73)

**分析**: `cache.get` 未实现 in-flight Promise 去重。当 `ranking:global` 60s TTL 到期瞬间，100 个并发请求同时触发 100 次 `prisma.user.findMany + prisma.submission.groupBy`，数据库瞬时压力骤增。排行榜页前端 30s 轮询加剧问题。

**修复建议**: 在 `cache.get` 中加入 in-flight Promise Map，相同 key 的并发请求共享同一个 Promise。

---

## 🟡 PERF-06: redistributeAllProblemScores 串行循环

**严重度**: 中危 (Medium)
**文件**: [lib/problem/testcase.ts:120-129](file:///e:/桌面/dsoj/lib/problem/testcase.ts#L120-L129)

**分析**: N 个题目串行执行 `redistributeTestScores`，每个内部还有 findMany + Promise.all(update)，共 ~2N 次数据库往返，全部串行。数百题目时性能差。

**修复建议**: 改为 `Promise.allSettled` 并发，或分批并行。

---

## 🔵 PERF-07: addTrainingProblems 逐条串行 create

**严重度**: 低危 (Low)
**文件**: [lib/training/service.ts:419-427](file:///e:/桌面/dsoj/lib/training/service.ts#L419-L427)

**分析**: MongoDB 不支持 `createMany({ skipDuplicates: true })`，改为逐条 `create` 串行 N 次往返。

**修复建议**: 先 `findMany` 已存在的 ID 过滤，再 `createMany` 批量插入。

---

## 🔵 PERF-08: recoverPendingJobs 串行入队

**严重度**: 低危 (Low)
**文件**: [lib/judge/worker.ts:197-228](file:///e:/桌面/dsoj/lib/judge/worker.ts#L197-L228)

**分析**: 服务重启时若有大量 pending 提交（100+），逐个 `await addJudgeJob` 会拖慢启动恢复。

**修复建议**: 改为 `Promise.allSettled` 并发入队。

---

## 🔵 PERF-09: cache.ts 无 dispose 方法

**严重度**: 低危 (Low)
**文件**: [lib/cache.ts:8-15](file:///e:/桌面/dsoj/lib/cache.ts#L8-L15)

**分析**: `setInterval` 未暴露 `dispose()` / `clearInterval`。优雅关闭时该 timer 会延迟进程退出。

**修复建议**: 补 `dispose()` 方法并在 `server.ts` gracefulShutdown 中调用。

---

## 🔵 PERF-10: rate-limit MemoryStore 无 LRU 上限

**严重度**: 低危 (Low)
**文件**: [lib/rate-limit.ts:22](file:///e:/桌面/dsoj/lib/rate-limit.ts#L22) + [lib/websocket/server.ts:29](file:///e:/桌面/dsoj/lib/websocket/server.ts#L29)

**分析**: `MemoryStore.store` 仅按 resetTime 过期清理，无最大容量限制。攻击者用大量不同 IP 可撑大 Map 占用内存。

**修复建议**: 增加 MAX_ENTRIES 上限 + LRU 淘汰策略。

---

## 🔵 PERF-11: 缺失数据库索引（4 处）

**严重度**: 低危 (Low)

| 模型               | 缺失索引             | 查询场景          | 文件行号                                                                     |
| ------------------ | -------------------- | ----------------- | ---------------------------------------------------------------------------- |
| Comment            | `[parentId]`         | 查询评论回复      | [schema.prisma:397-420](file:///e:/桌面/dsoj/prisma/schema.prisma#L397-L420) |
| VerificationLog    | 无任何索引           | 按 problemId 查询 | [schema.prisma:752-760](file:///e:/桌面/dsoj/prisma/schema.prisma#L752-L760) |
| AiGenerationLog    | `[status]`           | 按状态筛选统计    | [schema.prisma:651-665](file:///e:/桌面/dsoj/prisma/schema.prisma#L651-L665) |
| ContestParticipant | `[contestId, score]` | 按分数排序        | [schema.prisma:234-246](file:///e:/桌面/dsoj/prisma/schema.prisma#L234-L246) |

**修复建议**: 在 `prisma/schema.prisma` 中添加对应 `@@index`。

---

## 🔵 PERF-12: getMyRankAdvanced 无缓存，每次全表 count

**严重度**: 低危 (Low)
**文件**: [lib/ranking/service.ts:182-220](file:///e:/桌面/dsoj/lib/ranking/service.ts#L182-L220)

**分析**: `getMyRankAdvanced` 无缓存，每次调用执行 2 次 DB 查询（含 `user.count` 全表扫描）。对比 `getMyRank` 有 60s 缓存。

**修复建议**: 加 30-60s 缓存。

---

# 🧹 四、代码质量问题（15 个）

## 🟠 QUAL-01: AI generator choices[0] 无长度检查，空数组时崩溃

**严重度**: 高危 (High)
**文件**: [lib/ai/generator.ts:240](file:///e:/桌面/dsoj/lib/ai/generator.ts#L240) + [lib/ai/generator.ts:332](file:///e:/桌面/dsoj/lib/ai/generator.ts#L332) + [lib/ai/solution-generator.ts:242](file:///e:/桌面/dsoj/lib/ai/solution-generator.ts#L242)

```ts
const msg = response.choices[0].message as any; // 若 choices 为空，TypeError
```

**分析**: 若 AI 返回空 `choices` 数组（API 异常/限流/内容过滤），直接抛 `TypeError: Cannot read properties of undefined`，服务崩溃。

**修复建议**: 增加 `if (!response.choices?.length) throw new Error('AI 返回空响应')`。

---

## 🟠 QUAL-02: 队列 shift()! 非空断言，空队列时崩溃

**严重度**: 高危 (High)
**文件**: [lib/judge/queue.ts:148](file:///e:/桌面/dsoj/lib/judge/queue.ts#L148) + [lib/ai/queue.ts:137](file:///e:/桌面/dsoj/lib/ai/queue.ts#L137) + [lib/ai/solution-queue.ts:126](file:///e:/桌面/dsoj/lib/ai/solution-queue.ts#L126)

```ts
const job = this.queue.shift()!; // 若 queue 为空，job = undefined，后续访问属性崩溃
```

**分析**: 队列竞态条件下 `shift()` 返回 `undefined`，非空断言 `!` 绕过 TypeScript 检查，运行时抛 `TypeError`。

**修复建议**: 增加 `if (!job) return` 守卫。

---

## 🟡 QUAL-03: 空 catch 块吞掉所有错误

**严重度**: 中危 (Medium)
**文件**: [components/StudentCompletionTable.tsx:132](file:///e:/桌面/dsoj/components/StudentCompletionTable.tsx#L132) + [components/StudentCompletionTable.tsx:152](file:///e:/桌面/dsoj/components/StudentCompletionTable.tsx#L152)

```ts
} catch { } finally {   // 加载用户代码失败时完全静默
} catch { }              // 复制到剪贴板失败时静默
```

**分析**: 故障不可观测，用户无法得知操作失败。

**修复建议**: 至少添加 `logger.error` 或向用户显示 toast 提示。

---

## 🟡 QUAL-04: any 类型滥用（150+ 处）

**严重度**: 中危 (Medium)
**文件**: `lib/ai/queue.ts`（13 处）、`lib/ai/generator.ts`（15 处）、`lib/contest/service.ts`（18 处）、`lib/class/service.ts`（23 处）、`lib/api/withApi.ts`（7 处）、`lib/cache.ts`（4 处）等

**重点问题**:

- `lib/auth/login-service.ts:89`: `function mapUserToResponse(user: any)` — 用户对象完全无类型
- `server.ts:215`: `jwt.verify(..., process.env.JWT_SECRET!) as any` — JWT payload 失去类型
- `lib/ai/response-parser.ts`: 7 个函数返回类型为 `any`

**修复建议**: 逐步替换为 Prisma 生成的类型或自定义 interface。

---

## 🟡 QUAL-05: as any 绕过 Prisma 类型系统（67 处）

**严重度**: 中危 (Medium)

**重点问题**:

- `lib/solution/view-helper.ts:12`: `(prisma as any).solutionView` — 绕过 Prisma client 类型
- `lib/contest/service.ts:197,249,572`: `contestData as any`、`problem.comparisonMode as any`
- `lib/submission/service.ts:164,166,242`: `problem.comparisonMode as any`、`(problem.testCases as any[])`
- `lib/ai/config.ts:68-72`: 连续 6 处 `(aiModel as any).xxx`

**修复建议**: 确保 `prisma generate` 正确执行，使用 Prisma 生成的类型替代 `as any`。

---

## 🟡 QUAL-06: 分页逻辑重复 15+ 处

**严重度**: 中危 (Medium)

**重复模式**: `skip: (page - 1) * pageSize, take: pageSize` + `totalPages: Math.ceil(total / pageSize)`

**重复文件**: `lib/contest/service.ts`（3 处）、`lib/problem/service.ts`（2 处）、`lib/class/service.ts`（5 处）、`lib/training/service.ts`（2 处）、`lib/solution/service.ts`（2 处）、`lib/notification/service.ts`（1 处）、`lib/ranking/service.ts`（1 处）、`lib/ai/service.ts`（1 处）

**修复建议**: 提取 `paginate<T>(model, where, options)` 工具函数。

---

## 🟡 QUAL-07: 两套 validation 系统并存

**严重度**: 中危 (Medium)
**文件**: [lib/validation.ts](file:///e:/桌面/dsoj/lib/validation.ts)（旧系统）vs [lib/api/validation.ts](file:///e:/桌面/dsoj/lib/api/validation.ts)（新系统）

**分析**: 两个文件都有 `validateObjectId` 同名函数但签名不同。`lib/auth/login-service.ts` 从旧系统导入 `validateRequired`，而 `lib/contest/validation.ts` 等从新系统导入，混用增加维护成本。

**修复建议**: 统一为一套系统，删除旧系统。

---

## 🔵 QUAL-08: catch 中仅 console.log 不返回错误响应

**严重度**: 低危 (Low)

| 文件                                                                                                  | 行号                                 | 问题 |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------ | ---- |
| [contexts/UserContext.tsx:49-51](file:///e:/桌面/dsoj/contexts/UserContext.tsx#L49-L51)               | 刷新用户信息失败被吞，调用方无法感知 |
| [contexts/UserContext.tsx:66-68](file:///e:/桌面/dsoj/contexts/UserContext.tsx#L66-L68)               | 登出失败被吞，UI 仍跳转              |
| [contexts/SettingsContext.tsx:38-40](file:///e:/桌面/dsoj/contexts/SettingsContext.tsx#L38-L40)       | 设置加载失败无降级反馈               |
| [components/AdminLayout.tsx:133-135](file:///e:/桌面/dsoj/components/AdminLayout.tsx#L133-L135)       | 通知拉取失败无重试/降级              |
| [components/ai/ModelSelector.tsx:57-58](file:///e:/桌面/dsoj/components/ai/ModelSelector.tsx#L57-L58) | 模型列表加载失败无提示               |

**修复建议**: 增加 toast/错误提示 UI。

---

## 🔵 QUAL-09: 缓存清除逻辑散落各 service，仅 2 个用 cache-keys.ts

**严重度**: 低危 (Low)

**分析**: 虽已有 [lib/constants/cache-keys.ts](file:///e:/桌面/dsoj/lib/constants/cache-keys.ts) 集中管理缓存 key，但只有 contest 和 problem 部分使用，其余 service 仍写字符串字面量。缓存失效需手动列所有相关 key，极易漏清。

**修复建议**: 所有 service 统一使用 `CacheKeys` 工具类。

---

## 🔵 QUAL-10: process.env.X || 'localhost:...' 默认值

**严重度**: 低危 (Low)

| 文件                                                                       | 行号                                    | 默认值 |
| -------------------------------------------------------------------------- | --------------------------------------- | ------ |
| [lib/prisma.ts:12](file:///e:/桌面/dsoj/lib/prisma.ts#L12)                 | `mongodb://localhost:27017/oj_platform` |
| [lib/mongodb-direct.ts:12](file:///e:/桌面/dsoj/lib/mongodb-direct.ts#L12) | 同上                                    |
| [lib/redis.ts:7](file:///e:/桌面/dsoj/lib/redis.ts#L7)                     | `redis://localhost:6379`                |

**分析**: 生产环境若漏配环境变量会静默连到 localhost。

**修复建议**: 生产模式下（`NODE_ENV=production`）环境变量缺失应抛错而非回退。

---

## 🔵 QUAL-11: IP 缺失返回 '0.0.0.0'，污染统计与限流

**严重度**: 低危 (Low)
**文件**: [app/api/solutions/[id]/route.ts:24](file:///e:/桌面/dsoj/app/api/solutions/%5Bid%5D/route.ts#L24)

```ts
return req.headers.get("x-real-ip") || "0.0.0.0";
```

**修复建议**: 返回 `'unknown'` 而非 `'0.0.0.0'`。

---

## 🔵 QUAL-12: contexts/UserContext.tsx refreshUser() 未 await

**严重度**: 低危 (Low)
**文件**: [contexts/UserContext.tsx:58](file:///e:/桌面/dsoj/contexts/UserContext.tsx#L58)

```ts
const login = useCallback((userData: User, token?: string) => {
  ...; refreshUser()  // 未 await，错误静默丢失
}, [refreshUser])
```

**修复建议**: 添加 `await` 或在 `refreshUser` 内部 catch 并提示。

---

## 🔵 QUAL-13: app/sitemap.ts 兜底域名是占位符

**严重度**: 低危 (Low)
**文件**: [app/sitemap.ts:4](file:///e:/桌面/dsoj/app/sitemap.ts#L4)

```ts
process.env.NEXT_PUBLIC_BASE_URL || "https://example.com";
```

**修复建议**: 未配置时不应生成 sitemap，或抛构建错误。

---

## 🔵 QUAL-14: lib/judge/executor.ts 硬编码 ulimit

**严重度**: 低危 (Low)
**文件**: [lib/judge/executor.ts:208](file:///e:/桌面/dsoj/lib/judge/executor.ts#L208)

```ts
("--ulimit", "nofile=1024:1024");
```

**修复建议**: 通过环境变量或 Problem 配置注入。

---

## 🔵 QUAL-15: 单进程内存缓存多实例不共享

**严重度**: 低危 (Low)
**文件**: [lib/cache.ts:8-15](file:///e:/桌面/dsoj/lib/cache.ts#L8-L15)

**分析**: `cache` 是进程级 `Map`，多实例部署（PM2 cluster / Docker 多副本）时各实例缓存独立，同一 key 会在每个实例各触发一次 DB 查询。虽有 `lib/redis.ts` 提供 Redis，但 `Cache` 类未集成 Redis 后端。

**修复建议**: 将 `cache.get/set` 改为 Redis 优先 + 内存 fallback。

---

# 📋 优先级修复建议

## P0 — 立即处理（影响线上安全/稳定）

| ID      | 问题                                    | 估时 |
| ------- | --------------------------------------- | ---- |
| SEC-01  | 提交详情接口增加鉴权 + 所有权校验       | 1h   |
| SEC-02  | 提交列表改 include 为 select，排除 code | 1h   |
| QUAL-01 | AI generator 增加 choices 空数组守卫    | 0.5h |
| QUAL-02 | 队列 shift()! 增加空值守卫              | 0.5h |

## P1 — 2 周内（影响功能正确性）

| ID       | 问题                                | 估时 |
| -------- | ----------------------------------- | ---- |
| SEC-03   | 竞赛提交列表代码脱敏                | 2h   |
| LOGIC-01 | 题目删除回退 solvedCount            | 3h   |
| LOGIC-02 | isFirstAccepted 改主库读 + 原子操作 | 4h   |
| LOGIC-03 | 竞赛结束触发排名落库                | 4h   |
| LOGIC-04 | OI 模式过滤竞赛后提交               | 1h   |
| LOGIC-05 | 点赞 P2002 状态修正                 | 2h   |
| LOGIC-06 | 注册捕获 P2002 返回友好错误         | 1h   |
| LOGIC-09 | 缓存改为先写 DB 再清缓存            | 2h   |
| LOGIC-10 | deleteUserSolution 补清列表缓存     | 0.5h |
| LOGIC-11 | 分页统一校验 page/pageSize 下限     | 2h   |
| PERF-01  | 生产环境强制 USE_DOCKER=true        | 1h   |
| PERF-05  | cache.get 增加 singleflight         | 3h   |

## P2 — 1 个月内（提升性能/可维护性）

| ID       | 问题                                | 估时 |
| -------- | ----------------------------------- | ---- |
| LOGIC-07 | 班级审批容量检查改事务内校验        | 2h   |
| LOGIC-08 | 题单加入改事务包裹                  | 1h   |
| LOGIC-12 | datetime-local 时区统一处理         | 4h   |
| LOGIC-13 | 热力图日期边界时区修正              | 3h   |
| PERF-02  | docker pull 改异步 spawn            | 3h   |
| PERF-03  | testcase.ts 改 fs/promises          | 2h   |
| PERF-04  | testcase 上传改流式解压             | 4h   |
| PERF-06  | redistributeAllProblemScores 改并发 | 2h   |
| PERF-11  | 补 4 个缺失索引                     | 1h   |
| PERF-12  | getMyRankAdvanced 加缓存            | 1h   |
| QUAL-03  | 空 catch 块补充日志/提示            | 1h   |
| QUAL-06  | 提取分页工具函数                    | 3h   |
| QUAL-07  | 合并两套 validation 系统            | 4h   |

## P3 — 长期规划

| ID         | 问题                          | 估时 |
| ---------- | ----------------------------- | ---- |
| SEC-04     | 删除 getUserFullInfo 死代码   | 0.5h |
| LOGIC-14   | prisma generate 启动校验      | 1h   |
| LOGIC-15   | Solution views 改定时批量回写 | 1d   |
| PERF-07    | addTrainingProblems 改批量    | 2h   |
| PERF-08    | recoverPendingJobs 改并发入队 | 2h   |
| PERF-09    | cache.ts 补 dispose           | 0.5h |
| PERF-10    | rate-limit 增加 LRU 上限      | 2h   |
| QUAL-04    | 逐步替换 any 类型             | 1 周 |
| QUAL-05    | 逐步替换 as any               | 1 周 |
| QUAL-08-15 | 其余代码质量问题              | 按需 |

---

# 📈 总结

## 核心风险

1. **最大风险**: SEC-01 + SEC-02 提交代码未鉴权泄露 — 任何人可读取任意用户代码，竞赛/作业作弊风险极高
2. **数据一致性**: LOGIC-01/02/03 三处数据计数问题 — 题目删除不回退、并发 AC 重复计数、竞赛排名不落库
3. **运行时崩溃**: QUAL-01/02 两处非空断言 — AI 返回空响应或队列竞态时服务直接崩溃

## 正面发现

- **无注入风险**: 全项目无 `prisma.$queryRaw` / 字符串拼接查询
- **无 XSS**: 无 `dangerouslySetInnerHTML`，Markdown 渲染使用 `rehype-sanitize` + 自定义 schema
- **无命令注入**: 评测模块使用 `spawn` 数组形式 + 语言白名单 + 路径正则校验
- **无路径穿越**: 上传使用 UUID + `basename` + Zip Slip 防御
- **缓存体系**: TTL 分层合理（30s 热点 / 60s 中频 / 5min 低频），评测完成主动失效
- **索引覆盖**: 核心查询（Submission/Notification/Solution/ClassMember）索引完整
- **优雅关闭**: WebSocket / rate-limit / error-monitor / judge queue 均有 dispose/clearInterval

## 建议执行顺序

1. **立即**: P0 四项（2-3h 可完成）
2. **本周**: P1 安全 + 数据一致性（~25h）
3. **本月**: P2 性能 + 可维护性（~30h）
4. **长期**: P3 代码质量（按需推进）
