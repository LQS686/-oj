# Tasks

- [x] Task 1: 增强 DataTable 组件以支持广泛采用
  - [x] SubTask 1.1: 确认 `components/admin/DataTable.tsx` 的 `onRowClick` 行点击导航正常工作
  - [x] SubTask 1.2: 补充空态自定义与加载骨架（若缺失）
  - [x] SubTask 1.3: 确认 `Column.render` 支持 contests/classes/problems 页面所需的徽章/状态单元格
  - [x] SubTask 1.4: 在 DataTable 顶部添加 JSDoc 说明列定义 API

- [x] Task 2: 迁移使用内联 table 的 admin 页面到 DataTable
  - [x] SubTask 2.1: 重构 `app/admin/trainings/page.tsx` 使用 DataTable
  - [x] SubTask 2.2: 重构 `app/admin/trainings/categories/page.tsx` 使用 DataTable
  - [x] SubTask 2.3: 重构 `app/admin/users/page.tsx` 使用 DataTable（保留批量选择）
  - [x] SubTask 2.4: 重构 `app/admin/posts/page.tsx` 使用 DataTable
  - [x] SubTask 2.5: 重构 `app/admin/submissions/page.tsx` 使用 DataTable
  - [x] SubTask 2.6: 重构 `app/admin/problems/source/page.tsx` 使用 DataTable
  - [x] SubTask 2.7: 重构 `app/admin/page.tsx` 仪表盘列表区使用 DataTable（保留顶部统计卡片）

- [x] Task 3: 转换 admin 卡片列表页为 DataTable
  - [x] SubTask 3.1: 转换 `app/admin/problems/page.tsx`（958 行）- 将 `filteredProblems.map(...)` 的 `card p-4` 网格改为 DataTable；保留顶部统计卡片
  - [x] SubTask 3.2: 转换 `app/admin/contests/page.tsx`（348 行）- 将 `filteredContests.map(...)` 的 `card p-6 group` 网格改为 DataTable
  - [x] SubTask 3.3: 转换 `app/admin/classes/page.tsx`（274 行）- 将 `filteredClasses.map(...)` 的 `card p-6 group` 网格改为 DataTable

- [x] Task 4: 转换用户侧卡片列表页为密集行布局
  - [x] SubTask 4.1: 转换 `app/contests/page.tsx`（499 行）- `space-y-5` + `card p-7` → 对齐 `app/problems/page.tsx` 的行布局
  - [x] SubTask 4.2: 转换 `app/discuss/page.tsx`（512 行）- `space-y-5` + `card p-7 group` → 行布局
  - [x] SubTask 4.3: 转换 `app/notifications/page.tsx`（373 行）- `space-y-3` + `card p-5` → 紧凑行
  - [x] SubTask 4.4: 转换 `app/training/page.tsx`（253 行）- `TrainingCard` 网格 → 行布局
  - [x] SubTask 4.5: 转换 `app/classes/page.tsx`（586 行）- `ClassCard` 网格 → 行布局
  - [x] SubTask 4.6: 转换 `app/classes/[id]/assignments/page.tsx`（256 行）- `AssignmentCard` 网格 → 行布局
  - [x] SubTask 4.7: 转换 `app/classes/[id]/notes/page.tsx`（234 行）- `NoteCard` 网格 → 行布局
  - [x] SubTask 4.8: 转换 `app/classes/[id]/problems/page.tsx` - `card p-5` 条目 → 密集行

- [x] Task 5: 更新共享列表项组件为密集行格式
  - [x] SubTask 5.1: 将 `components/training/TrainingCard.tsx`（145 行）转为密集行或新增 `TrainingListItem` 行组件
  - [x] SubTask 5.2: 将 `components/solution/SolutionCard.tsx`（148 行）列表场景转为密集行
  - [x] SubTask 5.3: 将 `components/problem/SubmissionList.tsx`（121 行）的 `card-static p-4` 条目转为密集行
  - [x] SubTask 5.4: 保持 `components/training/ProblemListItem.tsx` 作为密集行参考模式（不改）

- [x] Task 6: 移除 `glass` 装饰模式
  - [x] SubTask 6.1: 移除 `app/problem/[id]/page.tsx` 中 6 处 `glass`（约 680/684/690/701/705/713 行），替换为 `card`/`bg-card` 等价物

- [x] Task 7: 移除 `bg-gradient-to-br from-primary` 装饰模式
  - [x] SubTask 7.1: 移除 `components/training/SourceFilterCards.tsx`
  - [x] SubTask 7.2: 移除 `components/training/RecommendedTrainingBanner.tsx`
  - [x] SubTask 7.3: 移除 `app/discuss/create/page.tsx`（注：该文件实为 to-r 渐变，已在 Task 8 处理）
  - [x] SubTask 7.4: 移除 `app/contests/[id]/rank/page.tsx`
  - [x] SubTask 7.5: 移除 `components/problem/ProblemDescription.tsx`
  - [x] SubTask 7.6: 移除 `app/login/page.tsx`
  - [x] SubTask 7.7: 移除 `app/classes/[id]/points/shop/page.tsx`

- [x] Task 8: 移除 `hover:-translate-y` 与 `bg-gradient-to-r from-primary to-primary-dark` 模式
  - [x] SubTask 8.1: 移除 `app/discuss/create/page.tsx` 的 `hover:-translate-y`
  - [x] SubTask 8.2: 移除 `app/problems/[id]/solutions/[solutionId]/page.tsx` 的 `hover:-translate-y`
  - [x] SubTask 8.3: 移除 `app/problems/[id]/solutions/[solutionId]/edit/page.tsx` 的 `hover:-translate-y`
  - [x] SubTask 8.4: 移除 `app/problems/[id]/solutions/new/page.tsx` 的 `hover:-translate-y`
  - [x] SubTask 8.5: 移除 `app/discuss/create/page.tsx` 与 solutions edit/new 页面的 `bg-gradient-to-r from-primary to-primary-dark`

- [x] Task 9: 验证收尾
  - [x] SubTask 9.1: grep `app/admin/` 内联 `<thead>` 确认 0 匹配（全部经 DataTable）
  - [x] SubTask 9.2: grep `app/` 列表项 `card p-7`/`card p-6`/`card p-5` 确认已从列表页移除
  - [x] SubTask 9.3: grep `app/` 与 `components/` 的 `glass`/`bg-gradient-to-br from-primary`/`hover:-translate-y`/`bg-gradient-to-r from-primary to-primary-dark` 确认 0 匹配
  - [x] SubTask 9.4: 手动验证每个转换页面渲染正确（admin problems/contests/classes；用户侧 contests/discuss/notifications/training/classes/assignments/notes/problems）
  - [x] SubTask 9.5: 运行 `npx tsc --noEmit` 确认 0 错误

# Task Dependencies

- [Task 2] depends on [Task 1]（DataTable 就绪后再迁移）
- [Task 3] depends on [Task 1]（DataTable 就绪后再卡片转表格）
- [Task 4] 不依赖 DataTable（用行布局），可与 Task 2-3 并行
- [Task 5] 应与 Task 4 同步或先于 Task 4（Task 4 页面使用这些组件）
- [Task 6/7/8] 为独立装饰清理，可与所有其他任务并行
- [Task 9] 依赖所有其他任务完成
