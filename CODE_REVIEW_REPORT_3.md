# DSOJ 项目 第三轮 Bug 与缺陷审查报告

> 审查时间:2026-07-28
> 审查范围:`e:\桌面\dsoj` 全部源代码(基于前两轮报告的修复复核)
> 审查方式:静态阅读,与 `CODE_REVIEW_REPORT.md`、`CODE_REVIEW_REPORT_2.md` 对照,本轮**未修改任何代码**
>
> ⚠️ **历史快照注记**：报告中提及的 `USE_DOCKER` 开关于 2026-08 移除，
> 评测统一走 `runner.sh + dsoj-watch` 单一路径。
> 修改概况:100+ 文件二次修改,新增 `lib/settings-schema.ts`(Zod schema),新增多模块细化改动

---

## 0. 总览

| 模块 | 已修复 | 部分修复 | 未修复 | 新发现/回归 |
|------|-------|---------|--------|-----------|
| 认证 / 权限 / 会话 | 10 | 1 | 1 | 5 |
| 评测 / 提交 / 题库 | 14 | 2 | 0 | 4 |
| 班级 / 作业 / 邀请 | 11 | 4 | 0 | 6 |
| 比赛 / 训练 / 排名 | 8 | 3 | 2 | 5 |
| 用户 / 资料 / 头像 | 12 | 4 | 1 | 5 |
| 通知 / WebSocket / 缓存 | 7 | 5 | 5 | 11 |
| 安全 / 上传 / 服务器配置 | 11 | 4 | 4 | 6 |
| **合计** | **73** | **23** | **13** | **42** |

> 第一轮 ~370 项 → 第二轮 142 项未修复 → 第三轮仅 **13 项仍未修复**(核心 P0/P1 几乎全部落地),但又发现 **42 项新回归/新发现**,**新增 3 个 P0 严重问题**(活跃 WebSocket 5 分钟强制断开 + 跨账号 socket 复用 + 班级 PATCH/DELETE 仅 withApi.auth)。

---

## 一、本轮新增/确认的 **P0 高危问题**

### P0-1 活跃 WebSocket 最多约 5-6 分钟被永久断开
- **状态**:新发现严重回归
- **位置**:`lib/websocket/server.ts:151-160,178-187,380-427` + `hooks/socket-client.ts:53-57`
- **证据**:`connectedAt` 仅建立时写入,心跳不更新;清理定时器按"连接年龄 > 5min"判定超时,实际所有正常连接都会被 `socket.disconnect(true)`;`io server disconnect` 客户端不会自动重连
- **影响**:通知、提交结果、公告、排行榜实时能力永久停止,直到刷新页面
- **建议**:`connectedAt` 跟心跳一起刷新,或删除该主动清理定时器,改用 ping/pong 超时机制

### P0-2 退出登录或快速切换账号可能复用旧账号已认证 socket
- **状态**:新发现严重回归
- **位置**:`hooks/socket-client.ts:22-66`、`contexts/UserContext.tsx:205-216`、`lib/websocket/server.ts:173-204`
- **证据**:socket 挂 `globalThis`,登出只等引用计数归零 + 1.5s 延迟断开;期间用户 B 登录 + `useAnnouncementSocket` 等公开订阅让引用计数不归零
- **影响**:用户 B 收不到自己私有推送;B 的前端监听器可接收 A 的通知与提交消息
- **建议**:登出/换账号必须 `socket.disconnect()` + 重建

### P0-3 `app/api/classes/[id]/route.ts` PATCH/DELETE 仅 `withApi.auth`
- **状态**:新发现
- **位置**:`app/api/classes/[id]/route.ts:115-141`
- **证据**:`PATCH = withApi.auth(...)` + `DELETE = withApi.auth(...)`,无 isOwner/isAssistant 校验
- **影响**:任何登录用户都能改/删任意班级(包括 isPublic/name/maxMembers/announcement)
- **建议**:用 `withApi.classRole` 替换

### P0-4 邮箱修改前端调用 `POST/PATCH`,后端只接受 `PUT`
- **状态**:第二轮已列,本轮确认前端仍未对齐
- **位置**:`app/settings/page.tsx:195-213` 前端用 `method: 'PUT'`,与后端已对齐 ✅
- **结论**:**本轮已修复**(前端已对齐)

