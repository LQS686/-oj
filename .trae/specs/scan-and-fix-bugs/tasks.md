# Tasks - 扫描并修复项目Bug

## 任务总览
- [x] Task 1: 修复XSS漏洞（团队笔记Markdown渲染）
- [x] Task 2: 修复LayoutContent的setState in effect
- [x] Task 3: 清理未使用变量与缺失依赖
- [x] Task 4: 规范化前端日志输出
- [x] Task 5: 处理TODO/未实现项
- [x] Task 6: 验证修复结果

## 详细任务

### Task 1: 修复XSS漏洞（团队笔记Markdown渲染）
- [ ] 1.1: 检查 `app/teams/[id]/notes/[noteId]/page.tsx` 中 `renderMarkdown` 是否对原始文本做HTML转义
- [ ] 1.2: 用 `components/MarkdownRenderer.tsx` 替换自实现 `renderMarkdown`
- [ ] 1.3: 验证替换后笔记渲染正常
- [ ] 1.4: 编写最小XSS用例验证（输入 `<script>alert(1)</script>` 不执行）

### Task 2: 修复LayoutContent的setState in effect
- [ ] 2.1: 审查 `app/LayoutContent.tsx` 中 `useEffect` 同步setState逻辑
- [ ] 2.2: 改用基于 `useDeferredValue` 或 `key` prop的children重置方案
- [ ] 2.3: 验证页面切换无闪烁且ESLint不再警告

### Task 3: 清理未使用变量与缺失依赖
- [ ] 3.1: 修复 `app/admin/ai-generation/page.tsx` 中未使用导入（`Send`/`Clock`/`Hash`）与 `any`
- [ ] 3.2: 修复 `app/admin/ai-models/page.tsx` 中未使用导入
- [ ] 3.3: 修复 `app/admin/contests/**` 中未使用变量与缺失依赖
- [ ] 3.4: 修复 `app/admin/posts/page.tsx` 与 `app/admin/problems/**` 中同类问题
- [ ] 3.5: 修复 `app/admin/page.tsx` 中 `fetchDashboardData` 依赖
- [ ] 3.6: 修复 `app/teams/**` 中未使用 `err` 形参与 `searching` 等局部变量
- [ ] 3.7: 修复 `app/teams/page.tsx` 中同类问题
- [ ] 3.8: 处理 `lib/` 与 `app/api/` 中 `as any` 强转（仅必要保留）

### Task 4: 规范化前端日志输出
- [ ] 4.1: 检查 `lib/logger.ts` 是否暴露客户端使用API
- [ ] 4.2: 替换 `hooks/useSubmissionSocket.ts` 中带emoji的 `console.log` 为 `logger.debug` 或删除
- [ ] 4.3: 替换 `app/teams/**` 中 `console.error` 为统一 logger
- [ ] 4.4: 替换 `app/admin/**` 中 `console.error`
- [ ] 4.5: 替换 `components/**` 中 `console.error`
- [ ] 4.6: 替换 `app/contests/**` 中 `console.log`
- [ ] 4.7: 替换 `app/problem/[id]/page.tsx` 中 `console.error`

### Task 5: 处理TODO/未实现项
- [ ] 5.1: 在 `app/api/users/profile/email/route.ts` 中：
  - 保持TODO注释
  - 改为显式返回501 Not Implemented并清晰消息
  - 不应返回200假装成功
- [ ] 5.2: 扫描 `app/api/**` 中其他未实现/桩函数并标记

### Task 6: 验证修复结果
- [ ] 6.1: 运行 `npm run lint` 检查新增warning/error数量
- [ ] 6.2: 运行 `npx tsc --noEmit` 确认TypeScript无错误
- [ ] 6.3: 抽样验证关键页面功能（笔记渲染、Layout切换、邮件API）

## 任务依赖关系
- Task 1（XSS）独立，最高优先级
- Task 2（React effect）独立
- Task 3（lint清理）独立，可与Task 4并行
- Task 4（日志）独立
- Task 5（TODO）独立
- Task 6（验证）依赖 Task 1–5

## 验证标准
1. `npm run lint` 警告数显著下降（目标：不再新增警告）
2. TypeScript 编译无错误
3. XSS用例在浏览器中不执行
4. Layout切换无闪烁
5. 邮件API未实现时返回明确错误而非200
