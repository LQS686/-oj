# DSOJ 项目 第二轮 Bug 与缺陷审查报告

> 审查时间:2026-07-28
> 审查范围:`e:\桌面\dsoj` 全部源代码(基于第一轮报告的修复复核)
> 审查方式:静态阅读,与 `CODE_REVIEW_REPORT.md` 对照,本轮**未修改任何代码**
>
> ⚠️ **历史快照注记**：报告中提及的 `USE_DOCKER` 开关于 2026-08 移除，
> 评测统一走 `runner.sh + dsoj-watch` 单一路径。
> 修改概况:用户提交了 100+ 文件的修改,新增 `lib/auth/cookie.ts`、`lib/http/client-ip.ts`、`lib/problem/access.ts`、`lib/judge/config.ts`、`lib/judge/ensure-watch.ts`、`lib/judge/dsoj-watch.c`、`lib/settings-defaults.ts`、`app/api/auth/csrf/` 等关键模块

---

## 0. 总览

| 模块 | 已修复 | 部分修复 | 未修复 | 新发现/回归 |
|------|-------|---------|--------|-----------|
| 认证 / 权限 / 会话 | 9 | 4 | 1 | 4 |
| 评测 / 提交 / 题库 | 8 | 3 | 2 | 12 |
| 班级 / 作业 / 邀请 | 9 | 2 | 1 | 9 |
| 比赛 / 训练 / 排名 | 4 | 2 | 3 | 8 |
| 用户 / 资料 / 头像 | 8 | 1 | 1 | 5 |
| 通知 / WebSocket / 缓存 | 10 | 2 | 2 | 5 |
| 安全 / 上传 / 服务器配置 | 6 | 5 | 9 | 7 |
| **合计** | **54** | **19** | **19** | **50** |

> 第一轮报告中的 ~370 项问题,经过本轮验证约有 **54 项确认修复**、**19 项部分修复**、**19 项仍未修复**;此外发现 **50 项新回归/新发现**。
> 仍有多个 P0 级别漏洞未修复,核心问题集中在 tokenVersion 失效不完整、注册首用户 TOCTOU、submitContestCode 缺 visibility 校验、SSR cookie 硬编码、头像注册表多实例、评测环境变量泄露等。

---

## 一、本轮发现的 **P0 高危问题** (建议立即修复)

### P0-1 头像注册表仍是进程级 Map,多实例/Serverless 下归属校验失效
- **状态**:未修复(代码改了,但本质未变)
- **位置**:`lib/avatar-upload-registry.ts` 全文
- **证据**:`globalThis.__avatarUploadRegistry = new Map()` 全程使用进程级 Map,虽然增加了 Redis 路径分支,但 `MAX_ENTRIES = 5000` + 进程级内存结构无 L2 Redis 回退
- **影响**:多实例部署下用户 A 拿到 uploadId 后,请求被路由到实例 B,chunk 写入可被用户 B 借 uploadId 偷取
- **建议**:完全迁移到 Redis,删除进程 Map 分支

### P0-2 评测子进程继承应用全部环境变量,可读取 JWT_SECRET/ENCRYPTION_KEY/DATABASE_URL
- **状态**:新发现的严重安全问题
- **位置**:`lib/judge/executor-core.ts:492-515` `spawnEnv = { ...process.env, DSOJ_MEM_FILE, ... }`
- **证据**:选手程序可执行 `os.environ['JWT_SECRET']`(Python)或 `getenv("JWT_SECRET")`(C/C++)直接读取服务端密钥
- **影响**:任何登录用户提交一段代码即可获取完整服务端凭证
- **建议**:spawnEnv 显式只透出 DSOJ_MEM_FILE 等评测变量,过滤 `JWT_SECRET / ENCRYPTION_KEY / DATABASE_URL / REDIS_URL / *_PASSWORD`

### P0-3 `withRetry` 仍对非幂等事务加重试,创建操作每次重试生成新 ObjectId
- **状态**:未修复(H-60)
- **位置**:`lib/mongodb/client.ts:100-118` + `lib/mongodb/submission-direct.ts:31-50`
- **证据**:`createSubmissionDirect` 内部 `new ObjectId()` 在 withRetry 闭包外生成,每次重试生成不同 _id;若 retry 时第一次已写入但 ack 丢失,数据库会存在多份副本
- **影响**:submission 主键重复、数据污染
- **建议**:让 withRetry 仅对显式声明幂等的操作加重试,或要求事务闭包统一管理 _id