### P0-5 头像分片上传 `Math.random()` 概率触发 `cleanOldTempFiles`
- **位置**:`app/api/users/avatar/upload/init/route.ts:10-12`
- **证据**:1/100 概率在请求生命周期内同步触发 GC,与"安全随机用 crypto"原则相悖
- **建议**:改为 cron 定时清理 + `crypto.randomInt`

### P0-6 `app/forgot-password/page.tsx` 走原生 `fetch` 无 CSRF token
- **位置**:`app/forgot-password/page.tsx:14-37` + `middleware.ts:118-138`
- **证据**:未读 cookie 也不发 `X-CSRF-Token`,middleware 在边缘拒绝
- **影响**:忘记密码功能实际不可用

---

## 二、按模块详细复核结果

### 一) 认证 / 权限 / 会话

#### 已修复 ✅
- P0-5 忘记密码递增 tokenVersion(`app/api/auth/forgot-password/route.ts:95-98`)
- P0-6 批量角色更新递增 tokenVersion(`lib/user/admin.ts:264-280`)
- P0-7 SSR cookie 名统一(`lib/auth/server-session.ts:16` + 全工程用 `readAuthTokenFromCookieStore`)
- P0-8 邮箱修改 UI 与后端对齐(前端用 `method: 'PUT'`)
- WS `authenticateSocket` 加 `getCachedUser` 校验 tokenVersion/isBanned(`lib/websocket/server.ts:67-89`)
- 注册首用户 TOCTOU:事务内重判
- escapeHtml 残留批量注册(`lib/user/batch.ts:232`)
- `parseProfileUpdate` 在 profile PUT 调用(`app/api/users/profile/route.ts:17-18`)
- withApi 严格 401/403 区分
- JWT 仅接受 HS256 白名单

#### 部分修复 ⚠️
- withApi.classRole 在某些路径仍返回 401 而非 403

#### 未修复 ❌
- JWT 仍无 iss/aud/jti(可观测性弱)

#### 新发现/回归 🆕
- **P0-3** 班级 PATCH/DELETE 仅 withApi.auth
- **P0-6** forgot-password 前端 fetch 无 CSRF
- **P0-5** 头像 init 同步 GC 用 Math.random
- PATCH/DELETE `/api/admin/users/[id]` 移除 role 字段不能 reset
- `/api/contests/[id]/route.ts` PUT/DELETE 鉴权偏差(TEACHER 可改任意竞赛)
- `/api/problems/route.ts` POST 创建题目 TEACHER 即可(与 admin 路径并存)
- `/api/announcements/[id]` PATCH title/content 无长度校验
- `/api/contests/[id]` GET 公开返回 password(bcrypt hash)
- `/api/users/[id]/info` 公开返回 email
- `/api/users/profile/email` rate limit 缺失

---

### 二) 评测 / 提交 / 题库

#### 已修复 ✅
- **P0-2** 评测子进程环境变量隔离(`lib/judge/executor-core.ts:492-511` 显式白名单)
- **P0-3** withRetry 事务非幂等 + 默认不重试(`lib/mongodb/client.ts:95-132`)
- M-15 题库提交 `totalSubmit` 回滚(部分修复)
- `submitContestCode` 加 `assertCanAccessProblem`
- `adminUpdateContest` 题目 visibility 校验
- `assertCanAccessProblem` classId + contestId 双隶属
- H-Worker-11 failed 监听器两步写
- close 兜底时间合理化
- Docker 镜像 tag env 覆盖
- dsoj-watch 编译 fallback
- `overwriteOne` 事务
- 作者始终可看 `classId != null` 题目
- wa-testcase filename 消毒
- init.ts 与 server.ts await barrier

#### 部分修复 ⚠️
- 主题库提交 `submitCode` 入队失败仍漏 totalSubmit -1(仅回写 SE,未 decrement)
- `init.ts` `void bootJudgeSystem()` 顶层 try/catch 缺失

#### 新发现/回归 🆕
- `app/api/problems/[id]/submissions/route.ts` 未调 `requireAccessibleProblem` — 私有题元数据可泄露
- `mapUserToResponse` 拼装前未 sanitize avatar URL
- `submitAssignmentCode` 事务后 `assignmentSubmissionId` 残留风险
- `importProblems` 大批量顺序执行 → 长尾延迟
- Hydro parser 缺 entry-level 安全校验(Zip Slip 防御深度不够)

---

### 三) 班级 / 作业 / 邀请

