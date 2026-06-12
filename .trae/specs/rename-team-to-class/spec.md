# 团队 → 班级重命名 + 项目结构优化 Spec

## Why

当前项目使用"团队（team）"作为小组管理单元，但实际使用场景是**校园教学班**（作业分发、笔记共享、积分激励），"team" 这个词与"教学班"的语义不符，导致产品定位模糊、用户认知偏差。本次重构将所有"team"概念重命名为"class（班级）"，并将散落在 API 路由里的班级业务逻辑抽离到 `lib/class/` 业务层，**统一管理、避免循环引用、提高可维护性**。

## What Changes

### 一、数据模型重命名（Prisma schema）
- `Team` → `Class`（集合 `Team` → `classes`）
- `TeamMember` → `ClassMember`（`teamId` → `classId`）
- `TeamAssignment` → `ClassAssignment`
- `TeamAssignmentSubmission` → `ClassAssignmentSubmission`
- `TeamNote` → `ClassNote`
- `TeamInvite` → `ClassInvite`
- `TeamDirectInvite` → `ClassDirectInvite`
- `TeamJoinRequest` → `ClassJoinRequest`
- 积分相关 4 个模型字段 `teamId` → `classId`：`PointsAccount` / `PointsHistory` / `PointsShopItem` / `PointsExchange`

### 二、API 路由迁移
- `app/api/teams/*` → `app/api/classes/*`（含 17 个子路由）
- `app/api/admin/teams/*` → `app/api/admin/classes/*`

### 三、页面迁移
- `app/teams/*` → `app/classes/*`（含 19 个页面）
- `app/admin/teams/page.tsx` → `app/admin/classes/page.tsx`

### 四、业务逻辑抽离（项目结构优化）
新增 `lib/class/` 业务层，将原本散落在各 API route handler 里的逻辑集中：
- `lib/class/member.ts` — 成员管理、角色 / 权限校验
- `lib/class/assignment.ts` — 作业 CRUD、提交查询
- `lib/class/note.ts` — 笔记 CRUD
- `lib/class/invite.ts` — 邀请码 / 直接邀请 / 加入申请
- `lib/class/auth.ts` — `requireClassRole` / `getClassMembership` / `isClassAdmin` 等鉴权 helper
- `lib/class/index.ts` — 统一 re-export
- `lib/points/*` 同步更新：`teamId` → `classId` 参数

### 五、UI 文案 / 路由调整
- Navbar：`团队` → `班级`，图标从 `Users` 改为 `GraduationCap`（学识帽，更符合班级语义）
- 所有页面：标题、按钮、占位符、错误提示中的"团队" → "班级"
- 角色名：`owner` → `teacher`（班主任）；`admin` → `assistant`（助教）；`member` → `student`（学生）
- 申请加入文案 / 邀请文案 / 通知文案同步更新

### 六、数据迁移
- 编写 `scripts/migrate-team-to-class.ts`：MongoDB `renameCollection` + 字段 `$rename` + 索引重建
- 幂等执行：可重复运行，已迁移的数据自动跳过
- **BREAKING**：所有现有团队数据将迁移到新结构；若需保留数据请使用迁移脚本

## Impact

- Affected specs：无（首次重命名）
- Affected code：
  - 数据层：`prisma/schema.prisma`（8 个模型 + 4 个积分字段）
  - 路由层：`app/api/teams/*`（17 路由）、`app/api/admin/teams/*`（2 路由）
  - 页面层：`app/teams/*`（19 页面）、`app/admin/teams/*`（1 页面）
  - 组件层：`components/navbar/NavLinks.tsx` + 各页面内嵌文案
  - 业务层：散落在 17 个 route handler 里的逻辑 → `lib/class/*`
  - 积分层：`lib/points/*`（6 文件，teamId → classId）
  - 迁移脚本：新增 `scripts/migrate-team-to-class.ts`

## ADDED Requirements

### Requirement: 统一"班级"领域模型
系统 SHALL 使用 `Class` 作为班级领域根模型，所有关联模型（成员 / 作业 / 笔记 / 邀请 / 申请 / 积分）通过 `classId` 关联。

#### Scenario: 创建班级
- **WHEN** 用户在 `/classes/create` 提交班级信息
- **THEN** 调用 `POST /api/classes`，创建 `Class` 文档 + `ClassMember`（role=teacher）记录

#### Scenario: 班级详情页
- **WHEN** 用户访问 `/classes/[id]`
- **THEN** 渲染新 `Class` 数据，含班级名、班主任、成员数、积分榜

### Requirement: 班级业务逻辑层 `lib/class/`
系统 SHALL 提供 `lib/class/` 业务层，封装所有班级相关的数据访问与权限校验，**禁止**在 API route handler 内直接拼写 Prisma 查询语句涉及跨表关联（成员权限、作业提交等场景）。

#### Scenario: 鉴权调用
- **WHEN** API route 需要校验"当前用户是否为班级管理员"
- **THEN** 调用 `await requireClassRole(classId, userId, 'teacher' | 'assistant')` 而非手写 prisma query

#### Scenario: 业务逻辑复用
- **WHEN** 多个 route 需要"获取班级成员列表 + 角色"
- **THEN** 调用 `await listClassMembers(classId)` 统一返回，UI 渲染逻辑解耦

### Requirement: 积分系统 `classId` 改造
`lib/points/*` SHALL 接收 `classId: string` 参数，内部 Prisma 查询使用 `classId` 字段；保持 API 响应字段不变（仍叫 `classId`），仅入参名与字段名从 `teamId` → `classId`。

#### Scenario: 发放积分
- **WHEN** 班级管理员奖励学生积分
- **THEN** 调 `awardPoints({ classId, userId, amount, reason })` → 写入 `PointsHistory`（含 `classId` 字段）

### Requirement: MongoDB 数据迁移
`scripts/migrate-team-to-class.ts` SHALL 提供幂等的数据迁移脚本，将所有 `teamId` 字段、相关集合与索引迁移至新结构。

#### Scenario: 全新数据库
- **WHEN** 在新数据库上运行迁移脚本
- **THEN** 报告"无 Team 集合，跳过迁移"（不报错）

#### Scenario: 旧数据库
- **WHEN** 在已有团队数据的数据库上运行迁移脚本
- **THEN** 自动重命名集合 + 字段 + 索引，且可重复运行

## MODIFIED Requirements

### Requirement: Navbar 导航
原 `团队` 入口 SHALL 改为 `班级`，路由 `/teams` → `/classes`，图标 `Users` → `GraduationCap`。

### Requirement: 角色语义
原 `owner / admin / member` 角色名 SHALL 改为 `teacher / assistant / student`，数据库字段值同步更新（`TeamMember.role` → `ClassMember.role`）。

### Requirement: 班级管理后台
`/admin/teams` SHALL 改为 `/admin/classes`，列表筛选、操作按钮文案同步更新。

## REMOVED Requirements

### Requirement: 旧团队 API
**Reason**：被 `/api/classes/*` 替代，避免新旧并存造成认知混乱。
**Migration**：所有调用方（前端 / 脚本）已在前置任务中同步切换。

### Requirement: 旧团队页面
**Reason**：被 `/classes/*` 替代。
**Migration**：所有内部链接已通过批量替换切换。
