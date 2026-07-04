# 提交结果弹窗与提交记录优化 Spec

## Why
当前各提交代码场景（题库、作业、题单）各自用内联横幅展示评测结果，视觉反馈弱、缺乏成就感，且代码重复；提交记录列表与详情页信息密度不够合理，缺少关键状态的可读性优化。需要一个统一的「提交结果模态窗」，在评测完成后给用户强反馈（尤其是 AC 时的成就感），并覆盖除竞赛外的所有提交场景，同时优化提交记录的信息展示。

## What Changes
- **新增** 统一的 `SubmissionResultModal` 组件，替代题库页、作业页、题单页各自的内联评测横幅
  - 评测中：展示进度（已通过/总测试点）+ 动画 spinner
  - 评测完成：根据状态展示不同视觉
    - AC：庆祝动画（彩纸/撒花）+ 奖杯图标 + 「恭喜通过！」文案 + 用时/内存高亮
    - PC（部分正确）：进度条 + 鼓励文案 + 已通过测试点
    - WA/TLE/MLE/RE/CE/PE/OLE/CSP/SE：状态图标 + 中文说明 + 错误信息（如有）
  - 底部操作按钮：「查看详情」（跳转 `/submission/[id]`）、「继续提交」（关闭弹窗聚焦代码框）、「关闭」
  - 支持键盘 ESC 关闭、点击遮罩关闭
- **改造** 三个提交场景接入新弹窗（**竞赛场景不动**）
  - `app/problem/[id]/page.tsx`：移除评测中横幅 + 结果横幅，改为弹窗；保留提交记录 Tab
  - `app/classes/[id]/assignments/[assignmentId]/page.tsx`：移除内联横幅，改为弹窗
  - `app/training/[id]/problems/[problemId]/page.tsx` + `components/training/TrainingProblemSidebar.tsx`：移除内联横幅，改为弹窗
- **复用** 现有 `useSubmissionSocket` Hook，仅调整各页面 WS 回调里的 UI 渲染逻辑（不修改 Hook 本身）
- **优化** 提交记录列表页 `app/submissions/page.tsx`
  - 表格列调整：合并「时间/内存」为一列（用时 · 内存），减少视觉碎片
  - 状态列加颜色徽章 + tooltip 中文说明
  - 行hover高亮、紧凑排版、操作列简化
  - 空状态优化
- **优化** 提交详情页 `app/submission/[id]/page.tsx`
  - 顶部信息卡片：状态/分数/用时/内存四宫格视觉强化（AC 时绿色高亮）
  - 测试点详情：默认折叠错误信息，点击展开；通过的测试点折叠，未通过的展开
  - 代码区：添加行号显示
- **统一** 题库页内联提交详情弹窗（`app/problem/[id]/page.tsx` 731-817 行）与提交记录页内联弹窗（`app/submissions/page.tsx` 345-434 行）的样式，使其与新弹窗风格一致
- **不修改** 竞赛相关任何文件（`app/contests/**`、`components/contest/**`、`lib/contest/**`、`app/api/contests/**`）

## Impact
- **新增文件**：
  - `components/submission/SubmissionResultModal.tsx`（核心新组件）
  - `components/submission/Confetti.tsx`（轻量彩纸动画，纯 CSS/Canvas，无新依赖）
- **修改文件**：
  - `app/problem/[id]/page.tsx`（移除横幅、接入弹窗、统一详情弹窗样式）
  - `app/classes/[id]/assignments/[assignmentId]/page.tsx`（移除横幅、接入弹窗）
  - `app/training/[id]/problems/[problemId]/page.tsx`（接入弹窗）
  - `components/training/TrainingProblemSidebar.tsx`（移除内联横幅）
  - `app/submission/[id]/page.tsx`（优化信息展示）
  - `app/submissions/page.tsx`（优化列表 + 统一详情弹窗）
- **不动文件**：竞赛相关全部文件、`hooks/useSubmissionSocket.ts`、`lib/websocket/**`、后端 API、`lib/status.ts`（仅引用）
- **依赖**：不引入新 npm 依赖，彩纸动画自行实现
- **向后兼容**：不修改 API、不修改数据库、不修改 WS 协议

## ADDED Requirements

### Requirement: 提交结果模态窗
系统 SHALL 在用户提交代码后（题库、作业、题单场景），通过统一的模态窗实时展示评测进度与最终结果，给用户强视觉反馈。

#### Scenario: 评测中状态
- **WHEN** 用户提交代码后收到 `judge:progress` 或 `submission:update` 事件且状态为 `Judging`/`Pending`/`Running`
- **THEN** 弹窗展示 spinner 动画 + 「正在评测中...」文案 + 当前进度（已通过/总测试点）
- **AND** 弹窗不可关闭（禁用遮罩点击与 ESC，仅允许「后台等待」按钮最小化）

