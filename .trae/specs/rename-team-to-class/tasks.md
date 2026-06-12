# Tasks

本任务列表按依赖关系排序，可并行的任务用 `[P]` 标记。**总任务量较大**（11 个有序任务 + 多子任务），按"先数据层 → 业务层 → API → 页面 → 验证"递进。

---

- [ ] Task 1: Prisma schema 重命名（8 个模型 + 4 个积分字段）
  - [ ] SubTask 1.1: 重命名 8 个班级核心模型：`Team` → `Class`、`TeamMember` → `ClassMember` 等
  - [ ] SubTask 1.2: 重命名积分 4 模型的 `teamId` 字段 → `classId`，同步索引
  - [ ] SubTask 1.3: 更新所有 `TeamMember.role` 角色值（`owner` → `teacher`、`admin` → `assistant`、`member` → `student`），但 schema 字段类型仍是 String，无 enum 改动
  - [ ] SubTask 1.4: 跑 `npx prisma generate` 验证 schema 合法
  - [ ] SubTask 1.5: 编写 `scripts/migrate-team-to-class.ts` 幂等迁移脚本（renameCollection + $rename 字段 + 重建索引）

- [ ] Task 2 [P]: 抽离班级业务层 `lib/class/`
  - [ ] SubTask 2.1: `lib/class/auth.ts` — 鉴权 helper（`requireClassRole` / `getClassMembership` / `isClassTeacher` 等）
  - [ ] SubTask 2.2: `lib/class/member.ts` — 成员管理（list / add / remove / updateRole / updatePermissions）
  - [ ] SubTask 2.3: `lib/class/assignment.ts` — 作业 CRUD + 提交查询
  - [ ] SubTask 2.4: `lib/class/note.ts` — 笔记 CRUD + 阅读统计
  - [ ] SubTask 2.5: `lib/class/invite.ts` — 邀请码 / 直接邀请 / 加入申请
  - [ ] SubTask 2.6: `lib/class/index.ts` — re-export 统一入口

- [ ] Task 3 [P]: 改造 `lib/points/*`（6 文件，teamId → classId）
  - [ ] SubTask 3.1: 全部入参 `teamId` → `classId`
  - [ ] SubTask 3.2: 内部 prisma where 条件同步
  - [ ] SubTask 3.3: 检查调用方（API routes）配合修改

- [ ] Task 4: API 路由迁移 + 重写（17 + 2 = 19 个路由）
  - [ ] SubTask 4.1: `app/api/teams/` → `app/api/classes/`（git mv 整个目录）
  - [ ] SubTask 4.2: `app/api/admin/teams/` → `app/api/admin/classes/`
  - [ ] SubTask 4.3: 各 route.ts 中 `prisma.team.*` → `prisma.class.*`、`teamId` → `classId`
  - [ ] SubTask 4.4: 业务逻辑调用 `lib/class/*`（不再在 route handler 内联）

- [ ] Task 5: 页面迁移（19 + 1 = 20 个页面）
  - [ ] SubTask 5.1: `app/teams/` → `app/classes/`（git mv 整个目录）
  - [ ] SubTask 5.2: `app/admin/teams/page.tsx` → `app/admin/classes/page.tsx`
  - [ ] SubTask 5.3: 所有页面 fetch URL 路径 `/api/teams` → `/api/classes`
  - [ ] SubTask 5.4: 文案替换：标题 / 按钮 / 占位符 / 错误提示

- [ ] Task 6: Navbar 导航 + 角色语义调整
  - [ ] SubTask 6.1: `components/navbar/NavLinks.tsx`：`团队` → `班级`，href `/teams` → `/classes`，图标改 `GraduationCap`
  - [ ] SubTask 6.2: `app/admin/layout.tsx` 侧边栏：`团队管理` → `班级管理`
  - [ ] SubTask 6.3: 角色名映射工具：`owner/admin/member` → `teacher/assistant/student`（显示用），数据库存值更新

- [ ] Task 7: 其他引用清理
  - [ ] SubTask 7.1: `app/problem/[id]/page.tsx` 的 `fromTeam` / `teamId` 字段（如有）→ `fromClass` / `classId`
  - [ ] SubTask 7.2: `app/teams/page.tsx` / `members/page.tsx` 等的内部 `team*` state 命名 → `class*`
  - [ ] SubTask 7.3: 检查所有 `services/` `hooks/` `types/` `contexts/` 中的 team 残留
  - [ ] SubTask 7.4: README / 部署文档中的 "team" 描述 → "class"（如需）

- [ ] Task 8: 执行数据迁移脚本 + 启动验证
  - [ ] SubTask 8.1: 本地启动 MongoDB → 跑 `tsx scripts/migrate-team-to-class.ts`
  - [ ] SubTask 8.2: 启动 Next dev，访问 `/classes`、`/classes/[id]`、`/admin/classes`
  - [ ] SubTask 8.3: 创建班级、加成员、发作业、记笔记、邀请加入、积分奖励全链路手测

- [ ] Task 9: 全量检索 + grep 清理
  - [ ] SubTask 9.1: `grep -rni "team"` 排除 node_modules/.next/.trae/logs，确保 0 业务命中
  - [ ] SubTask 9.2: 允许的"白名单"：变量名 `teamMate`、英文单词、注释等（如有）
  - [ ] SubTask 9.3: ESLint / tsc 通过

- [ ] Task 10: 提交并推送 Gitee
  - [ ] SubTask 10.1: `git add -A` + 详细 commit message
  - [ ] SubTask 10.2: `git push origin master`

---

# Task Dependencies

- Task 2 / Task 3 依赖 Task 1（schema 重命名后，prisma 客户端才会有新类型）
- Task 4 依赖 Task 1 + Task 2 + Task 3（API 路由引用新 prisma 类型 + 调用 `lib/class/*` + `lib/points/*`）
- Task 5 依赖 Task 4（前端页面调用新 API 路径）
- Task 6 独立，可与 Task 4 / Task 5 并行
- Task 7 依赖 Task 1 + Task 4 + Task 5（其他文件可能引用新类型或新路径）
- Task 8 依赖 Task 1~7 全部完成
- Task 9 依赖 Task 1~8（最终验收）
- Task 10 依赖 Task 9
