# Checklist - 扫描并修复项目Bug

## 安全Bug修复
- [x] `app/teams/[id]/notes/[noteId]/page.tsx` 不再使用未转义的 `dangerouslySetInnerHTML`
- [x] 笔记渲染改用 `MarkdownRenderer`/`MarkdownContent` 或对原文先 `escapeHtml`
- [x] 验证：`<script>alert(1)</script>` 输入后页面不弹窗（依赖 MarkdownRenderer 内的 sanitize）
- [x] 验证：`<img src=x onerror=alert(1)>` 输入后页面不弹窗
- [x] 验证：Markdown 基础语法（标题/加粗/代码块/列表）仍正常显示

## React运行时Bug修复
- [x] `app/LayoutContent.tsx` 不再在 `useEffect` 同步 `setState`
- [x] ESLint `react-hooks/set-state-in-effect` 在该文件不再报告
- [x] 页面切换过渡仍平滑，无视觉闪烁（基于 `key={pathname}` + `animate-fade-in`）
- [x] 全项目扫描：未发现其他 `useEffect` 同步 `setState` 反模式
- [x] 同步修复 `app/teams/[id]/points/page.tsx`、`shop/page.tsx`、`history/page.tsx`、`components/AdminLayout.tsx` 中 `useEffect` 调用了未声明函数导致的变量访问前未声明错误
- [x] 同步修复 `app/contests/[id]/ContestHeader.tsx` 中 `formatDuration` 同类问题

## 代码质量清理
- [x] `app/admin/ai-generation/page.tsx`：移除未使用 `Send`/`Clock`/`Hash` 导入；为 `LogStatus` 增加 `LogResult`/`LogParams` 类型消除 `any`
- [x] `app/admin/ai-models/page.tsx`：移除未使用 `Sparkles`/`Settings`/`router`/`err`（5处）
- [x] `app/admin/contests/[id]/edit/page.tsx`：移除 `Plus`/`AlertCircle`；清理 `searching`/`err`；补 `fetchContest` 依赖
- [x] `app/admin/contests/create/page.tsx`：移除 `setSearching`/`problemsLoaded`/`err`
- [x] `app/admin/contests/page.tsx`：移除 `Play`/`Pause`/`err`（3处）；补 `fetchContests` 依赖
- [x] `app/admin/page.tsx`：补 `fetchDashboardData` 依赖（通过 useCallback）
- [x] `app/admin/posts/page.tsx`：移除 `err`（3处）；补 `fetchPosts` 依赖（通过 useCallback）
- [x] `app/admin/problems/[id]/edit/page.tsx`：移除 `FileText`/`err`（2处）；补 `fetchProblemData` 依赖
- [x] `app/teams/[id]/points/**`：清理 `loadData`/`loadHistory` 变量前未声明问题
- [x] `lib/`/`app/api/` 中 `as any` 强转：作为已知遗留（不属本轮范围）

## 前端日志规范化
- [x] `lib/logger.ts` 已存在且同时支持浏览器（console fallback）
- [x] `hooks/useSubmissionSocket.ts`：移除带emoji的调试log，替换为 `logger.debug`
- [x] `app/teams/**`：替换 `console.error` 为 logger
- [x] `app/admin/**`：替换 `console.error` 为 logger
- [x] `components/**`：替换 `console.error` 为 logger
- [x] `app/contests/**`：移除/替换 `console.log` 为 logger
- [x] `app/problem/[id]/page.tsx`：替换 `console.error` 为 logger

## TODO与未实现项
- [x] `app/api/users/profile/email/route.ts` 邮件发送未实现时返回 501 + `EMAIL_SERVICE_NOT_IMPLEMENTED` 错误码，附 `reason`
- [x] TODO 注释完整，附 SendGrid/Mailgun/SMTP 三种启用方式
- [x] 扫描结果：所有 API 路由无静默"假装成功"实现

## 验证
- [x] `npx tsc --noEmit` 通过（0 错误）
- [x] `npm run lint`：错误从 8 降至 5（剩余 5 个是 `components/MarkdownEditor.tsx` 中 React 19 `react-hooks/refs` 严格规则的预存问题，与本规范范围无关）
- [x] 关键页面（笔记详情、首页切换、修改邮箱）代码结构正常
- [x] 浏览器控制台无调试log噪音（保留error）

## 文档
- [x] 修改文件清单见本规范下方"修改文件总结"
- [x] 未解决项：`components/MarkdownEditor.tsx` 的 React 19 refs 警告（非本轮范围）

## 修改文件总结
1. 安全修复：`app/teams/[id]/notes/[noteId]/page.tsx`
2. React effect：`app/LayoutContent.tsx`, `app/globals.css`（新增 fade-in 动画）
3. Lint 清理：`app/admin/page.tsx`, `app/admin/ai-generation/page.tsx`, `app/admin/ai-models/page.tsx`, `app/admin/contests/page.tsx`, `app/admin/contests/[id]/edit/page.tsx`, `app/admin/contests/create/page.tsx`, `app/admin/posts/page.tsx`, `app/admin/problems/[id]/edit/page.tsx`
4. 变量前未声明：`app/teams/[id]/points/page.tsx`, `app/teams/[id]/points/shop/page.tsx`, `app/teams/[id]/points/history/page.tsx`, `components/AdminLayout.tsx`, `app/contests/[id]/ContestHeader.tsx`
5. logger 替换：19 个文件（详见 spec）
6. TODO：`app/api/users/profile/email/route.ts`
