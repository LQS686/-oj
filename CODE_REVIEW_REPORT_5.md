# DSOJ 项目 第五轮全量审计报告

> 审查时间: 2026-07-31  
> 审查范围: `e:\桌面\dsoj` 全模块（逻辑 / 数据获取 / 接口契约 / 权限 / 缓存 / 会话）  
> 审查方式: 静态代码审查 + 本地服务冒烟（`http://localhost:4000`）  
> **未修改任何业务代码**  
> 基线: [CODE_REVIEW_REPORT_4.md](CODE_REVIEW_REPORT_4.md)

---

## 0. 总览

| 模块                | 第4轮遗留复核                             | 本轮新发现                        | 冒烟                                |
| ------------------- | ----------------------------------------- | --------------------------------- | ----------------------------------- |
| 认证 / 权限 / 会话  | P0 大多已修；软鉴权与 middleware 缺口仍在 | 若干                              | 登录/me/admin OK                    |
| 评测 / 提交 / 题库  | 良好                                      | 提交 IDOR、WA 泄题等              | 列表 OK；`limit`/`numbers` 契约失败 |
| 班级 / 作业         | 修复较多                                  | 权限页 405、退班失败、flag 未执行 | 列表 OK                             |
| 竞赛 / 训练 / 排名  | P0-A/F 已修                               | 密码门失效、封榜可绕、进度口径错  | 列表 OK                             |
| 用户 / 头像 / Admin | 写路径已修；读路径部分                    | 用户列表硬顶 100                  | Admin 读路径 OK                     |
| 通知 / WS / 缓存    | P0-C/D 已修；P0-E 部分                    | ranking/myRankAdvanced 等         | 通知 `limit` 忽略                   |
| 前后端契约          | —                                         | 多处方法/参数不匹配               | 见附录                              |

### 本轮严重等级统计（有效发现，不含已修复项）

| 等级     |   数量 | 含义                                         |
| -------- | -----: | -------------------------------------------- |
| **P0**   |      6 | 安全可利用 / 正确性严重破坏 / 核心功能不可用 |
| **P1**   |     22 | 明显缺陷、错误数据或契约不一致               |
| **P2**   |     18 | 边缘、可维护性、短暂不一致                   |
| **合计** | **46** |                                              |

### 卫生基线

| 检查                           | 结果                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `npm run test` (vitest)        | **165 passed / 13 files**                                    |
| `npm run typecheck`            | **pass**                                                     |
| 关键页面 HTTP（14 条，已登录） | **14/14 200**                                                |
| 关键 API 读路径                | **25/25 成功**；写探测确认 permissions **PUT→405**           |
| 冒烟原始数据                   | [`.tmp-audit-run-5/smoke.json`](.tmp-audit-run-5/smoke.json) |

---

## 一、第四轮 backlog 复核

| 编号      | 项                                     | 状态         | 当前证据                                                                                 |
| --------- | -------------------------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| P0-A      | `finalizeContestRankings` 清 rank 缓存 | **已修复**   | `lib/contest/rankings.ts` 末尾 `cache.deleteByPrefix(CacheKeys.contest.rankPrefix(...))` |
| P0-B      | 班级 PATCH/DELETE → `classRole`        | **已修复**   | `app/api/classes/[id]/route.ts` PATCH/DELETE 用 `withApi.classRole`                      |
| P0-C      | logger AsyncLocalStorage               | **已修复**   | `lib/logger.ts` 使用 ALS                                                                 |
| P0-D      | `cache.delete` 清 inflight             | **已修复**   | `lib/cache.ts` `inflight.delete(key)`                                                    |
| P0-E      | error-monitor 全类型硬拦               | **部分修复** | `database/system` 写 `blockedUntil`，但仅 `login-service` 调用 `isBlockedAsync('auth')`  |
| P0-F      | 竞赛管理员旁路审计                     | **已修复**   | `ADMIN_BYPASS_SUBMIT` auditLog                                                           |
| Avatar 写 | 班级 avatar 白名单                     | **已修复**   | `sanitizeClassAvatar` 于 create/update                                                   |
| Avatar 读 | 多处裸读                               | **部分修复** | 排行榜/班级多已 sanitize；submission/solution/training/auth-cache/admin list 仍裸读      |
| P1        | IP 无 socket.remoteAddress             | **仍存在**   | `getClientIPFromHeaders` 仅读 header                                                     |
| P1        | forgot-password 双重限流               | **仍存在**   | middleware + route 两套计数                                                              |
| P1        | `/api/admin/*` 无限流加严              | **仍存在**   | 默认 100/min                                                                             |
| P1        | CacheKeys 字面量前缀                   | **仍存在**   | 多处 `deleteByPrefix('…')` 字面量                                                        |
| P1        | enrollTraining P2002                   | **仍存在**   | find+create 无 catch                                                                     |
| P1        | notes 鉴权不统一                       | **仍存在**   | 列表 `auth`/写 `classRole`；noteId 全 `auth`                                             |

