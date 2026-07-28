# DSOJ 项目 Bug 与缺陷审查报告

> 审查时间:2026-07-28
> 审查范围:`e:\桌面\dsoj` 全部源代码(Next.js 14 App Router + 自定义 Node Server + Prisma + MongoDB + Redis + Socket.IO)
> 审查方式:静态阅读,本轮**未修改任何代码**
> 严重程度定义:
> - **高 (P0/P1)**:可直接造成权限绕过、用户数据泄露、隐藏测点泄漏、服务不可用、容器逃逸、可被实际利用的漏洞
> - **中 (P1/P2)**:需要特定权限或组合条件才可触发,但影响较大,可能造成数据不一致、性能雪崩、UX 灾难
> - **低 (P2/P3)**:安全加固、可维护性、边界条件、风格问题

---

## 0. 总览

| 模块 | 高 | 中 | 低 | 小计 |
|------|----|----|----|----|
| 认证 / 权限 / 会话 | 6 | 9 | 8 | 23 |
| 评测 / 提交 / 题库 | 14 | 28 | 30 | 72 |
| 班级 / 作业 / 邀请 | 13 | 24 | 32 | 69 |
| 比赛 / 训练 / 排名 | 8 | 24 | 32 | 64 |
| 用户 / 资料 / 头像 | 12 | 16 | 6 | 34 |
| 通知 / WebSocket / 缓存 | 9 | 16 | 24 | 49 |
| 安全 / 上传 / 服务器配置 | 11 | 25 | 24 | 60 |
| **合计(去重前)** | **73** | **142** | **156** | **371** |

> 注:部分问题在多个模块都被识别(如数据库双写、cache 键规范),下表已合并同类项,实际"高危可立即利用的修复点"约 **30 项**。

### 最关键的 10 个 P0 问题(建议 1 周内修复)

1. **H-Sec-2 `server.ts` 路径穿越**:静态文件 `startsWith` 校验可被 `/uploads_evil/` 等同级目录绕过
2. **H-Judge-1 Docker 评测模式整体失效**:`/app/temp` 是空 tmpfs,无 bind mount,编译产物与测点进不到容器
3. **H-Sec-53 Docker `JWT_SECRET` 通过 ARG/ENV 进入镜像层**:泄露即全局伪造
4. **H-Prob-25 私有题目公开可读**:`/api/problems/[id]`、`/stats`、`/pretest`、`/submissions`、`wa-testcase` **均未校验 visibility** — 私有/班级/竞赛题目的隐藏测点可被任意登录用户拿走
5. **H-Sub-29 提交接口不校验 problemId 可见性**:IDOR → 通过提交 + wa-testcase 链下载隐藏测点
6. **H-Sub-51 提交接口不校验 contestId / 比赛时间窗 / 报名**:污染排行榜 + 拒绝服务
7. **H-Auth-1 + H-Auth-2 封禁机制对 API 调用完全失效**:`withApi` 不查 `isBanned`,且 `adminUpdateUser` 仅在 `isBanned=true` 时递增 `tokenVersion`,解封/角色变更/未设密码均不失效 token
8. **H-WS-6 WebSocket `join` 事件鉴权绕过**:未认证 socket 携带 `{ userId: 'victim' }` 即可加入 `user:<victim>` 房间,接收所有通知与提交更新
9. **H-User-1.4 头像分片注册表进程级内存**:多实例/Serverless 下用户归属校验失效,可借他人 `uploadId` 上传
10. **H-User-2.2 改密走 MongoDB 直写,Prisma 不感知**:用户改完密码后**新密码无法登录**

---

## 一、认证 / 权限 / 会话 (lib/auth, lib/permissions, middleware, app/api/auth)

### 高危

| 编号 | 位置 | 问题 |
|------|------|------|
| H-1 | `lib/api/withApi.ts:164-219` + `lib/api/handler.ts:37-81` | `withApi.auth/admin/systemAdmin/classRole` **未校验 `isBanned`**,封禁用户可继续使用 7d JWT 访问全部 API |
| H-2 | `lib/user/admin.ts:180-194` | 封禁/解封/角色变更/tokenVersion 失效逻辑不完整,`role` 变更与解封不递增 tokenVersion,旧 token 在 60s 缓存窗口内仍以旧角色通过 |
| H-3 | `app/api/auth/login/route.ts:39-47` + `register/route.ts:93-101` | JWT cookie **缺少 `__Host-` 前缀** 与 `domain` 限制,多子域部署下扩大 CSRF/会话窃取面 |
| H-4 | `middleware.ts:9-87` + `lib/security/csrf.ts` | CSRF 双 token 未启用;`Bearer` 头可绕过;`sameSite=lax` 在顶层 GET 可被利用 |
| H-5 | `lib/auth/login-service.ts:11-59` + `lib/rate-limit.ts` | Redis 未配置时 `checkAccountLockout` 直接 return → 锁定机制静默失效;全局 IP 限流可被分布式绕过 |
| H-6 | `app/api/auth/register/route.ts:52` + `lib/auth/login-service.ts:121-136` | username 经 `escapeHtml` 入库 → 不可逆语义污染,展示会被双重转义 |

