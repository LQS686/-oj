# 验证清单

## DataTable 采用
- [x] `components/admin/DataTable.tsx` 支持行点击导航、自定义单元格渲染、批量操作
- [x] `app/admin/trainings/page.tsx` 使用 DataTable（无内联 `<table>`）
- [x] `app/admin/trainings/categories/page.tsx` 使用 DataTable
- [x] `app/admin/users/page.tsx` 使用 DataTable（保留批量选择）
- [x] `app/admin/posts/page.tsx` 使用 DataTable
- [x] `app/admin/submissions/page.tsx` 使用 DataTable
- [x] `app/admin/problems/source/page.tsx` 使用 DataTable
- [x] `app/admin/page.tsx` 仪表盘列表区使用 DataTable（保留顶部统计卡片）
- [x] grep `app/admin/` 的 `<thead` 返回 0 匹配

## Admin 卡片列表页转换
- [x] `app/admin/problems/page.tsx` 经 DataTable 渲染（无 `card p-4` 条目网格）
- [x] `app/admin/contests/page.tsx` 经 DataTable 渲染（无 `card p-6 group` 条目网格）
- [x] `app/admin/classes/page.tsx` 经 DataTable 渲染（无 `card p-6 group` 条目网格）

## 用户侧卡片列表页转换
- [x] `app/contests/page.tsx` 使用密集行布局（列表项无 `card p-7`）
- [x] `app/discuss/page.tsx` 使用密集行布局（列表项无 `card p-7 group`）
- [x] `app/notifications/page.tsx` 使用紧凑行（列表项无 `card p-5`）
- [x] `app/training/page.tsx` 使用行布局（无 `TrainingCard` 网格 `p-4 pl-5`）
- [x] `app/classes/page.tsx` 使用行布局（无 `ClassCard` 网格 `p-6`）
- [x] `app/classes/[id]/assignments/page.tsx` 使用行布局（无 `AssignmentCard` 网格 `card p-6`）
- [x] `app/classes/[id]/notes/page.tsx` 使用行布局（无 `NoteCard` 网格 `card p-6`）
- [x] `app/classes/[id]/problems/page.tsx` 使用密集行（无 `card p-5` 条目）

## 共享组件更新
- [x] `components/training/TrainingCard.tsx` 转为密集行或由行组件替代
- [x] `components/solution/SolutionCard.tsx` 列表场景转为密集行
- [x] `components/problem/SubmissionList.tsx` 使用密集行（无 `card-static p-4` 条目）
- [x] `components/training/ProblemListItem.tsx` 保持为密集行参考模式（未改）

## 装饰模式移除
- [x] grep `glass` 于 `app/problem/[id]/page.tsx` 返回 0 匹配
- [x] grep `bg-gradient-to-br from-primary` 于 `app/` 与 `components/` 返回 0 匹配（7 文件已清理）
- [x] grep `hover:-translate-y` 于 `app/` 与 `components/` 返回 0 匹配（4 文件已清理）
- [x] grep `bg-gradient-to-r from-primary to-primary-dark` 返回 0 匹配（3 文件已清理）
- [x] grep 确认以下均无残留：`glass-strong`、`gradient-text`、`glow`、`animate-float`、`animate-pulse-slow`、`animate-gradient`、`hover:scale-`、`blur-[`、`backdrop-blur`、`shadow-primary/`

## 密度一致性
- [x] 所有列表页行 padding 在 `px-4 py-3` 至 `px-6 py-4`（列表项无 `p-6`/`p-7`/`p-8`）
- [x] 无列表页对同类数据使用 `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6` + 卡片条目（仅积分商店商品网格保留，属商品展示非数据列表）
- [x] admin 页面顶部统计卡片网格允许保留卡片形式
- [x] 详情页与表单允许使用卡片布局（仅列表页须密集）

## 功能保留
- [x] 所有转换页面仍获取并展示相同数据（无 API 契约变更）
- [x] 行点击导航仍跳转到详情页
- [x] 批量操作（删除等）在 DataTable 页面仍正常工作
- [x] 筛选与搜索在所有转换页面仍正常工作
- [x] 移动端响应式保留（小屏行堆叠正常）
- [x] `npx tsc --noEmit` 0 错误
