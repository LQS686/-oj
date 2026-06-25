# 统一页面样式与降低列表信息密度 Spec

## Why

当前 OJ 平台虽已落地教育化设计 Token（`app/globals.css` 已更新主色/难度色/扁平阴影），但页面层样式仍不统一：

1. **列表渲染方式分裂**：同类数据在不同页面分别用「卡片网格」「内联 `<table>`」「密集行」三种方式呈现，视觉风格不一致。
2. **信息密度低的卡片列表泛滥**：`contests`、`discuss`、`notifications`、`classes`、`assignments`、`notes` 等页面用 `card p-7`/`card p-6`/`card p-5` + `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6` 渲染列表，单屏可见条目少，需大量滚动，与已优化的 `app/problems/page.tsx`（`grid grid-cols-12 gap-4 px-4 py-3 border-b`）密度差距明显。
3. **可复用表格组件闲置**：`components/admin/DataTable.tsx`（302 行，含排序/批量操作/分页/行选择/行点击）已存在并通过 `components/admin/index.ts` 导出，但**零个 admin 页面引用**，每个 admin 页面各自重写 `<thead>/<tbody>` 样板，既重复又难统一。
4. **装饰性样式残留**：`app/problem/[id]/page.tsx` 仍有 6 处 `glass`；`bg-gradient-to-br from-primary`、`hover:-translate-y`、`bg-gradient-to-r from-primary to-primary-dark` 等模式散落在 11 个文件中，与扁平化设计方向冲突。

## What Changes

### 1. 统一 Admin 列表为 DataTable
- 将 7 个使用内联 `<table>` 的 admin 页面（`users`、`trainings`、`trainings/categories`、`submissions`、`problems/source`、`posts`、`page` 仪表盘列表区）迁移到共享 `DataTable` 组件。
- 将 3 个使用卡片网格的 admin 页面（`problems`、`contests`、`classes`）改为 `DataTable`。
- 保留 admin 页面顶部的统计卡片区（dashboard 摘要卡片允许保留卡片形式）。

### 2. 用户侧卡片列表改为密集行布局
- `app/contests/page.tsx`：`card p-7` → 密集行（对齐 `app/problems/page.tsx` 的 `grid grid-cols-12` 模式）。
- `app/discuss/page.tsx`：`card p-7 group` → 密集行。
- `app/notifications/page.tsx`：`card p-5` → 紧凑行。
- `app/classes/page.tsx`：`ClassCard` 网格 → 密集行。
- `app/classes/[id]/assignments/page.tsx`：`AssignmentCard` 网格 → 密集行。
- `app/classes/[id]/notes/page.tsx`：`NoteCard` 网格 → 密集行。
- `app/classes/[id]/problems/page.tsx`：`card p-5` 条目 → 密集行。
- `app/training/page.tsx`：`TrainingCard` 网格 → 密集行（复用已密集的 `ProblemListItem` 模式）。

### 3. 更新共享列表项组件
- `components/training/TrainingCard.tsx`：转为密集行或新增 `TrainingListItem` 行组件。
- `components/solution/SolutionCard.tsx`：列表场景下减少 padding 转为行布局。
- `components/problem/SubmissionList.tsx`：`card-static p-4` 条目 → 密集行。
- `components/training/ProblemListItem.tsx`：保持作为密集行参考模式（不改）。

### 4. 清理残留装饰性样式
- 移除 `app/problem/[id]/page.tsx` 中 6 处 `glass`（替换为 `card`/`bg-card`）。
- 移除 `bg-gradient-to-br from-primary`（7 个文件：`SourceFilterCards`、`RecommendedTrainingBanner`、`discuss/create`、`contests/[id]/rank`、`ProblemDescription`、`login`、`classes/[id]/points/shop`）。
- 移除 `hover:-translate-y`（4 个 solutions/discuss 文件）。
- 移除 `bg-gradient-to-r from-primary to-primary-dark`（discuss/create、solutions edit/new）。

## Impact

- **Affected specs**: 与 `visual-experience-optimization`（颜色对比度）区域重叠但不冲突，本规范聚焦列表密度与样式统一。
- **Affected code**:
  - `components/admin/DataTable.tsx`（成为列表渲染标准，可能需小幅增强空态/加载骨架）
  - `components/admin/index.ts`（已导出 DataTable）
  - Admin 页面：`app/admin/{page,problems,contests,classes,trainings,users,posts,submissions,problems/source,trainings/categories}/page.tsx`
  - 用户侧页面：`app/{contests,discuss,notifications,training,classes,classes/[id]/{assignments,notes,problems}}/page.tsx`
  - 共享组件：`components/training/TrainingCard.tsx`、`components/solution/SolutionCard.tsx`、`components/problem/SubmissionList.tsx`
  - 装饰清理：`app/problem/[id]/page.tsx` + 10 个含渐变/transform 的文件