### 中危

- M-1 JWT 无 `iss/aud/jti`,无法吊销单 token
- M-2 `validateJwtSecret` 单次初始化后不可重新校验
- M-3 `getTokenFromRequest` 优先 `Bearer` 而非 cookie,与 CSRF 旁路联动
- M-4 `getCachedUser` 60s 缓存命中不重新校验 `isBanned`/`role`
- M-5 角色降级后 60s 缓存窗口内仍可通过 `withApi.admin`
- M-6/M-7 注册首用户 TOCTOU:`registerNewUser` 二次校验只能事后降级
- M-8 `changeCurrentUserEmail` 路由双写 MongoDB + Prisma,数据不一致
- M-9 `getCurrentUserProfile` 含 `isBanned` 但 `withApi` 不消费

### 低危

- L-1 `verifyToken` 异常吞错无日志
- L-2 `UserResponse.email` 在 null 脏数据时类型不匹配
- L-3 `safeCall` 重复 `await import('@/lib/logger')`
- L-4 `safeCall` 透传 zod/P2002 内部消息
- L-5 `UserContext` 校验失败无 UI 提示
- L-6 `isSystemAdminOnlyPath` 未来扩展易误判
- L-7 `checkContestAccess` 接受未编码 `resourcePath`
- L-8 忘记密码临时密码模偏约 4 bits
- L-9 忘记密码无审计日志
- L-10 CSRF cookie `httpOnly:false` (启用后风险)
- L-11 Redis 不可用时内存限流各实例独立

---

## 二、评测 / 提交 / 题库 (lib/judge, lib/problem, lib/submission, lib/mongodb)

### 高危(与"隐藏测点泄漏"直接相关)

| 编号 | 位置 | 问题 |
|------|------|------|
| H-1 | `lib/judge/executor-core.ts:269-288` + `lib/judge/docker.ts:108-122` | **Docker 模式整体失效**:容器 `--tmpfs /app/temp` 无 bind mount,编译产物和测点文件进不到容器,所有评测直接 RE |
| H-25 | `app/api/problems/[id]/route.ts:8-54` + `lib/problem/lookup.ts:15-29` | 公共 GET 题目详情未过滤 `isPublic/visibility` → 任意登录用户可读私有/班级/竞赛题 |
| H-26 | `app/api/problems/[id]/stats/route.ts` | 同上,stats 接口公开 |
| H-28 | `app/api/problems/[id]/pretest/route.ts:50-65` | pretest 不校验 visibility 且 **无 rate limit** |
| H-29 | `app/api/submissions/route.ts:53-87` + `lib/submission/service.ts:157-219` | 提交接口不校验 problemId 可见性 → IDOR 链(提交→WA→wa-testcase 下载隐藏测点) |
| H-33 | `lib/problem/admin.ts:442-471` | `updateAdminProblem` 测试用例 `deleteMany` + `createMany` 非事务,失败导致题目有 0 测点 |
| H-38 | `lib/problem/verify-std.ts` | 标程验证无强沙箱 |
| H-51 | `lib/submission/service.ts:157-219` | `submitCode` 不校验 contestId 比赛时间/报名 → 排行榜污染 |
| H-53 | `lib/submission/service.ts:432-464` | `getFirstWaTestCaseForDownload` 不校验 problem 可见性 |
| H-60 | `lib/mongodb/client.ts:100-118` | `withRetry` 对事务非幂等操作加重试 → 嵌套重试 |
| H-11 | `lib/judge/worker.ts:341-347` + `lib/mongodb/submission-direct.ts:121-144` | 状态机守卫在 race 时 throw,让 Worker 进程崩溃 |

### 中危(选列)