#### 已修复 ✅
- 成员角色降级已分离 patch/update/transfer
- owner 转移同步 `Class.ownerId`(事务)
- 管理员删除班级复用显式级联清理
- 班级详情默认不暴露 permissions(可选 `includePermissions`)
- `note.ts` 与 `note-service.ts` 已合并(后者仅兼容导出)
- 成员权限写入增加白名单
- 邀请重发已有冷却与 pending 防重放
- 作业状态机基础逻辑统一
- `cloneProblemToClass` 同步测试点 score

#### 部分修复 ⚠️
- `maxMembers` 编辑校验无当前人数校验
- 班级详情 `permissions` 过滤依赖调用方传参
- 邀请接受仍有事务但缺容量检查(实际 P1)
- `REMOVED` 提交仍被部分作业统计计入

#### 未修复 ❌
- 邀请接受不检查 `maxMembers`(P1)

#### 新发现/回归 🆕
- 班级题目校验与班级题库设计不一致(可跨班级引用公开题)
- 班级统计的所有提交计数没排除 REMOVED
- 成员列表 service 仍可能暴露完整 permissions/dbRole
- `adminUpdateClass` 绕过普通班级更新校验
- 作业详情读取题目未二次校验 `visibility`/`classId`
- 题目校验与作业创建缺少原子最终确认

---

### 四) 比赛 / 训练 / 排名

#### 已修复 ✅
- `adminUpdateContest` 题目 visibility 校验
- `submitContestCode` 管理员路径加 `assertCanAccessProblem`
- `updateContestWithProblems` 校验 start<end
- `createTrainingWithProblems` 加 problemIds visibility
- register 后清 `contest:rank` 缓存
- `computeContestRankings` 排除 admin 真正 unranked
- mark-all-read POST/PUT 一致
- `password: ''` 不再误清

#### 部分修复 ⚠️
- H-7 enrollment 部分清 list 缓存
- M-15 incrementProblemSubmitCount 跨存储不一致
- `registerContest` 并发幂等(路由 race 仍存)

#### 未修复 ❌
- 管理员旁路提交无审计日志(关键 P0)
- `updateContestWithProblems` 非事务(数据一致性)

#### 新发现/回归 🆕
- 缓存键命名风格仍不统一(4 处仍用字符串字面量)
- `getContestRank` 仍为死代码
- `updateContestWithProblems` 缺 `sealRankTime` 范围校验
- `adminUpdateContest` 缺 `sealRankTime` 范围校验
- `listContestSubmissionsPaged` 不过滤 admin 测试提交

---

### 五) 用户 / 资料 / 头像

#### 已修复 ✅
- P0-1 头像注册表完全迁移 Redis(无进程级 Map 分支)
- `parseProfileUpdate` 在 profile PUT 调用
- AvatarHistory Mongo/Prisma 数据源统一(写读都走 Prisma)
- 旧头像文件 GC(完成上传后 + 历史删除)
- mergeChunks 失败清理 uploadId
- admin pageSize 上限 `Math.min(pageSize, 100)`
- 批量注册邮箱冷却(`isEmailInHoldPeriod`)
- clearUserCache timing 修正(`deleteByPrefix('timing:progress')` 真实匹配)
- 改密 / 改邮箱 / 封禁 / 改角色 tokenVersion 失效链路完整

#### 部分修复 ⚠️
- avatar 读取二次校验:`getUserProfile`/`getCurrentUserProfile` 已 sanitize,但 `findUserById`/`mapUserToResponse`/`getUserPublicInfo`/`listActiveUsers`/`getServerSessionUser` 五处仍裸读
- `clearUserCache` 仍对 `timing:progress` 触发 SCAN(虽匹配正确,但该命名空间实际从未写入)
- `getCachedUser` 进程级缓存,多实例下 tokenVersion 失效感知滞后最多 60s
- `clearRankingCache` 与单用户操作绑定,过度清理

#### 未修复 ❌
- 五处 avatar 读取路径未应用白名单(`U-1`)

#### 新发现/回归 🆕
- `updateUserProfile` 写路径未校验 avatar 白名单(虽未调用,但形成隐藏写入漏洞)
- 批量注册 CSV 解析不支持 RFC4180(无引号转义)
- `findUserById` 与 `getCachedUser` 缓存分裂
- `lib/user/profile.ts:99` clearRankingCache 全局清榜与单用户变更不匹配
- forgot-password 先发信后落库 UX 风险

---

### 六) 通知 / WebSocket / 缓存