### P0-4 `withApi.auth` 不查 isBanned(实际是 getCachedUser 内部查,看似修好,但仍有 R-12 风险)
- **复核结论**:**已修复** — `lib/api/handler.ts:48,69` 均检查 `isBanned`,`withApi.auth` 调 `getCachedUser` 后 null 即 401
- **但**:封禁用户被踢出 401 而非 403,前端 UX/审计可观察性下降(参见 R-3)

### P0-5 忘记密码成功后不递增 tokenVersion
- **状态**:新发现
- **位置**:`app/api/auth/forgot-password/route.ts:92-97`
- **证据**:`prisma.user.update({ where: { id }, data: { password: hashed } })` 不递增 tokenVersion
- **影响**:用户重置密码后旧 JWT 仍 7d 有效,被盗会话不被强制退出
- **建议**:与改密一致 `data: { password, tokenVersion: { increment: 1 } }`

### P0-6 批量角色更新不递增 tokenVersion
- **状态**:新发现
- **位置**:`lib/user/admin.ts:261-276` `batchUpdateUserRole`
- **证据**:`prisma.user.updateMany({ data: { role } })` 无 tokenVersion
- **影响**:管理员批量提权/降权后,被改用户旧 token 仍以旧 role 在 60s 缓存窗口内通过 `withApi.admin`
- **建议**:`data: { role, tokenVersion: { increment: 1 } }` + clearUserCache

### P0-7 SSR 端多处硬编码 cookie 名 `'token'`,生产 __Host-token 环境下永远拿不到登录态
- **状态**:新发现
- **位置**:
  - `lib/auth/server-session.ts:15` `cookieStore.get('token')?.value`
  - `app/contests/[id]/page.tsx:42` 同上
  - `app/contests/[id]/layout.tsx:57` 同上
- **证据**:`lib/auth/cookie.ts:19-21` 已定义 Secure 模式下 cookie 名为 `__Host-token`,但以上 SSR 调用点未跟随
- **影响**:生产 HTTPS 环境下 `getServerSessionUser()` 永远 null,导航栏 SSR 显示未登录;比赛详情 SSR 鉴权失效
- **建议**:封装 `getAuthTokenFromCookies()` SSR 工具函数

### P0-8 邮箱修改前端调 POST/PATCH,后端只接受 PUT,功能完全不可用
- **状态**:新发现
- **位置**:
  - 前端 `app/settings/page.tsx:195-276` 用 `method: 'POST'` / `method: 'PATCH'`
  - 后端 `app/api/users/profile/email/route.ts:13-46` `export const PUT`
- **影响**:用户改邮箱 UI 实际不工作;另外前端期待 `data.newEmail`、验证码两步流程,后端是单次密码校验
- **建议**:统一前后端接口契约

---

## 二、按模块详细复核结果

### 一) 认证 / 权限 / 会话

#### 已修复
- ✅ H-Auth-1 `withApi` 通过 `getCachedUser` 校验 `isBanned`
- ✅ H-Auth-2 `adminUpdateUser` 任意敏感字段(role/isBanned/password)变更均递增 tokenVersion
- ✅ H-Auth-3 Cookie `__Host-` 前缀在生产 Secure 模式下自动启用
- ✅ H-Auth-4 CSRF 双 token 启用(middleware + `assertWriteCsrf`)
- ✅ H-Auth-5 Redis 不可用时账号锁定 fail-closed
- ✅ H-Auth-6 username 注册路径不再 escapeHtml
- ✅ M-Auth-3 `getTokenFromRequest` 不再读 Authorization Bearer
- ✅ M-Auth-2.1 邮箱修改统一走 Prisma,不再 MongoDB 直写
- ✅ 新增 `lib/auth/cookie.ts` 统一 cookie 配置

#### 部分修复
- ⚠️ H-6 escapeHtml 残留:`lib/user/batch.ts:233,271` 批量注册仍 `escapeHtml(trimmedUsername)`
- ⚠️ JWT 无 iss/aud/jti:靠 tokenVersion 单点吊销,功能安全但可观测性弱
- ⚠️ 注册首用户 TOCTOU:`registerNewUser` 二次校验只能事后降级,竞态窗口存在
- ⚠️ WS `authenticateSocket` 不调 `getCachedUser`,只 verifyToken 签名;已封禁/改密/降级用户的 WebSocket 房间在断线前仍可继续接收

