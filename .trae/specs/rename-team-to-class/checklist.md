# Checklist

## 数据模型
- [ ] `prisma/schema.prisma` 8 个班级核心模型重命名（Team/TeamMember/TeamAssignment/TeamAssignmentSubmission/TeamNote/TeamInvite/TeamDirectInvite/TeamJoinRequest → Class/ClassMember/...）
- [ ] `PointsAccount` / `PointsHistory` / `PointsShopItem` / `PointsExchange` 的 `teamId` → `classId`
- [ ] 所有 `@relation` / `@@index` / `@@unique` 引用更新
- [ ] `npx prisma generate` 无报错

## 业务层
- [ ] `lib/class/auth.ts` 存在且导出 `requireClassRole` / `getClassMembership` / `isClassTeacher` / `isClassAssistant`
- [ ] `lib/class/member.ts` 导出成员管理函数
- [ ] `lib/class/assignment.ts` 导出作业 + 提交查询函数
- [ ] `lib/class/note.ts` 导出笔记 CRUD 函数
- [ ] `lib/class/invite.ts` 导出邀请 / 申请函数
- [ ] `lib/class/index.ts` re-export 上述所有模块
- [ ] `lib/points/*` 6 文件入参与内部 prisma 全部 `teamId` → `classId`

## API 路由
- [ ] `app/api/teams/` 目录重命名为 `app/api/classes/`
- [ ] `app/api/admin/teams/` 目录重命名为 `app/api/admin/classes/`
- [ ] 所有 route handler 中 `prisma.team.*` → `prisma.class.*`
- [ ] 所有 route handler 中 `teamId` → `classId`
- [ ] 业务逻辑调用 `lib/class/*` 替代内联 prisma 查询
- [ ] 至少 1 个 GET / POST / PUT / DELETE route 走通 tsc + 基本返回结构正确

## 页面
- [ ] `app/teams/` 目录重命名为 `app/classes/`
- [ ] `app/admin/teams/page.tsx` → `app/admin/classes/page.tsx`
- [ ] 所有页面 `fetch('/api/teams/*')` → `fetch('/api/classes/*')`
- [ ] 文案："团队" → "班级" 无残留（页面标题、按钮、占位符、错误提示）
- [ ] 角色显示："owner" → "teacher"、"admin" → "assistant"、"member" → "student"

## 导航
- [ ] `components/navbar/NavLinks.tsx`：`团队` → `班级`，href `/teams` → `/classes`，图标 `Users` → `GraduationCap`
- [ ] `app/admin/layout.tsx` 侧边栏：`团队管理` → `班级管理`

## 其他文件
- [ ] `app/problem/[id]/page.tsx` 无 team 字段残留
- [ ] `services/` `hooks/` `types/` `contexts/` 0 业务 team 残留
- [ ] README / 部署文档（如需）更新术语

## 数据迁移
- [ ] `scripts/migrate-team-to-class.ts` 存在
- [ ] 迁移脚本包含：`renameCollection` 旧名 → 新名
- [ ] 迁移脚本包含：所有 `teamId` 字段 `$rename` 为 `classId`
- [ ] 迁移脚本包含：所有索引重建（Prisma 启动时自动同步）
- [ ] 迁移脚本幂等：已迁移的集合 / 字段自动跳过
- [ ] 在有数据 / 无数据两种 MongoDB 上各跑一次，行为符合预期

## 验证
- [ ] `npx tsc --noEmit` 无错误
- [ ] `npm run lint` 无错误（如有）
- [ ] 启动 dev server 后访问 `/classes` 列表渲染正常
- [ ] 创建班级 → 加成员 → 邀请 → 接受 → 记笔记 → 发作业 → 提交 → 积分奖励，全链路手测通过
- [ ] `grep -rni "team" app components lib prisma` 在业务代码中 0 命中（白名单除外）

## 部署
- [ ] `git add -A` 暂存所有变更
- [ ] commit message 详细说明本次重命名
- [ ] `git push origin master` 成功