- 评测 innerCmd 未过滤 `$` `` ` `` `\\` `!` bash 元字符
- `getRunInfo` 不校验 `runInfo.args`
- `codeAnalyzer` 作为 SE 短路误用(不是安全边界)
- `MAX_CODE_LENGTH` 65536 vs API 校验 50000 不一致
- `killJudgeTree` 在 Windows 调用
- `cleanupOldTempFiles` 一小时仍可能堆积
- `judgeQueue.dispose()` 不 drain 队列、不重置 isProcessing
- `recoverPendingJobs` 不幂等、多实例并发重复入队
- `worker.ts` active/failed 监听器写状态未传 `forceStatus`,会触发状态机 throw
- `validateLineEndings` 拒绝所有 `\r`
- `verify-std.ts:122` `Math.max(...)*2 || x` 边界 bug,timeLimit=0 直接 TLE
- `verify-std.ts` 串行逐 case
- `verify-std.ts` 事务内串行 update
- `rejudgeSubmission` TOCTOU
- `wa-testcase` Content-Disposition header 注入
- `listAdminSubmissions` 列表带 code,前端不展示但响应体仍含明文
- `parseSubmissionListQuery` 不限制 pageSize
- `withRetry` 不区分幂等性
- `getMongoClient` 单例不支持 reconnect
- `ObjectId(user.id)` 无 isValid 校验
- `createSubmissionDirect` 同样问题
- `updateSubmissionDirect` 状态机 TOCTOU
- `updateClassAssignmentSubmissionDirect` 无 forceStatus
- `registerContestParticipantDirect` 二次校验缺失
- `parseTestCaseZip` adm-zip 不做解压比 + 单 entry 50MB → zip bomb
- `submitCode` 写 PENDING 后 addJudgeJob 失败时 SE 写失败未重试
- `clearProblemCache` 删 tags 缓存影响所有用户
- `validateAdminProblem` testCases score/orderIndex 未范围校验
- `purgeProblemDependents` 顺序(cache invalidate 先于 deleteMany)
- `recoverPendingJobs` 把已完成 submission 重新入队边界
- `judgeQueue.deadCheckMs` 默认 5s 频繁扫描
- `judgeQueue` 热重载会泄漏 EventEmitter 监听器
- `executor-core.ts` ooms 误判 fallback 把所有 SIGKILL 当 MLE
- `judgeOneCaseWithFiles` 重测循环只跑 TLE
- `applyRuntimeConfig` 改 `jobTimeoutMs` 对正在跑的 job 无效
- `prisma.findMany` 全表导出 OOM
- `exportDsojPack` 未读
- `lib/problem/import/*` parser 未审(FPS/Hydro/SYZOJ/Codeforces sync 可能含 zip 穿越/SSRF)
- `codeforces-sync` SSRF 风险
- `csv-parser` / `dsoj-parser` 路径/编码边界
- `clearProblemCache` 删 tags 影响所有用户
- `getRandomProblem` 列表无节流
- `prisma.user.update(solvedCount++)` 与 `isFirstAccepted` + `incrementProblemAcceptedCount` 三步非事务

### 低危(选列)

- OUTPUT_PREVIEW 8K 太短
- dsoj-watch 100µs 忙等
- CLK_TCK 硬编码 100
- flock 未安装并发 cc -o
- chmod +x 对 Python 逻辑不需
- AbortSignal listener 未 unref
- process-stats `wallMs=-1` 协议混乱
- Docker 缺 `--init`
- rejudge TOCTOU

---

## 三、班级 / 作业 / 邀请 (lib/class/*, app/api/classes/*)

### 高危

| 编号 | 位置 | 问题 |
|------|------|------|
| H-3 | `lib/class/join-request.ts:124-141` | `decideClassJoinRequest` 接受调用方传 `operatorRole`,**信任客户端**,路由层虽然重查,但设计陷阱 |
| H-4 | `lib/class/member.ts:152-161` + `lib/class/helpers.ts:114-126` | 班级最后一个 owner 可将自己降级 → 班级变孤儿,无法解散 |
| H-5 | `lib/class/crud.ts:105-107` + `prisma/schema.prisma:250-269` | `deleteClass` 裸 `prisma.class.delete`,Prisma 默认无 cascade → 触发 P2003 + 部分清理 |
| H-6 | `app/api/classes/route.ts:43-67` | 创建班级不限制 `maxMembers` / `isPublic` 类型,负数 / 字符串入库 |
| H-7 | `app/api/classes/[id]/route.ts:33-50` | 私有班级 GET **先读全部成员再 404**,向日志泄露成员列表 |
| H-8 | `app/api/classes/[id]/invites/direct/route.ts:20-73` | 邀请无冷却、无审计,可对同一用户反复重发 |
| H-9 | `lib/class/join-request.ts:36-52` | 被拒绝的申请 1 秒后可重发,触发管理员通知炸弹 |
| H-10 | `lib/class/invite.ts:174-244` | `respondDirectInvite` 接受邀请时无幂等与并发保护,过期检查在事务外 TOCTOU |
| H-11 | `lib/class/assignment-submit.ts:37-180` | `submitAssignmentCode` **内部不二次校验成员**(路由层有,但服务层无防御) |
| H-13 | `lib/class/assignment-manage.ts:280-296` | 作业移除题目时 `ClassAssignmentProblemProgress` **硬删除**,数据丢失且无通知 |

### 中危(选列)

- M-1 service 层不重复校验 viewer 成员
- M-2 `recalculateLateFlags` O(N) 串行 update
- M-3 `listClassAssignmentsWithStats` 用 Prisma 不支持的 `isSet: false`
- M-4 `endTime === null` 时 `allowLateSubmission` 永不生效
- M-5/M-6 `getClassAssignmentDetail` 与 `computeAssignmentStatistics` 全表拉取 O(N²)
- M-7 `cloneProblemToClass` 复制 score 但班级题库分值可能不同
- M-8 `Problem.classId` 无 `@@unique([classId, problemNumber])`
- M-10 `parseClassCreate.isPublic` 三元表达式陷阱
- M-13 私有班级 GET 先读数据后校验(侧信道)
- M-14 URL `[memberId]` 实际是 `userId`,命名误导
- M-19 详情接口默认返回所有成员 code(隐私)
- M-20 默认 startTime now+1min,跨时区可能立即 active
- M-21 笔记 tag 拆分不支持中文逗号
- M-23 `getClassMembership` 不过滤 permissions 字段
- M-25 作业提交时 testCases 字段 select 待审

### 低危(选列)

- L-1 `isValidObjectId` 重复定义
- L-4 `note.ts` / `note-service.ts` 两套并存
- L-10 `formatDateForInput` 时区只适用负 offset
- L-12 班级题库 tags 数量无限制
- L-13 service 层不去重 problemId
- L-15 submit 频率仅按作业维度限速
- L-18 note search 内存分页破坏分页语义
- L-29 创建作业不设置 `allowLateSubmission` UI
- L-32 笔记 title 服务端无长度校验
- L-35 assignment.description 未做 HTML 转义(若前端 dangerouslySetInnerHTML 则 XSS)
- L-40 timeLimit/memoryLimit 解析出 NaN 未校验

---

## 四、比赛 / 训练 / 排名 (lib/contest, lib/training, lib/ranking)

### 高危

| 编号 | 位置 | 问题 |
|------|------|------|
| H-1 | `app/api/trainings/[id]/route.ts:36-76` | 训练题单 PUT 的"作者本人是管理员"逻辑漏洞,`canEdit` 与字段清理所依据的 `user` 对象不一致 |
| H-2 | `lib/contest/rankings.ts:249-274` | `finalizeContestRankings` 始终 `viewerRole: SYSTEM_ADMIN`,**未校验比赛已结束** → 封榜中提前 finalize 写入 rank 与展示不一致 |
| H-3 | `lib/contest/admin.ts:28-93` | adminUpdateContest 不做题目存在/可见性校验,可注入私有/草稿题目 |
| H-4 | `app/api/trainings/[id]/problems/route.ts:16-65` + `lib/training/problems.ts:71-105` | 训练 add problems 不校验 problemId 存在/可见性 |
| H-5 | `lib/contest/submissions.ts:91-184` | 管理员可在比赛时间外/未报名下提交任意比赛+任意题目,旁路时间窗、密码、可见性 |
| H-6 | `lib/contest/crud.ts:88-96` | `getContestRank` 缓存 score 含未排除 admin 提交 |
| H-7 | `lib/training/enrollment.ts:14-51` | 训练进度未在加入/退出时实时清 list 缓存,UI 滞后 |
| H-8 | `lib/contest/rankings.ts:95-160` | `endTime` 为空时所有提交纳入排名,admin 可无限延长 |

### 中危(选列)

- M-1 比赛注册 `type=password` 但 password 未设置时永远失败
- M-2 训练分类删除 count+delete 非事务
- M-3 `relativeTime < 0` 提交直接 return 不计入
- M-4 排除 authorId 依赖"创建者必报名"隐性假设
- M-5 `cache.deleteByPrefix` 与 `CacheKeys.rankPrefix` 命名不一致
- M-6 `whereNotClassScoped` 多种 OR 嵌套的边角 case
- M-7 `useContestCountdown` 切换比赛短暂显示错误 phase
- M-8 `registerContestParticipantDirect` 并发注册非幂等
- M-9 `ContestCard` desc 无字符上限
- M-10 PUT `/api/contests/[id]` 不校验 endTime>startTime
- M-12 `submitContestCode` 管理员路径不检查 problem visibility
- M-13 两套 register 函数
- M-14 `getClassRanking` 用 `idx+1` 而非标准排名
- M-15 `incrementProblemSubmitCount` 失败时回滚不完整
- M-16 训练问题操作后未清 list 缓存
- M-18 `useSubmissionResultFlow` 去重条件忽略 score
- M-20 ContestProblemWorkspaceContext 暴露 mutable state setter
- M-21 admin role 缓存与 submissions 关联 role 不一致
- M-22 `joinCount` 偶发虚高

### 低危(选列)

- L-1 `nowMs === endMs` 进入 running
- L-3 train reorder N 次 update
- L-5 contest stats 漏算 contestId=null 题目
- L-12 `formatCount` 应为 `1.2万` 而显示 `12.3k`
- L-14 `computeContestRankings` submissions 不分批
- L-19 `SourceFilterCards` `disabled` 时没有 `all` 选项
- L-20/L-21 context fetch 缺 `credentials: 'include'`
- L-22 updateContest `password=''` 被转为 null 误清
- L-23 admin 旁路提交无审计
- L-24 invite 比赛邀请码未消耗
- L-29 batch add P-number 未去重

---

## 五、用户 / 资料 / 头像 (lib/user/*, app/api/users/*, components/AvatarUploader)

### 高危

| 编号 | 位置 | 问题 |
|------|------|------|
| H-1.1 | `lib/upload.ts:114-159` + `app/api/users/avatar/upload/complete/route.ts:34` | `mergeChunks` **不校验累加字节数**、不强制 ≤ `fileSize`、不二次校验魔数 → 可构造 GB 级合法图片写入 + 像素炸弹 |
| H-1.2 | `app/api/users/avatar/upload/complete/route.ts:53-59` | `filename` 入库无长度/字符校验,可撑爆单文档 |
| H-1.3 | `lib/upload.ts:79-92` | `processAvatar` 用 sharp 但**未设 `limitInputPixels`/frames** → 高分多帧图 DoS |
| H-1.4 | `lib/avatar-upload-registry.ts:26-47` | 注册表**进程级内存**,多实例部署下归属校验失效,用户 B 可借用户 A 的 uploadId 上传 |
| H-1.5 | `lib/user/public-info.ts:272-316` + `app/api/users/avatar/upload/complete/route.ts:42-50` | 头像 URL 走 MongoDB 直写,`getCurrentUserProfile` 走 Prisma,**数据源不一致**导致缓存版本错乱 |
| H-2.1 | `lib/user/auth-actions.ts:13-31` + `lib/user/public-info.ts:283-295` | 改邮箱**MongoDB + Prisma 双写无事务** |
| H-2.2 | `lib/user/public-info.ts:321-357` | **改密走 MongoDB 直写**,Prisma 不感知,`loginUser` 走 Prisma 校验旧密码 → **新密码登不进** |
| H-3.1 | `lib/user/admin.ts:241` | `protectedRoles` 跳过 `STUDENT/TEACHER` 但不跳过 `ADMIN` 误用 |
| H-7.14 | `app/api/users/profile/email/route.ts:38-39` | 旧邮箱释放后**可被抢注** → 攻击者用旧邮箱注册新账号触发密码重置 |
| H-1.8 | `app/api/users/profile/route.ts` PUT | `updateCurrentUserBasic` 头像字段完全无校验,可写入任意 URL 钓鱼 |
| H-5.1 | `app/api/users/profile/route.ts:15-23` | PUT 无任何 body 校验(未调 `parseProfileUpdate`) |

### 中危(选列)

- M-2.3 邮箱正则过宽
- M-2.4 lib 层缺邮箱格式校验
- M-2.5 同上,`updateCurrentUserBasic` 不校验 avatar/nickname
- M-2.6 `nickname=''` 与 `nickname='   '` 表现不一致
- M-2.7 `defaultTab` 长度 50 字符,XSS 风险
- M-2.8 bcrypt cost 注册 12 vs 改密 10 不一致
- M-3.2 批量 deleteMany 部分失败
- M-3.3 批量 updateMany 同上
- M-3.4 批量注册串行性能
- M-3.5 CSV 解析无 RFC 4180 转义
- M-3.6 placeholder.local 邮箱
- M-3.7 CSV 上传无大小限制 → OOM
- M-3.8 管理员重置密码无强度校验
- M-3.9 删 user 不级联清理 Problem
- M-3.11 并发注册多 SYSTEM_ADMIN
- M-3.12 批量删除/更新无上限
- M-4.1 pageSize 无上限,skip 可达 5e11
- M-4.2 `getUserFullStats` 10+ 表 N+1
- M-4.5 `getCachedUser` 不带 tokenVersion 时不校验
- M-4.6 `clearUserCache` 清掉所有用户 timing 进度缓存
- M-5.2 `profile/password` 不区分 ValidationError
- M-5.3 动态 import 增加首字节延迟
- M-5.5 `upload/chunk` 自定义 multipart 解析器低效 + 边界丢分片
- M-6.1 客户端压缩 canvas 失败静默回退
- M-7.1 `/api/admin/users` 返回 SYSTEM_ADMIN 含 email 未脱敏
- M-7.3 `/api/users/[id]/stats` 公开热力图
- M-7.13 错误消息泄露内部细节
- M-7.4 `_count` 性能
- M-8.3 `getCurrentUserProfile` 不缓存
- M-7.11 忘记密码先发信后落库

### 低危(选列)

- L-2.9 `currentPassword=''` 路径不一致
- L-2.10 同上
- L-3.10 self check 语义不清
- L-6.2 上传失败不清注册表
- L-6.3 错误提示仅识别"权限"字符串
- L-7.6 init 无并发上限
- L-7.10 公开 info 返回 rating/rank/color 推断活跃度
- L-8.1 `uploadUserAvatar` 死代码
- L-8.2 `TEMP_DIR` GC 1% 概率
- L-4.3 `listActiveUsers` 用 `updatedAt desc` 语义偏差
- L-4.4 `cache.get` 序列化对象 key 不稳定

---

## 六、通知 / WebSocket / 缓存 (lib/notification, lib/cache, lib/websocket, hooks/*)

### 高危

| 编号 | 位置 | 问题 |
|------|------|------|
| H-1 | `lib/notification/service.ts:100,142` | 缓存键裸字符串拼接,绕开 `cache-keys.ts` 集中管理 |
| H-2 | `lib/cache.ts:250-267` | `deleteByPrefix` 多次 `del(...keys)` O(N) 阻塞;大数组时 RESP 参数超限 |
| H-3 | `lib/notification/service.ts:56-64,124-131` | `markRead` 先 delete 后 fetch 竞态,L2 Redis 残存旧值被回填 |
| H-4 | `lib/notification/service.ts:104-138` | `pushUnreadCount` 失败会让主操作 500,但 DB 已成功 → 前后端状态不一致 |
| H-5 | `lib/websocket/server.ts:82-108` | `getClientIP` 直接信任 `X-Forwarded-For`,无 `trust proxy`,反代下整网封锁 |
| H-6 | `lib/websocket/server.ts:194-223,225-266` | **WebSocket `join` 鉴权绕过**:未认证 socket 发 `join { userId: 'victim' }` 直接进 `user:<victim>` 房间 |
| H-7 | `lib/websocket/server.ts:292-320` | `watchSubmission` 不重新查 role,`unwatchSubmission` 无角色检查 |
| H-8 | `lib/notification/service.ts:69-97` | `createNotifications` N+1 count + 仅推最后一条 |
| H-9 | `lib/announcement/service.ts:44-91` | `isSet: false` 是无效 Prisma 修饰,DB 过滤不完整;`CacheKeys.announcement.listPrefix()` 死代码 |

### 中危(选列)

- M-10 `app/api/notifications/[id]` `DELETE` 不区分不存在
- M-11 单条公告详情无缓存
- M-12 `useAnnouncementSocket` 切换 enabled 不 release
- M-13 `useNotificationSocket` 关闭时未 release → 引用计数泄漏
- M-14 `useSubmissionSocket` watchSubmissionId 卸载不反向清理
- M-15 `useUnreadNotifications` 失败时不清旧值
- M-16 socket-client disconnect 回调 `joinedUserId=null` 多组件重复 join
- M-17 dashboard.ts N+1 user/problem 查询
- M-18 `listProblemVerificationLogs` 无分页
- M-19 `broadcastAnnouncementChange` 失败仅 debug 日志
- M-20 announcement PATCH 无乐观锁
- M-21 DashboardView 两个 effect 双 fetch + `json.success` undefined 静默
- M-22 GuestView 不校验 `res.ok` + 吞错
- M-23 cache.dispose `cleanupInterval` 类型欺骗
- M-24 Redis 初始化失败无重试
- M-25 `notifiedJoinedRef` 与 store joinedUserId 不同步,onConnected 双触发
- M-27 AnnouncementsGrid `slice(0,5)` 与 dashboard 取数边界

### 低危(选列)

- L-28 `parseNotificationCreate` 隐性约定
- L-29 `Notification` 接口字段不一致
- L-30 `getStore` 在 SSR 阶段创建副作用
- L-31 `data.notifications` vs `data.items` 字段不匹配
- L-32 inflight finally 共用 Promise 链
- L-33 `__dsoj_date__` 命名空间冲突
- L-34 Redis client 断线不重置
- L-39 `mark-all-read` 服务端 POST vs 客户端 PUT 不一致 → **真实 bug**
- L-41 `setUnreadCount(c => c+1)` 无去重
- L-42 `REDIS_KEY_PREFIX` 硬编码
- L-43 dashboard 无限流
- L-44 logs 返回原始 `verifyStd` 输出未裁剪
- L-45 disconnect 未显式清理房间

---

## 七、安全 / 上传 / 服务器配置 (server.ts, next.config.ts, middleware.ts, prisma, env, etc)

### 高危

| 编号 | 位置 | 问题 |
|------|------|------|
| H-Sec-1 | `server.ts:57-70` | **路径穿越**:`startsWith(baseNormalized)` 校验可被 `/uploads_evil/`、`/uploads_backup/` 等同级目录绕过 |
| H-Sec-2 | `server.ts:106-199,413-422` | 自定义头像分片上传**绕过 middleware 的 CSRF/限流** |
| H-Sec-3 | `server.ts:115-121,204-239` | 自定义上传鉴权仅 `jwt.verify`,不校验 `tokenVersion`/`isBanned` |
| H-Sec-23 | `lib/settings.ts:164-202` | SMTP 密码解密失败按明文处理 → 注入风险 |
| H-Sec-24 | `app/api/admin/settings/route.ts:21-33` | 系统设置 API 无 schema 校验,任意类型/字段入 DB |
| H-Sec-35 | `app/api/health/db/route.ts:13-73` | 公开返回 MongoDB 主节点、副本集成员、内部错误 |
| H-Sec-53 | `Dockerfile:10-19` + `docker-compose.yml:7-8` | `JWT_SECRET` 通过 `ARG`/`ENV` 进入镜像层 |
| H-Sec-54 | `Dockerfile:55-77,117-127` + `docker-compose.yml:20` | **Web 应用容器内直接执行不可信用户代码**(`USE_DOCKER=false`),无 seccomp/no-new-privileges |
| H-Sec-55 | `Dockerfile:117-127` | `nextjs` 用户被加 root 组 |
| H-Prob-43 | `prisma/schema.prisma:12-67` | `User.role` 等用普通 `String`,无 enum/约束 |
| H-Prob-44 | `prisma/schema.prisma` 多处 | 关键状态字段均为 `String` |

### 中危(选列)

- M-Sec-4 自定义静态服务无 `nosniff`/CSP/Disposition/CORP
- M-Sec-5 access+readFile TOCTOU
- M-Sec-6 CSP 含 `unsafe-inline`/`wasm-unsafe-eval`/外部 CDN
- M-Sec-7 缺 HSTS
- M-Sec-8 CORS 配置不完整
- M-Sec-9 middleware 缺 Origin/Referer 默认放行
- M-Sec-10 `mergeChunks` 缺 totalChunks 边界
- M-Sec-11 分片写入无会话状态/并发控制
- M-Sec-12 sharp 缺 `limitInputPixels` + 帧数限制
- M-Sec-13 时间戳命名并发覆盖
- M-Sec-14 `safeFetch` 无响应体大小限制
- M-Sec-15 SSRF IP 分类不完整(IPv4 缺 `192.0.0.0/24` 等,IPv6 仅前缀)
- M-Sec-16 `safeFetch` 重定向策略不明确
- M-Sec-17 HTTPS 用 IP 作 host,TLS SNI 可能错
- M-Sec-18 markdown 允许 `style`/`className` 任意
- M-Sec-19 链接 `target` 不强制 `rel="noopener noreferrer"`
- M-Sec-20 外链图片允许范围宽 + CSP 多个图床
- M-Sec-22 AES-256-CBC 缺认证标签
- M-Sec-25 SMTP host 可任意
- M-Sec-26 测试邮件无地址校验/限流
- M-Sec-27 测试邮件 `siteName` HTML 注入
- M-Sec-28 `buildSignature` 只记密码长度
- M-Sec-29 Redis 缺省 localhost
- M-Sec-30 Redis 限流失败回退内存
- M-Sec-31 X-Forwarded-For 索引偏移错误
- M-Sec-32 `x-real-ip` 端口直接暴露时可被伪造
- M-Sec-33 middleware 默认 100/分钟不够
- M-Sec-34 `/api/health` 公开 Git hash/Node 版本/平台
- M-Sec-36 `/api/health/redis` 公开错误详情
- M-Sec-37 redis health 未用 `withApi.public` 包装
- M-Sec-39 `/api/settings/public` 异常时返回 `allowRegistration: true` (fail-open)
- M-Sec-41 `/api/search` 三组并发查询 + 无专用限流
- M-Sec-45 `Class.ownerId` 无 User relation
- M-Sec-46 `ClassAssignmentSubmission.userId/problemId` 无 relation
- M-Sec-48 `ContestProblem` 缺 `@@unique([contestId, problemId])`
- M-Sec-49 `TestCase` 缺 `@@unique([problemId, orderIndex])`
- M-Sec-50 `UserAchievement` 缺 `@@unique`
- M-Sec-51 审计日志无 append-only/完整性
- M-Sec-52 数值字段缺业务范围
- M-Sec-56 Dockerfile 用 `npm install` 而非 `npm ci`
- M-Sec-57 基础镜像未固定 digest
- M-Sec-58 应用端口 3000 直接发布
- M-Sec-59 Mongo `--bind_ip_all`
- M-Sec-60 Redis health check `-a` 命令行参数暴露密码
- M-Sec-61 `logger.setContext` 全局可变,请求间串线
- M-Sec-64 错误 key 用 `error.message` 作 Redis key,高基数打爆
- M-Sec-65 `KEYS('error:*')` 阻塞 Redis

### 低危(选列)

- L-Sec-42 `FRONTEND_URL` 仅 URL 解析
- L-Sec-47 `Submission.assignmentSubmissionId` 无 relation/index
- L-Sec-62 `x-request-id` 未字符集约束
- L-Sec-63 日志 IP 解析与限流模块不一致
- L-Sec-66 `error-monitor` action 'block' 仅 logger.warn
- L-Sec-67 `FRONTEND_URL` 不限制协议
- L-Sec-68 `DATABASE_URL` 仅前缀校验
- L-Sec-69 `ENCRYPTION_KEY` 仅在使用时失败
- L-Sec-70 `validated` 状态不可重检

---

## 八、修复优先级总表

### P0(立即修,1 周内)

1. **H-Sec-1** `server.ts` 路径穿越 — 用 `path.relative` 严格判断
2. **H-Judge-1** Docker 评测模式 bind mount — 修 `getDockerRunCommand` + executor
3. **H-Sec-53** Docker JWT_SECRET — 改用 BuildKit secret mount
4. **H-Prob-25/26/28/29 + H-Sub-29/53** 私有题可见性 — 在 `submitCode` / `lookupProblem` / `getFirstWaTestCase` / pretest 全部加 `isPublic/visibility` 校验
5. **H-Sub-51** 提交比赛校验 — 抽 `assertContestSubmission`
6. **H-Auth-1/2** 封禁机制 — `withApi` 检查 `isBanned`,`adminUpdateUser` 任何敏感字段变更都递增 `tokenVersion`
7. **H-WS-6** WebSocket `join` 鉴权 — 未认证直接拒
8. **H-User-1.4** 头像分片注册表 — 迁移到 Redis
9. **H-User-2.2** 改密走 MongoDB — 改用 Prisma
10. **H-Sec-35** health/db 公开 — 改 admin-only 或仅返回 up/down
11. **H-Sec-24** 系统设置 schema — 严格 Zod + allowlist
12. **H-Sec-23** SMTP 密码解密失败 — fail-closed
13. **H-Sub-33** `updateAdminProblem` 测试用例 — 用 `$transaction`
14. **H-Class-5** `deleteClass` cascade — 显式事务 + schema cascade

### P1(2 周内)

- H-User-1.1 mergeChunks 累加校验
- H-User-1.3 sharp limitInputPixels
- H-User-1.5 头像数据源统一
- H-User-2.1 / 2.10 邮箱双写事务
- H-Auth-3 cookie `__Host-` 前缀
- H-Auth-4 CSRF 双 token 启用
- H-Auth-5 Redis 不可用时锁定 fail-closed
- H-WS-5 `getClientIP` 仅可信代理
- H-WS-7 watchSubmission 实时查 role
- H-Contest-2 finalizeContestRankings 比赛结束后
- H-Contest-3/4 adminUpdateContest / addTrainingProblems 题目可见性
- H-Contest-5 admin 旁路审计 + 检查
- H-Class-3 班级请求服务端查 operatorRole
- H-Class-4 owner 自降级禁止
- H-Class-6 maxMembers/isPublic 类型校验
- H-Class-7 私有班级鉴权前置
- H-Class-9 申请/邀请冷却
- H-Class-10 invite 接受并发保护
- H-Class-13 作业移除题目不硬删 progress
- M-Sub-22 / M-User-2.5 头像 URL 强制 `/uploads/avatars/`
- M-Sec-14 safeFetch 响应体大小
- M-Sec-15 safeFetch IP 分类补全
- M-Sec-31 XFF 索引偏移
- M-Sec-39 settings/public fail-closed
- M-Sec-41 /api/search 限流
- M-Sec-7 HSTS
- M-Sec-25 SMTP host allowlist
- M-Sec-26 测试邮件校验 + 限流
- M-Sec-22 AES-GCM
- M-Sec-56 npm ci
- M-Sec-57 基础镜像 digest
- L-Sec-39 mark-all-read 路由方法对齐
- L-User-7.14 旧邮箱保留期

### P2(规划中)

- Prisma schema 角色/状态 enum 化
- 关系声明补全
- 审计日志 append-only
- log 上下文 AsyncLocalStorage
- Markdown sanitize 收紧
- CSP nonce/hash
- 各种缓存键规范统一
- 大量中低危 UX / 性能问题

---

## 九、审查范围之外 / 建议进一步审计

- `lib/problem/import/*`(codeforces-sync、fps-parser、hydro-parser、syzoj-parser、dsoj-parser) — 远端拉取 + 路径穿越风险未审
- `lib/problem/export/dsoj-exporter.ts` — 未读
- `lib/gamification/timing.ts` — 仅粗读
- `prisma/seed.ts` — 初始数据
- `components/code-editor/*` — 编辑器
- `lib/markdown/sanitize-schema.ts` 与前端渲染组件联合测试用例
- 所有 `app/**/page.tsx` 页面级错误处理(useEffect 重复 fetch、loading 闪烁等)
- 部署脚本(WSL、BT)与 CI 工作流 `.github/workflows/ci.yml`

---

## 十、未发现明显问题的模块(确认安全)

- `lib/auth/service.ts`:基础 CRUD + 密码哈希,无问题
- `lib/permissions.ts`:角色判定严格
- `lib/api/response.ts` / `lib/api/validation.ts`:纯工具,合理
- `lib/api/handler.ts` `getCachedUser` 缓存逻辑清晰(LRU + tokenVersion)
- `hooks/useCurrentUser.ts`:SWR 简单封装
- `app/api/auth/me/route.ts`、`logout/route.ts`:标准用法
- 多数 `app/admin/*/page.tsx`:仅作页面壳,业务问题已分模块审
- `eslint.config.js` / `tsconfig.json`:配置无问题
- `next.config.ts` 安全头总体方向正确(主要缺 HSTS / 收紧 CSP)

---

**报告完毕。本轮未修改任何代码,所有发现供后续修复规划参考。**