#### Scenario: AC（通过）状态
- **WHEN** 评测完成且状态为 `AC` 或 `Accepted`
- **THEN** 弹窗展示彩纸动画 + 奖杯/对勾图标 + 「恭喜通过！」标题
- **AND** 高亮展示得分、用时、内存三项关键指标
- **AND** 底部按钮：「查看详情」（主按钮）、「继续提交」、「关闭」
- **AND** 播放轻量成功提示音（可选，默认关闭，受用户偏好控制）

#### Scenario: 部分正确（PC）状态
- **WHEN** 评测完成且状态为 `PC` 或 `Partly Correct`
- **THEN** 弹窗展示进度条（已通过/总测试点）+ 「部分通过」文案 + 鼓励语
- **AND** 展示得分、用时、内存
- **AND** 底部按钮：「查看详情」、「继续提交」、「关闭」

#### Scenario: 失败状态（WA/TLE/MLE/RE/CE/PE/OLE/CSP/SE）
- **WHEN** 评测完成且状态为失败类状态
- **THEN** 弹窗展示对应状态图标 + 中文状态名 + 简短说明（如 TLE → 「程序运行超时」）
- **AND** 若有 `message` 字段，展示评测信息（错误编译信息等），可滚动
- **AND** 展示得分（通常为 0）、用时、内存
- **AND** 底部按钮：「查看详情」（主按钮）、「继续提交」、「关闭」

#### Scenario: 编译错误（CE）特殊处理
- **WHEN** 状态为 `CE` 或 `Compile Error`
- **THEN** 弹窗默认展开编译错误信息区域（因 CE 无测试点数据，需直接展示错误原因）
- **AND** 不展示用时/内存（CE 不产生运行数据）

#### Scenario: 关闭与导航
- **WHEN** 用户点击「查看详情」
- **THEN** 关闭弹窗并跳转至 `/submission/[submissionId]`
- **WHEN** 用户点击「继续提交」
- **THEN** 关闭弹窗，聚焦代码输入框，保留上次代码
- **WHEN** 用户按 ESC 或点击遮罩（评测完成后）
- **THEN** 关闭弹窗

#### Scenario: 竞赛场景排除
- **WHEN** 用户在竞赛题目页提交代码
- **THEN** 不展示新弹窗，保留竞赛原有横幅逻辑（本次特性不动竞赛）

### Requirement: 提交记录列表优化
系统 SHALL 优化提交记录列表页的信息展示，提升可读性与信息密度。

#### Scenario: 表格列优化
- **WHEN** 用户访问 `/submissions` 提交记录列表页
- **THEN** 表格展示：提交ID、题目、用户、状态、分数、语言、用时·内存（合并列）、提交时间、操作
- **AND** 状态列使用彩色徽章 + 中文 tooltip
- **AND** 「用时·内存」列紧凑展示（如 `12ms · 1.2MB`）
- **AND** 行 hover 高亮，操作列简化为图标按钮

#### Scenario: 作业提交详情弹窗统一
- **WHEN** 用户在提交记录列表点击作业提交的「查看详情」
- **THEN** 弹出与题库页一致的提交详情弹窗样式（统一字段网格 + 代码 + 错误信息）

### Requirement: 提交详情页优化
系统 SHALL 优化提交详情页 `/submission/[id]` 的信息展示。

#### Scenario: 顶部信息卡片强化
- **WHEN** 用户访问提交详情页
- **THEN** 顶部四宫格（状态/分数/用时/内存）在 AC 时使用绿色高亮边框，失败时使用对应状态色
- **AND** 状态徽章 + 中文状态名同时展示

#### Scenario: 测试点详情折叠优化
- **WHEN** 提交有多个测试点
- **THEN** 通过的测试点默认折叠（仅显示一行摘要），未通过的测试点默认展开（显示错误信息）
- **AND** 用户可手动展开/折叠任意测试点

#### Scenario: 代码区行号显示
- **WHEN** 展示提交代码
- **THEN** 代码区左侧显示行号，行号与代码对齐
- **AND** 长代码可横向滚动，行号固定

## MODIFIED Requirements

### Requirement: 各提交场景的评测反馈
原：各页面（题库/作业/题单）各自用内联横幅展示「评测中」与「评测结果」，样式不统一、无成就感反馈。

改：统一接入 `SubmissionResultModal`，移除内联横幅；评测进度与结果均通过模态窗展示。竞赛场景保持原状不动。

### Requirement: 提交记录信息展示
原：列表页列碎片化、详情页测试点全部展开、代码无行号。

改：列表页合并用时内存列、状态加中文 tooltip；详情页测试点智能折叠、代码加行号、AC 时绿色高亮。
