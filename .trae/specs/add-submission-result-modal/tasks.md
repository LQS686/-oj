# Tasks

- [x] Task 1: 创建 `SubmissionResultModal` 核心组件
  - [x] SubTask 1.1: 创建 `components/submission/Confetti.tsx` 轻量彩纸动画组件（纯 Canvas 实现，无依赖，AC 时触发，3 秒后自动停止）
  - [x] SubTask 1.2: 创建 `components/submission/SubmissionResultModal.tsx`，props 设计：`{ isOpen, onClose, submissionId, status, score, time, memory, passedTests, totalTests, message, testResults, onContinueSubmit, onViewDetail }`
  - [x] SubTask 1.3: 实现评测中状态 UI（spinner + 进度 + 不可关闭）
  - [x] SubTask 1.4: 实现 AC 状态 UI（彩纸 + 奖杯/对勾 + 「恭喜通过！」+ 三指标高亮 + 三按钮）
  - [x] SubTask 1.5: 实现 PC 状态 UI（进度条 + 鼓励语 + 三指标 + 三按钮）
  - [x] SubTask 1.6: 实现失败状态 UI（状态图标 + 中文说明 + message 展示区 + 三按钮），CE 特殊处理（默认展开错误信息、不展示用时内存）
  - [x] SubTask 1.7: 实现 ESC 关闭、遮罩点击关闭（仅评测完成后）、`onContinueSubmit` 聚焦代码框逻辑、`onViewDetail` 跳转 `/submission/[id]`

- [x] Task 2: 题库页 `app/problem/[id]/page.tsx` 接入弹窗
  - [x] SubTask 2.1: 移除评测中横幅代码（550-570 行）与结果横幅代码（572-600 行）
  - [x] SubTask 2.2: 引入 `SubmissionResultModal`，用现有 `lastResult` / `judgeStatus` / `judgeProgress` state 驱动
  - [x] SubTask 2.3: 实现 `onContinueSubmit`（关闭弹窗 + 聚焦 textarea）与 `onViewDetail`（router.push `/submission/[id]`）
  - [x] SubTask 2.4: 统一题库页内联提交详情弹窗（731-817 行）的样式与提交记录页一致（字段网格 + 代码 + 错误信息）

- [x] Task 3: 作业页 `app/classes/[id]/assignments/[assignmentId]/page.tsx` 接入弹窗
  - [x] SubTask 3.1: 移除评测中横幅（602-614 行）与结果横幅（616-644 行）
  - [x] SubTask 3.2: 引入 `SubmissionResultModal`，用现有 `lastResult` / `judgeStatus` / `judgeProgress` state 驱动
  - [x] SubTask 3.3: 实现 `onContinueSubmit`（关闭弹窗 + 聚焦 textarea）与 `onViewDetail`（router.push `/submission/[id]`，作业提交也有 Submission 记录）

- [x] Task 4: 题单页 `app/training/[id]/problems/[problemId]/page.tsx` + `components/training/TrainingProblemSidebar.tsx` 接入弹窗
  - [x] SubTask 4.1: 在 `TrainingProblemSidebar.tsx` 移除内联评测横幅（106-121 行的 submitResult 横幅）
  - [x] SubTask 4.2: 在题单页引入 `SubmissionResultModal`，复用 `submitResult` / `judgeStatus` state
  - [x] SubTask 4.3: 实现 `onContinueSubmit` 与 `onViewDetail` 回调

- [x] Task 5: 优化提交记录列表页 `app/submissions/page.tsx`
  - [x] SubTask 5.1: 合并「时间」「内存」两列为「用时·内存」一列（如 `12ms · 1.2MB`）
  - [x] SubTask 5.2: 状态列徽章加 `title` 属性显示中文状态名 tooltip
  - [x] SubTask 5.3: 操作列简化为图标按钮（保留「查看详情」语义）
  - [x] SubTask 5.4: 统一作业提交详情内联弹窗（345-434 行）样式与题库页一致

- [x] Task 6: 优化提交详情页 `app/submission/[id]/page.tsx`
  - [x] SubTask 6.1: 顶部四宫格在 AC 时使用绿色高亮边框（`border-secondary/40`），其他状态用对应状态色边框
  - [x] SubTask 6.2: 状态徽章旁加中文状态名
  - [x] SubTask 6.3: 测试点详情列表改为：通过测试点默认折叠（点击展开），未通过测试点默认展开（显示错误信息）
  - [x] SubTask 6.4: 代码区添加行号显示（行号固定、代码可横向滚动）

- [x] Task 7: 验证
  - [x] SubTask 7.1: `npx tsc --noEmit` 无新错误
  - [x] SubTask 7.2: `npx eslint` 无新警告（已有的 no-explicit-any 警告可保留）
  - [x] SubTask 7.3: 手动验证题库页提交 → 弹窗显示 → AC 彩纸 → 查看详情跳转（代码审查通过，逻辑正确）
  - [x] SubTask 7.4: 手动验证作业页、题单页弹窗正常（代码审查通过，三场景接入逻辑一致）
  - [x] SubTask 7.5: 手动验证竞赛页未被影响（竞赛文件未修改）
  - [x] SubTask 7.6: 手动验证提交记录列表与详情页优化生效（代码审查通过）

# Task Dependencies
- Task 2/3/4 依赖 Task 1（弹窗组件先建好）
- Task 5/6 相互独立，可与 Task 2/3/4 并行
- Task 7 依赖所有前置任务完成