---

## 二、本轮 P0（立即处理）

### P0-1 竞赛提交详情 IDOR：可看他人 `testResults`

- **位置**: [`app/api/submissions/[id]/route.ts`](app/api/submissions/[id]/route.ts) L19-38；竞赛列表 [`lib/contest/submissions.ts`](lib/contest/submissions.ts)
- **证据**: 非本人非管理员仅剥离 `code`，仍返回完整 `testResults`/`message`。竞赛提交列表暴露他人 submission `id`。
- **影响**: 比赛中枚举对手逐测点结果 → 作弊/神谕。
- **建议**: 非本人剥掉 `testResults`；赛中列表仅本人（或与封榜一致裁剪）。

### P0-2 竞赛密码门从未生效

- **位置**: [`app/api/contests/[id]/register/route.ts`](app/api/contests/[id]/register/route.ts) L28-41 vs 创建路径 `type` = `ACM`/`OI`
- **证据**: 报名按 `contest.type === 'password'|'invite'` 校验；业务 `type` 实际为赛制枚举，密码存在 `password` 字段。
- **影响**: 设密竞赛可被任意登录用户报名。
- **建议**: 以 `!!contest.password`（或独立 `accessMode`）门控，并调用 `verifyContestPassword`。

### P0-3 SSR 将竞赛 `password` 序列化到客户端

- **位置**: [`app/contests/[id]/page.tsx`](app/contests/[id]/page.tsx) L32-38, L127 → `ContestRegistration`
- **证据**: `prisma.contest.findUnique` 无 select，整对象（含 `password`）传入 Client Component。
- **影响**: 哈希/明文进入浏览器 payload。
- **建议**: 仅传 `hasPassword` 等安全字段。

### P0-4 班级成员权限保存：方法错误（405）

- **位置**: FE [`app/classes/[id]/members/[memberId]/permissions/page.tsx`](app/classes/[id]/members/[memberId]/permissions/page.tsx) `PUT`+`{permissions}`；BE 仅 `PATCH`+扁平 flags
- **冒烟**: `PUT …/permissions` → **405**；`PATCH` 可达业务层（假成员 → 404）
- **影响**: 权限位 UI 完全无法保存。
- **建议**: FE 改 `PATCH` + `JSON.stringify(permissions)`；校验 `data.success`。

### P0-5 竞赛批量加题 `numbers=` 被忽略

- **位置**: FE [`components/contest/CreateContestModal.tsx`](components/contest/CreateContestModal.tsx)；BE [`app/api/problems/route.ts`](app/api/problems/route.ts) 不读 `numbers`
- **冒烟**: `GET /api/problems?numbers=LP1001,NOTEXIST` → `pageSize:20`，返回默认公开列表（LB2026…），非请求题号
- **影响**: 批量加题会把无关题目整页塞进竞赛。
- **建议**: BE 支持 `numbers`/`problemNumbers`；FE 仅添加命中集合。

### P0-6 竞赛封榜可被提交列表绕过

- **位置**: 榜单有 `sealRankTime`（`lib/contest/rankings.ts`）；[`listContestSubmissionsPaged`](lib/contest/submissions.ts) 无封榜裁剪
- **影响**: 封榜后仍可轮询他人提交重建实时榜。
- **建议**: 非管理员封榜期强制 `userId=self` 或截断到 seal 时间。

---

## 三、本轮 P1（两周内）

### 竞赛 / 提交

| ID   | 标题                              | 位置                                                                            | 要点                               |
| ---- | --------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| P1-1 | 软鉴权跳过 tokenVersion/ban       | `app/api/contests/[id]/{submissions,problems,rank}/…` 等用 `getUserFromRequest` | 封禁/改密后 JWT 仍可看竞赛直至过期 |
| P1-2 | `/admin` middleware 只信 JWT role | `middleware.ts`                                                                 | 降权/封禁仍可打开后台壳            |
| P1-3 | WA 下载赛中泄露隐藏测例           | `getFirstWaTestCaseForDownload`                                                 | 赛中可还原 .in/.out                |
| P1-4 | `classId` 短路跳过竞赛可见性      | `lib/problem/access.ts`                                                         | 误标 class+contest 题可赛前打开    |
| P1-5 | 私有竞赛详情无访问门              | `GET /api/contests/[id]`                                                        | ID 枚举信息泄露                    |
| P1-6 | Admin 创建竞赛密码明文存储        | `lib/contest/admin.ts` vs 用户路径 bcrypt                                       | DB/SSR 风险叠加 P0-3               |
| P1-7 | 提交详情无题目访问校验            | `GET /api/submissions/[id]`                                                     | ID 泄露即可窥 metadata/testResults |

