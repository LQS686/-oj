# Tasks: 项目架构优化

> 进度追踪：本任务清单按依赖关系排序，可并行任务以 **[P]** 标记。
> 状态：基础设施 + 业务层 + 冗余清理 + 稳定性 + 命名规范已落地；剩余 SWR / 全量路由迁移作为后续迭代。

---

## 阶段一：基础设施 ✅

- [x] **Task 1: 统一 API handler 中间件层**
  - [x] 1.1: `lib/api/handler.ts` 实现 `withAuth(handler)`
  - [x] 1.2: 实现 `withClassRole(handler, allowedRoles)`
  - [x] 1.3: `lib/api/response.ts` 提供 `ok()` / `fail()` + 7 个便捷函数
  - [x] 1.4: `lib/api/validation.ts` 提供 `required/optional/toInt/validateObjectId/ValidationError`

- [x] **Task 2 [P]: 业务层脚手架**
  - [x] 2.1: 10 个 lib 业务模块建立 index.ts re-export
  - [x] 2.2: `lib/types/common.ts` Pagination / ListOptions / PaginatedResult

---

## 阶段二：业务层抽离 ✅

- [x] **Task 3: 抽离 `lib/auth/`** — `service.ts` 含缓存版 `findUserById` + `validation.ts`
- [x] **Task 4 [P]: 抽离 `lib/user/`** — 资料 / 统计 / 偏好 / 头像
- [x] **Task 5 [P]: 抽离 `lib/problem/`** — 含 `testcase.ts`（合并 3 个旧文件）
- [x] **Task 6 [P]: 抽离 `lib/submission/`** — CRUD + 状态更新
- [x] **Task 7 [P]: 抽离 `lib/contest/`** — CRUD + 报名 + 榜单
- [x] **Task 8 [P]: 抽离 `lib/notification/`** — CRUD + 已读
- [x] **Task 9 [P]: 抽离 `lib/post/`** — 帖子 / 评论 / 点赞
- [x] **Task 10 [P]: 抽离 `lib/ranking/`** — 综合 / 班级 / 个人
- [x] **Task 11 [P]: 抽离 `lib/solution/`** — 重组 service + 保留权限 helper
- [x] **Task 12 [P]: 抽离 `lib/training/`** — CRUD + 进度
- [x] **Task 13: 完善 `lib/points/` 与 `lib/class/`** — 补齐 `validation.ts`

---

## 阶段三：缓存与前端 🚧

- [x] **Task 14: 服务端缓存层** — `lib/cache.ts` 已在各 service 中使用（TTL 60s）
- [ ] **Task 15: 前端 SWR 集成** — 后续迭代
  - [ ] 15.1: 引入 `swr` 依赖
  - [ ] 15.2: `useCurrentUser()` hook 走 SWR
  - [ ] 15.3: 班级详情 / 题目详情 / 用户主页使用 SWR

---

## 阶段四：冗余清理 ✅

- [x] **Task 16: 删除/合并冗余文件**
  - [x] 16.1: 删除 `replace_console.cjs`
  - [x] 16.2: 根目录 `MarkdownEditor.tsx` → `components/common/`
  - [x] 16.3: 根目录 `MarkdownRenderer.tsx` → `components/common/`
  - [x] 16.4: 合并 `lib/test-case-score.ts` + `lib/testcase-score.ts` + `lib/testcase-upload.ts` → `lib/problem/testcase.ts`
  - [x] 16.5: `components/JudgeStatus.tsx` → `components/submission/`

- [x] **Task 17: 整理 components/ 目录**
  - [x] 17.1: `MarkdownEditor.tsx` 移至 `components/common/`
  - [x] 17.2: `MarkdownRenderer.tsx` 移至 `components/common/`
  - [x] 17.3: `JudgeStatus.tsx` 移至 `components/submission/`
  - [x] 17.4: 引用全部更新

---

## 阶段五：稳定性 + 命名规范 ✅

- [x] **Task 18: 错误处理统一**
  - [x] 18.1: `app/error.tsx` 已存在
  - [x] 18.2: 新增 `app/global-error.tsx`
  - [x] 18.3: `withAuth` 统一异常捕获 + logger.error

- [x] **Task 19: 命名规范 + ESLint**
  - [x] 19.1: `eslint.config.js` 启用 `no-shadow-restricted-names` / 限制 console
  - [x] 19.2: 新增 `docs/NAMING_CONVENTION.md`
  - [ ] 19.3: husky + lint-staged（后续）

---

## 阶段六：验证 🚧

- [x] **Task 20: 类型 + 构建验证**
  - [x] 20.1: `npx tsc --noEmit` 通过
  - [ ] 20.2: `npx next build` （dev 跳过）
  - [ ] 20.3: `npm run lint` （部分规则新增后有遗留告警）
  - [x] 20.4: 业务层 prisma 调用收敛在 `lib/<domain>/service.ts`
  - [x] 20.5: 业务代码 console.* 已使用 logger 替代

- [x] **Task 21: 提交 + 推送 Gitee** ✅
  - [x] 21.1: 分批提交（基础设施 → 业务层 → 清理 → 文档）4 commits
  - [x] 21.2: `git push origin master`（a1f245e 推送成功）
  - [x] 21.3: 更新 README.md 项目结构图 + 2026/06 架构优化 changelog

---

## 后续迭代（不阻塞本次重构）

- [ ] 路由级迁移：100+ API 路由逐个改用 `withAuth` / `withClassRole` 中间件
- [ ] SWR 集成：客户端缓存层（Task 15）
- [ ] husky + lint-staged 自动化（Task 19.3）
- [ ] 服务端缓存统一抽象 `getOrSet<T>(key, ttl, loader)`（lib/cache.ts）
- [ ] 用户登出 / 班级成员变更时缓存失效联动
