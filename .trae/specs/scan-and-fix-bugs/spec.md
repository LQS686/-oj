# 扫描并修复项目Bug规范

## Why
对项目进行系统性扫描发现存在以下未修复问题，影响代码质量、运行时安全与可维护性：

1. **XSS安全漏洞**：`app/teams/[id]/notes/[noteId]/page.tsx` 使用 `dangerouslySetInnerHTML` 渲染笔记内容，但 `renderMarkdown` 函数未对用户输入进行HTML转义，存在脚本注入风险
2. **React运行时缺陷**：`app/LayoutContent.tsx` 在 `useEffect` 内同步调用 `setState`，触发级联渲染并可能产生闪烁
3. **大量ESLint警告未处理**：未使用变量、缺失依赖、`any` 类型、`err` 形参未使用等横跨多个页面
4. **遗留 `console.*` 调用**：约50+处 `console.log/error/warn` 仍在前端代码中（即使后端已基本替换）
5. **空 catch / 静默错误**：部分API/客户端异常未记录或处理
6. **遗留 TODO**：`app/api/users/profile/email/route.ts` 中邮件发送功能为占位实现

## What Changes

### 1. 安全Bug修复（最高优先级）
- 替换 `renderMarkdown` 为安全实现：先转义HTML再注入Markdown标签（或采用 `MarkdownRenderer` 组件）
- 验证笔记/帖子/评论等用户内容在所有渲染入口的XSS防护

### 2. React运行时Bug修复
- 修复 `app/LayoutContent.tsx` 的 `setState in effect` 问题
- 审查所有 `useEffect` 中同步 `setState` 的位置

### 3. 代码质量Bug清理
- 移除未使用变量（imports、参数、局部变量）
- 补全/移除 `useEffect` 依赖
- 将不必要的 `any` 替换为精确类型
- 修复/记录未使用的 `err` 形参（添加日志或删除参数）

### 4. 日志规范化（前端）
- 替换前端 `console.*` 为统一 `logger` 或移除调试输出
- 保留必要告警，移除emoji调试log

### 5. TODO与未实现项
- 标记 `app/api/users/profile/email/route.ts` TODO，改为清晰抛错或集成策略
- 扫描其他未实现占位逻辑

## Impact
- Affected specs: 全部前端页面 + 笔记/帖子渲染 + 邮件API
- Affected code:
  - `app/teams/[id]/notes/[noteId]/page.tsx` (XSS)
  - `app/LayoutContent.tsx` (React effect)
  - `app/api/users/profile/email/route.ts` (TODO)
  - `components/MarkdownRenderer.tsx` / `components/MarkdownContent.tsx` (可能复用)
  - `lib/sanitize.ts` (escapeHtml 复用)
  - 多页面 `console.*` 残留

## ADDED Requirements

### Requirement: Markdown渲染必须HTML转义
所有通过 `dangerouslySetInnerHTML` 渲染用户内容的页面必须先对原始文本进行HTML转义，再注入安全的Markdown标签。
- **Scenario**: 用户提交含 `<script>alert(1)</script>` 的笔记
- **THEN**: 渲染结果中 `<` `>` `&` `'` `"` 被转义为实体，不执行任何脚本

### Requirement: 禁止在useEffect中同步setState
- **Scenario**: 组件挂载时若必须更新state，使用 `useSyncExternalStore` 或在事件处理器中更新，或用 `useState` 初始化
- **THEN**: ESLint `react-hooks/set-state-in-effect` 规则在修改文件不再报告

### Requirement: 干净的前端日志
前端业务代码不应直接调用 `console.log`，调试输出应在生产构建被剥离或封装。
- **Verification**: `app/**` 与 `components/**` 中 `console.*` 调用数显著降低（保留必要的error）

### Requirement: TypeScript严格化
核心业务文件不应出现显式 `any` 强转（除非有明确注释说明）。
- **Verification**: `lib/` `app/api/` 中 `(x as any)` 数量减少；新增类型守卫优先

## MODIFIED Requirements
无

## REMOVED Requirements
无

## 技术细节

### XSS修复方案
- 选项A：在 `renderMarkdown` 开头对原文调用 `lib/sanitize.ts` 的 `escapeHtml`，再注入Markdown标签
- 选项B：直接复用 `components/MarkdownRenderer.tsx` / `components/MarkdownContent.tsx`，移除自实现的 `renderMarkdown`

优先选B：项目已有 `MarkdownRenderer` 组件，应统一使用并删除本地实现。

### React effect修复方案
- `LayoutContent.tsx` 的过渡逻辑应使用 `useDeferredValue` 或基于 `key` prop 的方式重置children，避免在effect中同步setState

### console.* 处理
- 在前端使用 `lib/logger.ts`（如果存在客户端版本）或直接删除
- 保留 `console.error` 用于关键错误上报

### TODO 邮件
- 保持TODO注释但增加显式说明：当前环境无SMTP，调用方需自行接入
- 不应默默返回成功