#### 已修复 ✅
- WS `authenticateSocket` 加 `getCachedUser`
- 未认证 socket `join` 已被双层拒绝(`socket.use` + 函数内)
- `useNotificationSocket` / `useSubmissionSocket` 在 enabled=false 时释放引用
- Dashboard 初始双 fetch 消除
- Dashboard `useCallback([])` 闭包正确
- `markRead` 所有权原子更新

#### 部分修复 ⚠️
- `CacheKeys.notification` 命名空间已添加,读取端仍用裸字符串
- `unwatchSubmission` 角色查询 + 但存在"无法离房"问题
- 标准 HTTPS/WSS 与 Secure Cookie 对齐,但 HTTP 部署矛盾
- 静默未读推送空 title/message,客户端过滤
- `useSubmissionResultFlow` 不清理会话状态
- `markRead` 后 Redis 删除 + singleflight 竞态仍存

#### 未修复 ❌
- `CacheKeys.announcement.listPrefix()` 仍是死代码
- `broadcastMessage` 失败无可靠缓存失效补偿
- `NotificationResponse.notifications` vs 服务 `items` 仍不一致
- `useSubmissionSocket` cleanup 对未连接 socket 仍发送退订
- `useUnreadNotifications` 失败时不清空旧值

#### 新发现/回归 🆕
- **P0-1** 活跃 WebSocket 5-6 分钟被永久断开
- **P0-2** 退出登录/切换账号复用旧账号 socket,跨账号私有消息泄漏
- **P0** 管理员降权后无法退订,提交房间继续泄漏
- **P1** 公告缓存清理 `announcement:` 尾冒号使 L1 成为空操作
- **P1** 未读缓存 Redis 删除 + singleflight 竞态
- **P1** pushUnreadCount 失败让已成功 DB 操作返回 500(回归)
- **P1** 后台通知下拉框因 items/notifications 不一致无法展示
- 排行榜客户端未指定 `transports: ['websocket']`
- 已建立 socket 不随 tokenVersion/封禁/登出立即撤销
- `useUnreadNotifications` 跨用户旧响应回写
- 关键 WS/缓存/通知契约缺回归测试

---

### 七) 安全 / 上传 / 服务器配置

#### 已修复 ✅
- **P0-2** 评测子进程 spawnEnv 隔离(`lib/judge/executor-core.ts:492-511`)
- H-Sec-24 系统设置 Zod schema(`lib/settings-schema.ts` 全新)
- H-Sec-55 nextjs 不入 root 组(`Dockerfile:122-127`)
- H-Sec-60 Redis healthcheck 不暴露密码(`docker-compose.yml:126-131`)
- H-Sec-65 SCAN 替代 KEYS(`lib/redis.ts:146-162` + `lib/cache.ts:250-291`)
- H-Sec-2 头像分片直通限流(`server.ts:120-135`)
- Prisma User.role 升 enum(`schema.prisma:11-17,32`)
- M-Sec-7 HSTS 默认启用(Nginx 路径)
- M-Sec-15 safeFetch IPv6 补全
- M-Sec-31 IP 解析全项目统一
- M-Sec-39 settings/public 真正 fail-closed

#### 部分修复 ⚠️
- H-Sec-58 应用端口默认 127.0.0.1,但 mongo/redis 仍 0.0.0.0
- H-Sec-34 health 信息脱敏:db/redis 已脱敏,主 `/api/health` 仍暴露 build 元信息
- H-Sec-54 评测沙箱:runsher.sh ulimit 强,Docker 模式强,但 USE_DOCKER=false 默认无强沙箱
- M-Sec-15 IPv4-mapped 实现已存在,但测试缺失

#### 未修复 ❌
- **H-Sec-57** 基础镜像未固定 digest
- **H-Sec-61** Logger AsyncLocalStorage
- **error-monitor.action 'block'** 真阻断(仅登录路径硬拦,其他面仍 alert)
- **SMTP host** 无 DNS 内网地址校验

#### 新发现/回归 🆕
- 头像 chunk multipart 自实现解析器缺长度/数量上限
- safeFetch IPv4-mapped 测试缺失
- `/api/health` 仍暴露 build 元信息(虽 db/redis 已脱敏)
- `/api/admin/problems/[id]` 审计 IP 仍直接读 XFF 字面量
- docker-compose mongo/redis 0.0.0.0 监听
- CSP Next/Nginx 双源不一致(Nginx 覆盖 next.config.ts,精确白名单形同虚设)

---

