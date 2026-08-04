# DSOJ 项目代码审计报告（合并终版）

> 本文档合并了 2026-07-28 至 2026-07-31 期间的五轮代码审查报告
> （原 `CODE_REVIEW_REPORT.md` ～ `CODE_REVIEW_REPORT_5.md`），
> 保留每轮的发现索引、修复进度与结论，供后续维护引用。
>
> 合并日期：2026-08-04
> 合并时卫生基线：`npm run typecheck` ✅ / `npm run lint` ✅ / `vitest 216 passed` ✅

---

## 目录

1. [审计历程总览](#1-审计历程总览)
2. [第五轮（最终）P0/P1 修复状态](#2-第五轮最终p0p1-修复状态)
3. [历轮 P0 问题清单（编号索引）](#3-历轮-p0-问题清单编号索引)
4. [跨轮次遗留问题](#4-跨轮次遗留问题)
5. [历轮结论要点](#5-历轮结论要点)

---

## 1. 审计历程总览

| 轮次 | 时间 | 方式 | 统计 | 结论 |
| ---- | ---- | ---- | ---- | ---- |
| 第一轮 | 07-28 | 静态阅读 | 高 73 / 中 142 / 低 156（去重前），P0 表 14 项 | 首次全量审计，0 修复 |
| 第二轮 | 07-28 | 对照复核 | 已修复 54 / 部分 19 / 未修复 19 / 新回归 50 | 修复率约 14.6%；多处 P0 修复不彻底 |
| 第三轮 | 07-28 | 对照复核 | 已修复 73 / 部分 23 / 未修复 13 / 新回归 42 | WS/通知/缓存成为新薄弱点 |
| 第四轮 | 07-28 | 对照复核 | 已修复 114 / 部分 32 / 未修复 22 / 新回归 44 | 用户标注 P0 全部真修复；新发现 6 个 P0 |
| 第五轮 | 07-31 | 静态 + 冒烟 | 有效发现 46（P0 6 / P1 22 / P2 18） | 主干卫生健康，竞赛访问模型与 FE/BE 契约是硬伤 |

> 注：五轮报告均为「未修改业务代码」的审计；实际修复由后续开发提交完成
> （见 git 历史 `1b1e701` 大规模整改、`13ae1ab` 收敛 validation/上下文拆分 等）。

---

## 2. 第五轮（最终）P0/P1 修复状态

第五轮确认的 6 个 P0 与 22 个 P1 在本项目最近一次整改中**已全部修复**，验证如下：

| 编号 | 问题 | 修复证据 |
| ---- | ---- | -------- |
| P0-1 | 竞赛提交详情 IDOR 可看他人 testResults | `app/api/submissions/[id]/route.ts` 非 owner 走题目访问校验 + 封榜检查 + 脱敏 |
| P0-2 | 竞赛密码门从未生效 | `app/api/contests/[id]/register/route.ts` 以 `contest.password` 字段 + bcrypt 校验 |
| P0-3 | SSR 序列化竞赛 password 到客户端 | `app/contests/[id]/page.tsx` 仅传安全字段（hasPassword） |
| P0-4 | 班级成员权限保存 405（PUT vs PATCH） | 前端改 `PATCH` + 全量权限位 |
| P0-5 | 竞赛批量加题 `numbers=` 被忽略 | `lib/problem/export.ts` 实现 numbers 精确批量查询 |
| P0-6 | 竞赛封榜可被提交列表绕过 | `lib/contest/submissions.ts` 封榜期强制 `userId=viewer` |
| P1-1 | 软鉴权跳过 tokenVersion/ban | 全部收敛到 `getCachedUser`/`resolveViewerFromRequest` |
| P1-2 | /admin middleware 只信 JWT role | `middleware.ts` 经 `getCachedUser` 校验 DB role + tokenVersion + ban |
| P1-3 | WA 下载赛中泄露隐藏测例 | 竞赛进行中禁下载；`lib/problem/lookup.ts` 仅查询 isSample |
| P1-4 | classId 短路跳过竞赛可见性 | `lib/problem/access.ts` 仅按 visibility + contestId 判定 |
| P1-5 | 私有竞赛详情无访问门 | `lib/contest/public.ts` 非公开仅作者/管理员/已报名可见 |
| P1-6 | Admin 创建竞赛密码明文 | 全部 `bcrypt.hash(password, 12)` |
| P1-7 | 提交详情无题目访问校验 | 非 owner 强制 `assertCanAccessProblem` |
| P1-8 | 学生退班永远失败 | 后端新增自退分支 `memberId === user.id` |
| P1-9 | 班级 permission flags 未执行 | `hasClassPermission` 覆盖 submit/notes/assignments/invite/members/stats |
| P1-10 | 笔记 isPublic 未过滤 | 列表按 isPublic 或本人过滤 |
| P1-11 | 作业成绩汇总口径错误 | `assignment-stats.ts` 按每题最高分汇总 |
| P1-12 | 班级统计含 REMOVED | 统计排除 REMOVED（本次又修复 member-activity 遗漏处） |
| P1-13 | TEACHER 以学生身份可读全班代码 | 后端 `allSubmissions` 仅班级 admin 角色可见 |
| P1-14 | 训练进度只看最新提交 | 四处进度计算统一为「任意历史 AC 即 AC」 |
| P1-15 | 训练/题解软鉴权无 tokenVersion | 全部走 `resolveViewerFromRequest` |
| P1-16 | Admin 用户列表硬顶 100 | 后端分页已就绪（本次补前端分页） |
| P1-17 | clearRankingCache 漏 myRankAdvanced | 已补 `deleteByPrefix('ranking:myRankAdvanced')` |
| P1-18 | 题解可挂到非公开题 | `createUserSolution` 校验 visibility |
| P1-19 | joined=true 未登录返回全量公开题单 | 未登录返回空集 |
| P1-20 | 题库列表 limit vs pageSize 契约 | API 统一读 limit/pageSize 并 clamp |
| P1-21 | CSV 批量注册 XHR 无 CSRF | `ensureCsrfToken()` + `X-CSRF-Token` 头 |
| P1-22 | error-monitor 非 auth 未 fail-closed | `safeCall` 对 database/system/auth 全查 `isBlockedAsync` |

### 本次（合并终版）追加修复

在第五轮基线之上，本次清理还修复了以下新确认问题：

| 编号 | 问题 | 修复 |
| ---- | ---- | ---- |
| N-1 | 竞赛前台编辑私有竞赛静默清除密码 | `CreateContestModal` 密码留空时保持原哈希 |
| N-2 | ignore-spaces 比较器超长 token 截断误判 AC | 截断即判 WA（同步/异步两版本 + 测试） |
| N-3 | logout 不吊销 token | 登出递增 tokenVersion |
| N-4 | 注册全表 count 可放大 DoS | 仅关闭注册时查 count，短 TTL 缓存 |
| N-5 | middleware unknown IP 共享限流桶 | 唯一子键消除全局 429 DoS |
| N-6 | Redis 未配置时账号锁静默失效 | 退化到进程内内存锁（含测试） |
| N-7 | forgot-password 会话吊销 DoS / 重置轰炸 | 改为签名重置链接（30min + tokenVersion 绑定） |
| N-8 | 题解 90 分门槛可被「发任意题解」绕过 | 仅 approved 作者豁免 |
| N-9 | 班级 member-activity 计入 REMOVED | 统计排除 REMOVED |
| N-10 | 站点权限误授予班级能力 | 编辑/删除仅班级角色；完成情况按 canViewStats |
| N-11 | 权限编辑规则前后端不一致 | assistant 不能改 assistant/owner（前端联动禁用） |
| N-12 | Admin 用户列表前端无分页 | 服务端分页 + 过滤 + DataTable pagination |
| N-13 | 单测点 timeLimit/memoryLimit 无范围校验 | 1-30000ms / 1-1024MB（创建 + 更新） |
| N-14 | 竞赛缓存键字面量漂移 / 全量误伤 | 统一 per-contest rankPrefix；移除无效 contest:list 删除 |
| N-15 | **移除 rating 评分体系** | 排行榜仅保留解题数（总/月/周/日榜），schema 字段与索引删除 |

---

## 3. 历轮 P0 问题清单（编号索引）

> 各轮编号体系不同（H-* / P0-n / P0-A..F），按原报告编号引用，勿跨表对齐。

### 第一轮（14 项 P0，编号 `H-*`）

| 编号 | 问题 |
| ---- | ---- |
| H-Sec-1 | server.ts 路径穿越（`startsWith` 可被同级目录绕过） |
| H-Judge-1 | Docker 评测模式整体失效 |
| H-Sec-53 | Docker JWT_SECRET 进镜像层 |
| H-Prob-25/26/28/29 + H-Sub-29/53 | 私有题可见性校验缺失（详情/stats/pretest/提交/wa-testcase） |
| H-Sub-51 | 提交比赛校验缺失（contestId/时间窗/报名） |
| H-Auth-1/2 | 封禁机制失效（isBanned 不查、tokenVersion 不全） |
| H-WS-6 | WebSocket join 鉴权绕过 |
| H-User-1.4 | 头像注册表进程级内存 |
| H-User-2.2 | 改密走 MongoDB 直写（Prisma 不感知） |
| H-Sec-35 | health/db 公开 |
| H-Sec-24 | 系统设置无 schema |
| H-Sec-23 | SMTP 密码解密失败按明文处理 |
| H-Sub-33 | 测试用例非事务（0 测点风险） |
| H-Class-5 | deleteClass 无 cascade |

### 第二轮（8 项 P0，编号 `P0-1..8`）

| 编号 | 问题 |
| ---- | ---- |
| P0-1 | 头像注册表仍进程级 Map |
| P0-2 | 评测子进程继承全部环境变量（泄露 JWT_SECRET） |
| P0-3 | withRetry 重试非幂等事务（重复 ObjectId） |
| P0-4 | withApi.auth 不查 isBanned（复核已修复，401/403 UX） |
| P0-5 | 忘记密码不递增 tokenVersion |
| P0-6 | 批量角色更新不递增 tokenVersion |
| P0-7 | SSR 硬编码 cookie 名 'token'（__Host-token 失效） |
| P0-8 | 邮箱修改前后端契约不一致 |

### 第三轮（6 项 P0 + 1 项附加，编号复用 `P0-1..6`）

| 编号 | 问题 |
| ---- | ---- |
| P0-1 | 活跃 WebSocket 5-6 分钟永久断开 |
| P0-2 | 登出/换账号复用旧 socket |
| P0-3 | 班级 PATCH/DELETE 仅 withApi.auth（复核为误判） |
| P0-4 | 邮箱修改契约（本轮已修复） |
| P0-5 | 头像 init `Math.random()` 同步 GC |
| P0-6 | forgot-password 原生 fetch 无 CSRF（复核为误判） |
| 附加 | 管理员降权后无法退订提交房间 |

### 第四轮（6 项新 P0，编号 `P0-A..F`）

| 编号 | 问题 |
| ---- | ---- |
| P0-A | finalizeContestRankings 后未清 contest:rank 缓存 |
| P0-B | 班级 PATCH/DELETE 应迁移 classRole |
| P0-C | logger.ts 无 AsyncLocalStorage |
| P0-D | cache.delete() 不清 inflight Map |
| P0-E | error-monitor.block 仅 auth 硬拦 |
| P0-F | submitContestCode 管理员旁路无审计 |

---

## 4. 跨轮次遗留问题

- **贯穿性遗留**：`lib/problem/import/*` parser、dsoj-exporter、部署脚本/CI 多轮未审计
- **反复出现项**：Logger AsyncLocalStorage（P0-C 已修）、error-monitor 硬拦（P1-22 已修）、
  avatar 读写白名单（写路径已收口，读路径已 sanitize）、缓存键规范（N-14 已统一）
- **已移除**：班级积分账户/积分商城/积分流水/邀请码（README 声明）
- **设计取舍**：公开用户主页保留 role 标签展示（非敏感枚举，与 OJ 惯例一致）

---

## 5. 历轮结论要点

- **第一轮**：首次全量审计（371 项去重前），安全/鉴权/沙箱问题为主，0 修复。
- **第二轮**：修复率约 14.6%；P0 修复不彻底（头像注册表、tokenVersion、SSR cookie、评测密钥泄露）。
- **第三轮**：核心鉴权/数据一致性/沙箱隔离基本到位；WS/通知/缓存成为新薄弱点。
- **第四轮**：六大方向（WS、缓存、班级鉴权、时间窗、头像白名单、通知容错）修复到位；
  班级模块本轮最彻底（33 项）；仍残留 6 个新 P0。
- **第五轮**：主干卫生基线健康（测试/typecheck 全绿、页面与 API 冒烟通过）；
  竞赛访问模型与 FE/BE 契约是正确性与公平性硬伤，已全部修复。
- **合并终版**：五轮全部 P0/P1 已落地；本次再修复 15 项新确认问题（含移除 rating 评分体系）；
  卫生基线保持全绿（typecheck / lint / 216 tests）。

---

*原五轮报告文件已删除，本文件为唯一权威版本。*
