# Checklist

## 提交结果弹窗组件
- [x] `components/submission/SubmissionResultModal.tsx` 已创建，props 包含 isOpen/onClose/submissionId/status/score/time/memory/passedTests/totalTests/message/testResults/onContinueSubmit/onViewDetail
- [x] 评测中状态展示 spinner + 进度（已通过/总测试点），弹窗不可关闭
- [x] AC 状态展示彩纸动画 + 奖杯/对勾图标 + 「恭喜通过！」+ 得分/用时/内存高亮 + 三按钮（查看详情/继续提交/关闭）
- [x] PC 状态展示进度条 + 鼓励文案 + 三指标 + 三按钮
- [x] 失败状态（WA/TLE/MLE/RE/PE/OLE/CSP/SE）展示状态图标 + 中文说明 + message 区域 + 三按钮
- [x] CE 状态默认展开错误信息、不展示用时内存
- [x] ESC 与遮罩点击在评测完成后可关闭弹窗；评测中不可关闭
- [x] 「查看详情」跳转 `/submission/[id]`，「继续提交」关闭弹窗
- [x] `components/submission/Confetti.tsx` 已创建，纯 Canvas 实现，无新依赖

## 三场景接入（竞赛除外）
- [x] 题库页 `app/problem/[id]/page.tsx` 已移除评测中横幅与结果横幅，接入 `SubmissionResultModal`
- [x] 题库页内联提交详情弹窗样式已统一
- [x] 作业页 `app/classes/[id]/assignments/[assignmentId]/page.tsx` 已移除横幅，接入弹窗
- [x] 题单页 `app/training/[id]/problems/[problemId]/page.tsx` + `TrainingProblemSidebar.tsx` 已移除横幅，接入弹窗
- [x] 竞赛相关文件未被修改（`app/contests/**`、`components/contest/**`、`lib/contest/**`、`app/api/contests/**`）

## 提交记录列表页优化
- [x] `app/submissions/page.tsx` 表格「时间」「内存」已合并为「用时·内存」列
- [x] 状态列徽章带中文 tooltip
- [x] 操作列简化为图标按钮
- [x] 作业提交详情内联弹窗样式已与题库页统一

## 提交详情页优化
- [x] `app/submission/[id]/page.tsx` 顶部四宫格 AC 时绿色高亮边框，其他状态对应状态色
- [x] 状态徽章旁展示中文状态名
- [x] 测试点详情：通过默认折叠、未通过默认展开，可手动切换
- [x] 代码区显示行号，行号固定、代码可横向滚动

## 验证
- [x] `npx tsc --noEmit` 无新错误
- [x] `npx eslint` 无新警告（已有 no-explicit-any 可保留）
- [x] 未引入新 npm 依赖
- [x] 未修改后端 API、数据库 schema、WS 协议、`hooks/useSubmissionSocket.ts`