#### 未修复
- ❌ **P0-5** 忘记密码不递增 tokenVersion
- ❌ **P0-6** 批量角色更新不递增 tokenVersion

#### 新发现/回归
- 新 P0-7 SSR cookie 硬编码 'token'
- 新 P0-8 邮箱修改 UI 与后端接口不一致
- 新 `withApi.classRole` 在某些路径下日志中误抛 401(非 403)影响 UX
- 新 `getCachedUser` isBanned 时返回 null,前端看不到"账号已被封禁"的明确提示

---

### 二) 评测 / 提交 / 题库

#### 已修复
- ✅ H-Judge-1 Docker 评测模式整体修复:bind mount、`--read-only`、`--cap-drop ALL`、`--security-opt no-new-privileges`、独立 nobody 用户
- ✅ H-Prob-25/26/28 题库详情/stats/pretest 校验 visibility
- ✅ H-Prob-29/53 提交接口 + wa-testcase 校验 problem visibility
- ✅ H-Prob-33 `updateAdminProblem` 测试用例改 `$transaction`
- ✅ H-Prob-38 标程验证复用主评测沙箱
- ✅ H-Prob-51 比赛提交校验时间窗/报名/题目归属
- ✅ H-Worker-11 worker 状态机守卫
- ✅ M-Sub-22 私有题 wa-testcase + 头像 URL 强制 `/uploads/avatars/`

#### 部分修复
- ⚠️ H-Judge-38 runner.sh 路径仍是 ulimit 限制,无 seccomp/cgroup 隔离
- ⚠️ H-Worker-11 worker failed 监听器两步写,加重试链路
- ⚠️ M-12 submitContestCode 缺 `assertCanAccessProblem`(管理员路径)

#### 未修复
- ❌ **P0-2** 评测子进程继承应用环境变量(JWT_SECRET/ENCRYPTION_KEY 等)
- ❌ **P0-3** `withRetry` 仍对 `createSubmissionDirect` 等非幂等操作加重试

#### 新发现/回归
- 新 `dsoj-watch.c` 编译依赖 cc/gcc,Alpine 之外镜像需 fallback
- 新 `overwriteOne` (导入覆盖) `createMany` 在事务外执行
- 新 `close 兜底 500ms` 太短,选手程序伪 eof 时漏检测
- 新 Docker 镜像 tag 写死 `gcc:12` / `python:3.11`,无 env 覆盖
- 新 `assertCanAccessProblem` 不支持 "classId + contestId" 双隶属
- 新 作者始终可看 `classId != null` 题目,即便非班级成员
- 新 匿名用户访问 contest 题强制 404
- 新 主题库提交入队失败时 `totalSubmit` 漏回滚(M-15 子情形)
- 新 wa-testcase filename 未消毒,Content-Disposition header 注入风险
- 新 avatar 读取路径不二次校验 URL,仅写入有白名单
- 新 `subjects` 解析可能双计分
- 新 `init.ts` `void bootJudgeSystem()` 与 `server.ts await import` 之间无 await barrier

---

### 三) 班级 / 作业 / 邀请

#### 已修复
- ✅ H-Class-3 `decideClassJoinRequest` 服务端查 `operatorRole`
- ✅ H-Class-6 创建班级 `isPublic/maxMembers` 类型/范围校验
- ✅ H-Class-7 私有班级鉴权前置(先查 isPublic 再读 detail)
- ✅ H-Class-8 邀请唯一约束 + 10 分钟冷却
- ✅ H-Class-9 申请拒绝后 10 分钟冷却
- ✅ H-Class-10 邀请接受事务内重检
- ✅ H-Class-13 作业移除题目不硬删 progress
- ✅ M-19 班级详情不返回用户 code
- ✅ H-Class-5 普通用户 `deleteClass` 显式级联清理

#### 部分修复
- ⚠️ H-Class-4 最后一个 owner 防降级:`updateClassMemberRole` 服务层有保护,但 API 实际走 `patchClassMember`(绕过保护)
- ⚠️ M-3 `assignment-stats.ts` 仍用 `{ startTime: { isSet: false } }`

#### 未修复
- ❌ H-Class-5 管理员 `deleteClass` 仍裸 `prisma.class.delete`