**BREAKING**: 对外无破坏（URL、API 契约、数据结构不变）。内部组件 props（`TrainingCard`/`SolutionCard`/`NoteCard`/`AssignmentCard`/`ClassCard`）可能调整或弃用。

## ADDED Requirements

### Requirement: Admin 列表统一使用 DataTable
所有 admin 列表页面 SHALL 通过共享 `components/admin/DataTable.tsx` 渲染表格型集合，而非内联 `<table>` 或卡片网格。

#### Scenario: Admin 列表页渲染表格
- **WHEN** admin 页面展示同类记录列表（problems/contests/classes/users/posts/submissions/trainings）
- **THEN** 使用 `<DataTable data={...} columns={...} />`，无内联 `<thead>`/`<tbody>` 样板
- **Verification**: `grep -r "<thead" app/admin/` 返回 0 匹配；`grep -r "DataTable" app/admin/` 命中每个列表页

### Requirement: 用户侧列表使用密集行布局
用户侧列表页面 SHALL 以密集行（`px-4 py-3` 至 `px-6 py-4` padding 的单行/紧凑多行）渲染集合，而非 `p-6`/`p-7`/`p-8` 的卡片网格。

#### Scenario: 竞赛列表密度
- **WHEN** 用户访问 `/contests`
- **THEN** 每个竞赛占一行（标题/状态/时间/参与人数列），padding 为 `px-4 py-3`，非 `card p-7`
- **Verification**: `app/contests/page.tsx` 列表项无 `card p-7`

#### Scenario: 通知列表密度
- **WHEN** 用户访问 `/notifications`
- **THEN** 通知以紧凑行渲染，非 `card p-5` 的 `space-y-3`
- **Verification**: `app/notifications/page.tsx` 列表项无 `card p-5`

### Requirement: 列表页无装饰性视觉模式
列表页及列表项 SHALL NOT 使用玻璃拟态、渐变背景或 transform 类 hover 动画。

#### Scenario: glass 移除
- **WHEN** 检查 `app/problem/[id]/page.tsx`
- **THEN** 无 `glass` className
- **Verification**: `grep "glass" app/problem/[id]/page.tsx` 返回 0 匹配

#### Scenario: 渐变背景移除
- **WHEN** 检查列表页及其筛选/横幅组件
- **THEN** 列表项无 `bg-gradient-to-br from-primary` 或 `bg-gradient-to-r from-primary to-primary-dark`
- **Verification**: grep 在受影响文件返回 0 匹配

## MODIFIED Requirements

### Requirement: 列表信息密度基线
列表页面 SHALL 通过行/表格布局（紧凑 padding）最大化单屏可见条目数，卡片布局仅保留给详情页与仪表盘摘要。

#### Scenario: 列表页卡片网格
- **WHEN** 页面渲染同类条目列表
- **THEN** 不使用 `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6` + `card p-6` 条目
- **Verification**: 列表页对 `.map(` 结果 grep 该组合返回 0 匹配

## REMOVED Requirements

### Requirement: 卡片网格列表渲染
**Reason**: 信息密度低、滚动多、与已密集页面风格不一致。
**Migration**: 每个卡片列表页转为行/表格布局；卡片组件（`TrainingCard`/`SolutionCard`/`NoteCard`/`AssignmentCard`/`ClassCard`）转为行组件或仅保留给详情/仪表盘场景。

## 技术实施原则

- **保持数据契约不变**：API 响应与 TypeScript 接口不改，仅改表现层。
- **复用参考模式**：`app/problems/page.tsx`（`grid grid-cols-12 gap-4 px-4 py-3 border-b border-border hover:bg-primary/5`）与 `components/training/ProblemListItem.tsx` 为密集行参考模式。
- **移动端兼容**：行布局在小屏堆叠（响应式 `grid-cols-12` 已处理）。
- **不引入新依赖**：使用现有 Tailwind 工具类与现有 `DataTable` 组件。
- **逐页可交付**：每个页面转换独立可发布。