### 班级 / 作业

| ID    | 标题                                | 位置                                            | 要点                |
| ----- | ----------------------------------- | ----------------------------------------------- | ------------------- |
| P1-8  | 学生退班永远失败                    | FE DELETE self；BE 要求 `requireClassAdminRole` | 契约断              |
| P1-9  | 班级 permission flags 基本未执行    | 仅 invite 路径检查；submit/notes/stats 忽略     | UI 假安全           |
| P1-10 | 笔记 `isPublic` 未过滤              | `lib/class/note.ts`                             | 草稿对全班可见      |
| P1-11 | 作业成绩汇总口径错误                | `assignment-stats.ts` 累加每次尝试              | avgScore/完成度失真 |
| P1-12 | 班级统计含 REMOVED                  | `lib/class/statistics.ts`                       | 移除题目后指标虚高  |
| P1-13 | 系统 TEACHER 以学生身份可读全班代码 | assignment submissions 用 `canManageContent`    | 跨班级角色越权      |

### 训练 / 题解 / 排名 / Admin

| ID    | 标题                                     | 位置                                                      | 要点                                      |
| ----- | ---------------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| P1-14 | 训练进度只看最新提交                     | `lib/training/progress.ts` L64-76                         | AC 后再 WA 显示未通过（与题单列表不一致） |
| P1-15 | 训练/题解软鉴权无 tokenVersion           | trainings GET、`loadSolutionViewUser`                     | 吊销会话仍个性化/解锁                     |
| P1-16 | Admin 用户列表硬顶 100 且忽略分页        | `listAllUsersForAdmin()` 无参 → take=100；route 不传 page | 管理面截断                                |
| P1-17 | `clearRankingCache` 漏 `myRankAdvanced`  | `lib/ranking/service.ts`                                  | 封禁/解题后我的排名短暂陈旧               |
| P1-18 | 题解可挂到非公开题                       | `createSolution` 无 visibility                            | 存在性神谕 + 内容泄漏给内容管理员         |
| P1-19 | `joined=true` 未登录返回全量公开题单     | `public-list.ts`                                          | 「我的」语义错误                          |
| P1-20 | 题库列表 FE `limit`、API 只认 `pageSize` | 冒烟：`limit=30`→pageSize **20**；`pageSize=30`→**30**    | 分页与 UI 意图不符                        |
| P1-21 | CSV 批量注册 XHR 无 CSRF                 | `BatchRegisterModal.tsx`                                  | CSV 导入 403                              |
| P1-22 | error-monitor 非 auth 未 fail-closed     | 续 P0-E                                                   | DB/system block 不生效                    |

---

## 四、本轮 P2（规划）

- 竞赛 `orderIndex` 0/1 基不一致（admin vs direct）→ 题号从 B 起
- 竞赛作者封榜旁路与 `canAccessAdmin` 不一致
- 结束后仍可报名
- 作业 submissions 页 `setAssignment(data.data)` 形状错
- 创建作业无法设 `allowLateSubmission`
- `completedMembers` 语义名实不符
- 成员进度隐藏零提交学生
- 推荐题单缓存不失效 / `training:list:` 前缀双冒号 footgun
- `joinCount` 可负；标签 >26 题破损
- AdminLayout `?limit=` vs `pageSize`
- 首页 dashboard 拉全量提交 + 遗留状态串
- `getUserStats` 计 AC 行数非去重题
- 公告先清缓存再写竞态
- WS `leave` 无所有权校验
- Contest/Training workspace 裸 `fetch`
- rejudge / first-AC 竞态
- Admin 密码重置弱于 batch `validatePassword`
- CSV 导出无界；dashboard N+1

（细节与定位见各模块静态审查笔记；修复时可按上表标题检索代码。）

---

## 五、按模块结论

### 5.1 认证 / withApi / middleware

- **通过**: CSRF（Origin + double-submit）、`withApi.auth/admin` 的 tokenVersion+ban、cookie-only 会话。
- **问题**: 多处「公开但个性化」路由只用 `verifyToken`/`getUserFromRequest`；`/admin` 页门不校验版本；P0-E 部分。