#### 新发现/回归
- 新 PATCH 成员角色允许设 `owner` 但不同步 `Class.ownerId`
- 新 邀请接受不检查班级 `maxMembers`,可超员
- 新 owner 转移流程缺失(`Class.ownerId` 与 `ClassMember.role` 双源)
- 新 班级详情向所有访问者(含公开班级访客)暴露 `permissions`
- 新 编辑班级绕过创建时的 `maxMembers/isPublic` 严格校验
- 新 `REMOVED` 提交仍被部分作业统计计入
- 新 作业详情读取题目时未二次校验 `visibility` / `classId`
- 新 通知与业务状态非原子,失败后可能不一致

---

### 四) 比赛 / 训练 / 排名

#### 已修复
- ✅ H-1 训练题单 PUT user 对象一致性
- ✅ H-2 `finalizeContestRankings` 校验比赛已结束
- ✅ H-4 `addTrainingProblems` 题目 visibility 校验
- ✅ H-8 `endTime` 为空时截止(防御性兜底)

#### 部分修复
- ⚠️ H-7 enrollment 未清 list 缓存(`joinCount` 滞后)
- ⚠️ M-15 `incrementProblemSubmitCount` 失败回滚跨存储不一致

#### 未修复
- ❌ H-3 `adminUpdateContest` 题目 visibility 未校验
- ❌ H-5 管理员旁路提交无审计日志
- ❌ M-1 比赛 `type=password` 但 `password=null` 永远报名失败
- ❌ M-10 `updateContestWithProblems` 不校验 start<end
- ❌ M-12 `submitContestCode` 管理员路径缺 problem visibility

#### 新发现/回归
- 新 `computeContestRankings` 排除 admin 仍以 0 分插入排序,产生假排名
- 新 `createTrainingWithProblems` 接受 `problemIds` 但不做 visibility
- 新 register 后未清 `contest:rank` 缓存
- 新 `getContestRank` 与 `computeContestRankings` 双实现并存(死代码)
- 新 `password: ''` 被 `||null` 转 null 误清
- 新 `updateContestWithProblems` 非事务,题目列表可能为空
- 新 报名并发非幂等(无 unique 兜底)
- 新 `cache.deleteByPrefix('contest:rank')` 命名风格不统一

---

### 五) 用户 / 资料 / 头像

#### 已修复
- ✅ H-1.1 mergeChunks 累加字节数校验
- ✅ H-1.2 filename 长度/字符校验
- ✅ H-1.3 sharp `limitInputPixels` + `animated: false`
- ✅ H-1.4 头像注册表 Redis 路径分支(但不彻底)
- ✅ H-1.5 头像数据源统一 user.avatar 走 Prisma
- ✅ H-2.1 改邮箱走 Prisma 单一写入
- ✅ H-2.2 改密走 Prisma
- ✅ H-7.14 旧邮箱保留期 30 天
- ✅ H-1.8 头像 URL 强前缀白名单

#### 部分修复
- ⚠️ H-5.1 `parseProfileUpdate` 校验器未在 `/api/users/profile` PUT 中调用

#### 未修复
- ❌ **P0-1** 头像注册表仍是进程级 Map(分片上传归属校验失效)

#### 新发现/回归
- 新 `AvatarHistory` 写 Mongo / 读 Prisma 数据分裂(写 `db.collection('AvatarHistory')`,读 `prisma.avatarHistory.findMany`)
- 新 avatar 上传完成后不清理旧头像文件,长期磁盘泄漏
- 新 mergeChunks 失败时 uploadId 不清理,可被占 30 分钟
- 新 admin 列表 `pageSize` 无服务端硬限
- 新 批量注册 `batch.ts` 未走 `isEmailInHoldPeriod` 冷却期校验
- 新 `clearUserCache` 中 `deleteByPrefix('timing:progress:')` 是空操作

---

### 六) 通知 / WebSocket / 缓存

#### 已修复
- ✅ H-2 `cache.deleteByPrefix` 用 SCAN 游标 + 分批
- ✅ H-3 markRead 竞态
- ✅ H-4 pushUnreadCount 失败不阻塞主操作
- ✅ H-5 WebSocket `getClientIP` 走 `resolveClientIp`
- ✅ H-6 WebSocket join 鉴权绕过
- ✅ H-7 watchSubmission 实时查 role
- ✅ H-8 createNotifications N+1
- ✅ H-9 announcement isSet 修复
- ✅ M-13 useNotificationSocket release
- ✅ L-39 mark-all-read PUT vs POST 修复

