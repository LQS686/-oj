# Checklist

## 阶段一：遗留缺陷收敛

### tsc 预存在错误（6 项）
- [x] `app/api/admin/ai/solution/status/route.ts:31` 的 `logId` 类型收窄已修复
- [x] `app/api/admin/announcements/route.ts:29-30` 的 `body.title`/`body.content` 类型收窄已修复
- [x] `app/api/classes/[id]/notes/[noteId]/read/route.ts:8` 对 `@/lib/points/award` 的引用已移除，已读标记逻辑保留
- [x] `app/classes/page.tsx:575,577` 的 Lucide 图标 `title` prop 已移除
- [x] `components/training/TrainingCard.tsx:91` 的 Lucide 图标 `title` prop 已移除
- [x] `lib/category/service.ts` 的 `prisma.category` 问题已处理（移除文件或改用 `prisma.trainingCategory`）

### eslint 预存在 errors（3 项）
- [x] `hooks/useSubmissionSocket.ts:183` 的 `react-hooks/refs` 已修复（渲染期不再访问 `socketRef.current`）
- [x] `scripts/e2e-ai-generation.ts:19` 的 `no-require-imports` 已修复（改 ES import 或 scripts 目录豁免）
- [x] 第 3 项 eslint error 随上述修复一并解决

## 阶段二：冗余代码清理

### 重复模块合并
- [x] `lib/notification` 与 `lib/notifications` 已合并为单一模块，引用已更新
- [x] `lib/mongodb.ts` 与 `lib/mongodb-direct.ts` 已合并或职责明确分工（互补：NextAuth 连接 vs 直接 CRUD）
- [x] `lib/auth.ts` 与 `lib/auth/index.ts` 已合并为单一入口，引用已更新
- [x] `lib/api-response.ts` 与 `lib/api/response.ts` 已合并为单一模块，引用已更新
- [x] `components/solution/MarkdownEditor.tsx` 与 `components/common/MarkdownEditor.tsx` 已合并，引用已更新
- [x] `components/solution/MarkdownRenderer.tsx` 与 `components/common/MarkdownRenderer.tsx` 已合并或职责明确分工（互补：不同高亮主题/样式）
- [x] `services/authService.ts` 与 `lib/auth/service.ts` 已合并或职责明确分工（互补：登录编排 vs 数据原语）
- [x] `lib/error-handler.ts` 与 `lib/error-monitor.ts` 已合并或职责明确分工（互补：错误处理 vs 错误监控）
- [x] `lib/open-problem-tab.ts` 与 `lib/problem-open.ts` 已合并，引用已更新
- [x] `lib/page-titles.ts` 与 `lib/document-title.ts` 已合并或职责明确分工（互补：标题映射 vs 标题格式化）
- [x] `lib/sensitive-words.ts` 与 `lib/content-safety.ts` 已合并或职责明确分工（互补：词库 vs 过滤逻辑）
- [x] `components/SetDocumentTitle.tsx` 与 `components/DocumentTitleProvider.tsx` 已合并，引用已更新

### 死代码与未引用导出
- [x] `lib/` 中无未被引用的导出（删除 8 个孤儿文件：open-problem-tab、content-safety、sensitive-words、error-handler、admin/apiData 等；移除 28 个未引用导出）
- [x] `components/` 中无未被引用的导出（删除 RecommendedTrainingBanner.tsx）
- [x] `app/api/` 中无未被引用的导出
- [x] `hooks/`、`contexts/`、`types/` 中无未被引用的导出（删除 useNotifications、useProblem；types/api.ts 清理 11 个死类型）
- [x] 无不可达分支与注释保留的死代码块（清理 lib/judge/worker.ts 4 处注释死代码）

### 重复类型与工具函数
- [x] `types/` 与各模块内联类型无重复定义（types/api.ts 清理 11 个死/重复类型）
- [x] 重复的工具函数已收敛（SubmissionResultModal 的 formatTime 合并到 lib/utils；4 项判定非重复保留）

## 阶段三：冗余文件清理

### 一次性脚本
- [x] 已失效的 `scripts/migrate-*.ts` 已移除（5 个）
- [x] 已完成诊断的 `scripts/probe-*`、`scripts/diagnose-*`、`scripts/find-*` 已移除（6 个诊断脚本 + audit-routes.mjs）
- [x] 过时的 `scripts/test-*.ts` 临时测试脚本已移除或并入 `tests/`（6 个）
- [x] 保留的 e2e 脚本 lint 已修复（e2e-ai-generation.ts 保留，lint 在 Task 2 已通过）

### 根目录文档与产物
- [x] `AI-SELF-TEST-REPORT.md`、`TEST_REPORT.md`、`test-discussion-api.sh` 等一次性产物已清理
- [x] `DOCKER_*.md`、`ALIYUN_DOCKER_LOGIN.md`、`DEPLOYMENT_GUIDE.md` 过时内容已核查处理（5 份 Docker 文档因引用旧路径已删除）

### 日志与构建产物
- [x] `logs/` 下被提交的日志文件已移除（4 个 .log 文件）
- [x] `.gitignore` 已覆盖 `logs/` 与 `*.log`（并补充 /dist、.env*、!.env.example）

### 参考资源
- [x] `参考资源/Project_LemonLime-0.3.6.2/` 已加入 `.gitignore` 或已移出仓库根目录（未擅自删除）

### 不完整规范
- [x] `.trae/specs/` 中无 `checklist.md`/`tasks.md` 的规范目录已记录归档建议（39 个规范全部完整，无需归档）

## 阶段四：验证回归

- [x] `npx tsc --noEmit` 退出码为 0，无任何错误
- [x] `npx eslint --quiet` 退出码为 0，无 error（warn 项降至 1044，较基线 1256 减少 212）
- [x] `npm test` 全部用例通过，无新增失败（91 用例通过）
- [x] 清理未引入跨模块回归（功能行为未改变）