### 5.2 题库 / 提交 / 评测

- **通过**: 题目详情样例过滤；`withApi` 写路径 CSRF；普通题提交走 `fetchWithCookie`；vitest 判题相关套件绿。
- **问题**: P0-1/5/6，P1-3/4/7/20；提交计数与 SE 路径不一致（P2）。

### 5.3 竞赛

- **问题集群最重**: 密码门死代码、SSR 泄密、封榜可绕、软鉴权、明文密码（admin）。
- 榜单 finalize 缓存清理（第4轮 P0-A）已修好。

### 5.4 班级 / 作业

- 第4轮大量鉴权修复有效（classRole、邀请 maxMembers、REMOVED 在作业统计等）。
- **新断点**: 权限页 405、退班、flags/`isPublic` 未执行、成绩口径、TEACHER 越权看代码。

### 5.5 训练 / 题解

- 进度口径与列表不一致（P1-14）；软鉴权；题解 visibility；`joined` 游客语义。

### 5.6 Admin / 用户 / 头像

- Avatar **写**白名单已齐；**读**仍有裸路径。
- 用户列表硬顶 100；CSV CSRF；设置/公告 systemAdmin 门正常。

### 5.7 通知 / WS / 缓存 / 首页 / 搜索 / 排名

- WS 空闲踢出与绑用户（第4轮）保持。
- `cache.delete`+inflight、logger ALS 已修。
- ranking myRankAdvanced、推荐缓存、通知 limit 参数仍有缺口。
- 搜索/公开设置冒烟 OK。

### 5.8 前后端契约专项

| 契约                                   | 冒烟/静态             | 结论  |
| -------------------------------------- | --------------------- | ----- |
| permissions PUT vs PATCH               | PUT **405**           | P0-4  |
| problems `numbers=`                    | 忽略，返回默认页      | P0-5  |
| problems `limit` vs `pageSize`         | limit→20，pageSize→30 | P1-20 |
| notifications `limit`                  | → 默认 20             | P2    |
| 退班 DELETE self                       | 静态契约断            | P1-8  |
| auth/settings/notification 专用 client | 对齐                  | 通过  |
| 多数 contests/trainings/classes 写方法 | 对齐                  | 通过  |

---

## 六、修复优先级建议（下一轮实施用）

1. **竞赛安全包**: P0-1/2/3/6 + P1-1/3/5/6（密码门、脱敏、封榜、提交详情）
2. **班级契约包**: P0-4 + P1-8/9/10/13（权限 PATCH、退班、flags、代码可见范围）
3. **题库批加题 + 分页**: P0-5 + P1-20
4. **会话一致性**: P1-1/2/15 + P1-22（统一 `getCachedUser`）
5. **数据口径**: P1-11/12/14/16/17
6. **收尾**: Avatar 读 sanitize、P2 列表、限流/CacheKeys

---

## 七、结论

第五轮在第4轮修复之上做了全模块静态复核与关键路径冒烟。**第4轮 6 个新 P0 中 5 个已落地，1 个部分落地**；Avatar 写路径已收口。

本轮确认的核心风险集中在三块：

1. **竞赛访问与封榜形同虚设**（密码门、SSR 泄密、提交列表/详情神谕）。
2. **班级关键写契约断裂**（权限 405、退班失败、权限位未执行）。
3. **前后端参数契约**（`numbers`/`limit`）导致错误数据写入竞赛或错误分页。

测试与 typecheck 全绿、主页面可达，说明问题多为**逻辑/契约缺陷而非构建失败**。本报告可直接作为下一轮修复 backlog；按约定本轮**未改代码**。

---

## 附录 A — 冒烟摘要

```
base: http://localhost:4000
vitest: 165 passed / 13 files
typecheck: pass
pages: 14/14 HTTP 200
API reads: home/problems/contests/trainings/classes/rankings/announcements/
           submissions/notifications/auth/me/profile/admin/* /search/settings OK
probes:
  PUT  .../permissions            → 405
  GET  /api/problems?limit=30     → pageSize 20
  GET  /api/problems?pageSize=30  → pageSize 30
  GET  /api/problems?numbers=...  → 忽略，返回默认公开列表
详见 .tmp-audit-run-5/smoke.json
```

## 附录 B — 与第4轮对照一句话

> 第4轮修的是「已定位的旧债」；第5轮证明主干卫生基线健康，但**竞赛访问模型与若干 FE/BE 契约**仍是正确性与公平性上的硬伤，应优先于风格与 P2 清理。