#### 部分修复
- ⚠️ H-1 通知缓存键 `CacheKeys.notification` 命名空间仍缺失
- ⚠️ M-21 DashboardView 双 fetch 实质 OK 但 useCallback 依赖 lint

#### 未修复
- ❌ H-9 附带 `CacheKeys.announcement.listPrefix()` 仍是死代码
- ❌ WS `unwatchSubmission` 仍用连接时缓存 role

#### 新发现/回归
- 新 `broadcastMessage` 失败不主动失效缓存
- 新 `NotificationResponse` 字段 `notifications` vs 服务返回 `items` 类型不一致
- 新 pushUnreadCount 静默推送空 title/message 可能误弹
- 新 `useSubmissionSocket` cleanup 中 emit 可能对未连接 socket 发送
- 新 `DashboardView` useCallback 依赖空数组

---

### 七) 安全 / 上传 / 服务器配置

#### 已修复
- ✅ H-Sec-1 `server.ts` 静态上传路径穿越(`relative()` 严格判断)
- ✅ H-Sec-3 自定义上传鉴权 `getCachedUser` 校验 tokenVersion/isBanned
- ✅ H-Sec-22 AES-256-GCM 替代 CBC
- ✅ H-Sec-23 SMTP 密码解密失败 fail-closed
- ✅ H-Sec-53 Docker `JWT_SECRET` 不再作为真实 build arg
- ✅ H-Sec-56 Docker `npm ci`
- ✅ M-Sec-14 safeFetch 响应体大小限制
- ✅ M-Sec-41 `/api/search` middleware 限流

#### 部分修复
- ⚠️ H-Sec-2 头像分片直通的 CSRF + 鉴权已加,但**限流仍未覆盖**
- ⚠️ H-Sec-34/36 /api/health/redis 异常消息仍泄露内部错误
- ⚠️ H-Sec-34 /api/health 仍暴露 gitHash/nodeVersion/platform
- ⚠️ H-Sec-54 评测沙箱资源限制已加,但**环境变量未隔离**(见 P0-2)
- ⚠️ M-Sec-7 HSTS 仅在 Nginx 部署路径启用,Next 直连默认未启用
- ⚠️ M-Sec-15 safeFetch IPv6 分类补全,但 IPv4-mapped 十六进制形式未覆盖
- ⚠️ M-Sec-31 `client-ip.ts` 中心化已实现,但仍有手工 XFF 解析旁路(`contest-auth.ts`、`solutions/[id]/route.ts`、`logger.ts`)
- ⚠️ M-Sec-39 `/api/settings/public` fail-closed 被 `getRawSystemSettings` 默认值回退绕过

#### 未修复
- ❌ H-Sec-24 系统设置 API 无 Zod schema
- ❌ H-Sec-55 `nextjs` 仍加入 root 组
- ❌ H-Sec-57 基础镜像未固定 digest
- ❌ H-Sec-58 应用端口 `3000:3000` 仍直接发布
- ❌ H-Sec-60 Redis healthcheck 命令行参数暴露密码
- ❌ H-Sec-61 logger 全局上下文(未用 AsyncLocalStorage)
- ❌ H-Sec-65 `error-monitor.ts` 仍用 Redis `KEYS`
- ❌ Prisma `User.role` 仍为 String,未升 enum
- ❌ `error-monitor.action 'block'` 仅 logger.warn 不真阻断

#### 新发现/回归
- 新 邮箱修改 UI 与后端方法不一致(已在 P0-8 列出)
- 新 头像分片直通缺独立限流(已在 P0-1 中)
- 新 评测程序可读 `process.env`(P0-2)
- 新 评测模式 `USE_DOCKER=false` 默认无强沙箱
- 新 SMTP host 仅格式校验,未做 DNS 内网地址判断
- 新 CSP Next 与 Nginx 配置不一致
- 新 safeFetch HTTPS 用 IP 作 host 缺少正确 SNI

---

## 三、本轮未充分审计 / 范围之外

- `lib/problem/import/*`(codeforces-sync、fps-parser、hydro-parser、syzoj-parser、dsoj-parser)— 远端拉取 + 路径穿越风险
- `lib/problem/export/dsoj-exporter.ts` — 未读
- `components/code-editor/*` — 编辑器
- 部署脚本(WSL、BT、CI 工作流)
- 前端页面级 useEffect 重复 fetch / loading 闪烁
- `app/admin/**/page.tsx` 表单提交与后端一致性