## 三、修复优先级总表

### P0(立即修,1 周内)

1. **P0-1** 活跃 WebSocket 5-6 分钟被永久断开(清理定时器按连接年龄)
2. **P0-2** 退出登录/换账号 socket 复用导致跨账号消息泄漏
3. **P0** 管理员降权后无法退订提交房间
4. **P0-3** `app/api/classes/[id]/route.ts` PATCH/DELETE 仅 withApi.auth
5. **P0-5** 头像 init `Math.random()` 同步触发 GC
6. **P0-6** forgot-password 前端 fetch 无 CSRF token
7. 班级邀请接受不检查 maxMembers
8. `adminUpdateContest`/`adminUpdateClass` 加 sealRankTime/maxMembers 范围
9. `updateContestWithProblems` 改为事务
10. 管理员旁路提交无审计日志
11. SMTP host DNS 内网地址校验
12. `error-monitor.action 'block'` 全调用面硬拦截
13. `/api/health` build 元信息脱敏
14. CSP 双源收敛
15. Logger AsyncLocalStorage
16. H-Sec-57 基础镜像 digest 固定

### P1(2 周内)

- P0-7 班级 PATCH/DELETE `withApi.classRole` 替换(已修复一轮但 P0-3 复现)
- `NotificationResponse` items/notifications 对齐
- `useSubmissionSocket` cleanup 判断 connected
- `useUnreadNotifications` 失败清空旧值
- `CacheKeys.announcement.listPrefix()` 删除死代码
- 头像读取二次校验全覆盖(5 处)
- `useSubmissionResultFlow` 清理会话状态
- `clearUserCache` 实际缓存键命名统一
- 排行榜 socket 加 `transports: ['websocket']`
- `useAnnouncementSocket` 重建避免跨账号
- 班级编辑 maxMembers 不低于当前人数
- `createTrainingWithProblems` 训练/题目缓存同步清
- `listContestSubmissionsPaged` 过滤 admin 测试提交
- `cache.deleteByPrefix('announcement:')` 去掉尾冒号(L1 真生效)
- pushUnreadCount 失败不阻塞主操作(回归)
- 后台通知下拉框 items/notifications 修复
- `app/api/problems/[id]/submissions` 加 `requireAccessibleProblem`
- `mapUserToResponse` sanitize avatar URL
- `findUserById` 与 `getCachedUser` 缓存统一
- `clearRankingCache` 限定触发条件
- docker-compose mongo/redis `--bind 127.0.0.1` 或独立子网
- safeFetch IPv4-mapped 形式单元测试补齐
- Hydro parser entry-level Zip Slip 校验
- `/api/admin/problems/[id]` 审计 IP 走 `resolveClientIp`
- 批量注册 CSV RFC4180 引号转义

### P2(规划中)

- 自实现 multipart 解析器长度/数量上限
- 已建立 socket 不随 tokenVersion/封禁立即撤销(应支持主动断开)
- `useUnreadNotifications` 跨用户旧响应回写
- 关键 WS/缓存/通知契约回归测试
- `clearUserCache` 实际触发 `deleteByPrefix('timing:progress')` SCAN,但 timing 缓存从未写入 → 删除该调用或真用上缓存
- `safeCall` 出口 `clearContext`
- 编译栈 vs 运行栈混淆(`safeStack = memoryLimit`)
- 各种 lint 风格统一

---

## 四、结论

**第三轮修复质量较高**,绝大多数 P0/P1 落地实现而非纸面修改;第二轮残留 P0 已基本清零。但本轮又发现 **3 个新 P0**(活跃 WS 强制断开、跨账号 socket 复用、班级 PATCH/DELETE 仅 withApi.auth),都是与"实时通信"和"权限边界"相关的深层问题。

整体趋势:
- 核心鉴权链路 / 数据一致性 / 沙箱隔离已基本到位
- 实时通信(WS/通知)与缓存层成为新的薄弱点
- 前端 React hooks 与后端 WS 服务端协议仍需进一步对齐

下一轮建议:
1. 优先处理活跃 WS 5 分钟断开(影响所有用户的实时功能)
2. 跨账号 socket 复用(明确的私有消息泄漏风险)
3. 班级 PATCH/DELETE 鉴权补漏
4. 通知 `items/notifications` 字段对齐(影响后台通知下拉框)
5. Logger AsyncLocalStorage 改造(影响所有日志溯源)

**报告完毕。本轮未修改任何代码。**