---

## 四、修复优先级总表

### P0(立即修,1 周内)

1. **P0-2** 评测子进程环境变量隔离(关键:防止密钥泄露)
2. **P0-1** 头像注册表完全迁移到 Redis
3. **P0-5** 忘记密码递增 tokenVersion
4. **P0-6** 批量角色更新递增 tokenVersion
5. **P0-3** withRetry 事务非幂等
6. **P0-7** SSR cookie 名统一
7. **P0-8** 邮箱修改 UI 与后端接口对齐
8. 班级 owner 防降级 API 走 `updateClassMemberRole`
9. `submitContestCode` 加 `assertCanAccessProblem`
10. `adminUpdateContest` 题目 visibility 校验
11. `H-Sec-24` 系统设置 API Zod schema
12. `H-Sec-58` 应用端口不再直接发布

### P1(2 周内)

- 头像 chunk 独立限流
- run.sh seccomp + cgroup 隔离
- Docker 基础镜像 digest 固定
- Redis healthcheck 不暴露密码
- safeFetch IPv6 补全
- safe-fetch HTTPS SNI servername
- `Class.ownerId` 与 `ClassMember.role` 一致性约束
- 班级详情 `permissions` 字段最小化
- owner 转移流程实现
- 注册首用户 TOCTOU 加原子事务
- `parseProfileUpdate` 在 profile PUT 中调用
- 头像历史 Mongo/Prisma 数据源统一
- 旧头像文件 GC
- 头像上传完成后清理
- mergeChunks 失败清理 uploadId
- admin pageSize 上限
- 批量注册邮箱冷却
- clearUserCache timing 空操作清理
- `withApi.classRole` 401 → 403 区分
- WebSocket `authenticateSocket` 加 `getCachedUser`
- `CacheKeys.notification` 命名空间补齐
- `unwatchSubmission` 实时查 role
- WS cookie secure 与 WS 协议一致性检查
- Logger AsyncLocalStorage
- Redis SCAN 替代 KEYS(error-monitor)
- `M-Sec-39` settings/public 真正 fail-closed
- `M-Sec-15` safeFetch IPv6 完整补全
- `M-Sec-31` IP 解析全项目统一
- 比赛 `type=password` 但无 password 时返回 PASSWORD_NOT_SET
- `updateContestWithProblems` 校验 start<end
- `cache.deleteByPrefix('training:list:')` 在 enrollment 中
- `incrementProblemSubmitCount` 与 prisma 事务回滚统一存储
- `computeContestRankings` 排除 admin 用户真正 unranked
- `createTrainingWithProblems` 加 problemIds visibility
- `registerContest` 并发幂等
- mark-all-read POST/PUT 一致

### P2(规划中)

- `H-Class-5` 管理员 `deleteClass` cascade
- `H-Sec-55` nextjs 不再加入 root 组
- Prisma `User.role` 升 enum
- `error-monitor.action 'block'` 真阻断
- `note.ts` / `note-service.ts` 合并
- `H-Sub-22 avatar` 读取二次校验
- `H-Sub-22 wa-testcase filename` 消毒
- CSP nonce/hash 收紧
- `dsoj-watch` close 兜底时间合理化
- 镜像 tag env 覆盖
- `close 兜底` 时间合理化
- 各种 lint 风格统一

---

## 五、结论

本轮修复 **54 项 / 总 ~370 项 = 约 14.6%**;部分修复 19 项、未修复 19 项、新发现/回归 50 项。

**主要问题**:
1. 多处 P0 修复不彻底(H-60 头像注册表、tokenVersion 失效不全、submitContestCode visibility、SSR cookie 硬编码)。
2. 新增严重问题:评测子进程环境变量泄露(用户代码可直接读取 JWT_SECRET)。
3. 前后端契约不一致:邮箱修改前端用 POST/PATCH、后端只 PUT,功能完全不可用。
4. 系统级配置仍以"够用"为标准,缺 Zod schema、缺枚举约束、缺 SNI 修复、缺 HSTS 默认开启。

**建议**:下一轮优先处理 P0 列表 12 项,然后是班级 owner 流转、withApi.classRole UX、`parseProfileUpdate` 调用、NotificationResponse 字段对齐等"看似小但影响核心流程"的项。

---

**报告完毕。本轮未修改任何代码。**
