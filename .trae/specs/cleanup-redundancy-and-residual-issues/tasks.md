# Tasks

## 阶段一：遗留缺陷收敛（P0）

- [x] Task 1: 修复 6 个 tsc 预存在错误 — 使 `npx tsc --noEmit` 达到 0 错误。
  - [x] SubTask 1.1: 修复 `app/api/admin/ai/solution/status/route.ts:31` — `logId` 为 `string | null` 的类型收窄（添加显式 null 检查或提前返回 400）
  - [x] SubTask 1.2: 修复 `app/api/admin/announcements/route.ts:29-30` — `body.title`/`body.content` 为 `string | undefined` 的类型收窄
  - [x] SubTask 1.3: 修复 `app/api/classes/[id]/notes/[noteId]/read/route.ts:8` — 移除对不存在的 `@/lib/points/award` 模块的引用，保留已读标记逻辑
  - [x] SubTask 1.4: 修复 `app/classes/page.tsx:575,577` 与 `components/training/TrainingCard.tsx:91` — 移除 Lucide 图标的 `title` prop（新版已弃用）
  - [x] SubTask 1.5: 修复 `lib/category/service.ts:13,20,22` — 核查引用情况：无引用则移除整个文件；有引用则改用 `prisma.trainingCategory` 或并入 `lib/training/`
- [x] Task 2: 修复 3 个 eslint 预存在 errors — 使 `npx eslint --quiet` 达到 0 error。
  - [x] SubTask 2.1: 修复 `hooks/useSubmissionSocket.ts:183` — `react-hooks/refs`：将渲染期 `socketRef.current` 访问移入 effect/回调
  - [x] SubTask 2.2: 修复 `scripts/e2e-ai-generation.ts:19` — `@typescript-eslint/no-require-imports`：改为 ES import 或在 eslint 配置中为 scripts 目录豁免（若脚本保留）

## 阶段二：冗余代码清理（P1）

- [x] Task 3: 重复模块识别与合并 — 对 spec 中列出的疑似重复模块逐一核查引用与职责，保留更完整实现，移除冗余并更新引用。
  - [x] SubTask 3.1: 核查 `lib/notification` vs `lib/notifications`，合并为单一模块（已合并入 `lib/notification/service.ts`，删除 `lib/notifications/`）
  - [x] SubTask 3.2: 核查 `lib/mongodb.ts` vs `lib/mongodb-direct.ts`，合并为单一模块（判定互补：NextAuth 连接 vs 直接 CRUD，保留双方）
  - [x] SubTask 3.3: 核查 `lib/auth.ts` vs `lib/auth/index.ts`，合并为单一入口（已合并入 `lib/auth/index.ts`，删除 `lib/auth.ts`）
  - [x] SubTask 3.4: 核查 `lib/api-response.ts` vs `lib/api/response.ts`，合并为单一模块（`lib/api-response.ts` 为死代码，已删除）
  - [x] SubTask 3.5: 核查 `components/solution/MarkdownEditor.tsx` vs `components/common/MarkdownEditor.tsx`，合并（common 版为死代码，已删除）
  - [x] SubTask 3.6: 核查 `components/solution/MarkdownRenderer.tsx` vs `components/common/MarkdownRenderer.tsx`，合并（判定互补：不同高亮主题/样式/预处理，保留双方）
  - [x] SubTask 3.7: 核查 `services/authService.ts` vs `lib/auth/service.ts`，合并（判定互补：登录编排层 vs 数据原语层，保留双方）
  - [x] SubTask 3.8: 核查 `lib/error-handler.ts` vs `lib/error-monitor.ts`，合并或明确职责分工（判定互补：错误处理 vs 错误监控，保留双方）
  - [x] SubTask 3.9: 核查 `lib/open-problem-tab.ts` vs `lib/problem-open.ts`，合并（双方均死代码，保留更完整的 `open-problem-tab.ts`，删除 `problem-open.ts`）
  - [x] SubTask 3.10: 核查 `lib/page-titles.ts` vs `lib/document-title.ts`，合并（判定互补：路由标题映射 vs 标题格式化，保留双方）
  - [x] SubTask 3.11: 核查 `lib/sensitive-words.ts` vs `lib/content-safety.ts`，合并或明确职责分工（判定互补：词库 vs 过滤逻辑，保留双方）
  - [x] SubTask 3.12: 核查 `components/SetDocumentTitle.tsx` vs `components/DocumentTitleProvider.tsx`，合并（SetDocumentTitle 为死代码，已删除）
- [x] Task 4: 死代码与未引用导出清理 — 扫描 `lib/`、`components/`、`app/api/`、`hooks/`、`contexts/`、`types/` 中未被引用的导出、不可达分支、注释死代码，移除。（删除 8 个孤儿文件、移除 28 个未引用导出、清理 4 处注释死代码）
- [x] Task 5: 重复类型定义与工具函数收敛 — 核查 `types/` 与各模块内联类型定义，合并重复定义；收敛重复的工具函数。（types/api.ts 清理 11 个死类型、合并 SubmissionResultModal 的 formatTime；4 项判定非重复保留）

## 阶段三：冗余文件清理（P1）

- [x] Task 6: 一次性脚本清理 — 评估并移除已失效的 `scripts/migrate-*`、`scripts/probe-*`、`scripts/diagnose-*`、`scripts/find-*`、过时的 `scripts/test-*.ts`（非正式测试）。（删除 18 个脚本，保留 5 个有价值脚本，更新 package.json）
  - [x] SubTask 6.1: 核查每个 `scripts/migrate-*.ts` 是否已完成迁移且无复用价值，移除（5 个迁移脚本已删除）
  - [x] SubTask 6.2: 核查 `scripts/probe-*`、`scripts/diagnose-*`、`scripts/find-*` 等诊断脚本，移除已完成诊断（6 个诊断脚本已删除）
  - [x] SubTask 6.3: 核查 `scripts/test-*.ts` 临时测试脚本，移除或并入正式 `tests/`（6 个临时测试脚本已删除）
  - [x] SubTask 6.4: 核查 `scripts/e2e-ai-generation.ts` 与其他 e2e 脚本，保留有价值者并修复 lint（保留 e2e-ai-generation.ts，lint 已在 Task 2 修复）
- [x] Task 7: 根目录过时文档与产物清理 — 评估并清理 `AI-SELF-TEST-REPORT.md`、`TEST_REPORT.md`、`test-discussion-api.sh` 等一次性产物；核查 `DOCKER_*.md`、`ALIYUN_DOCKER_LOGIN.md`、`DEPLOYMENT_GUIDE.md` 是否过时。（删除 8 个过时文档/产物，保留 README.md 与 LICENSE）
- [x] Task 8: 日志与构建产物清理 — 将 `logs/` 下被提交的日志文件移除并加入 `.gitignore`；核查 `.gitignore` 是否已覆盖 `logs/`、`*.log`。（删除 4 个日志文件，.gitignore 新增 logs/、*.log、/dist、.env*、!.env.example）
- [x] Task 9: 参考资源目录处理 — 评估 `参考资源/Project_LemonLime-0.3.6.2/`：若仍有参考价值则加入 `.gitignore`（避免纳入版本控制），不擅自删除用户资料。（已加入 .gitignore，未删除目录，提示用户需 git rm --cached）
- [x] Task 10: 不完整规范归档评估 — 核查 `.trae/specs/` 中无 `checklist.md`/`tasks.md` 的规范目录，仅记录归档建议，不删除历史规范。（39 个规范全部完整，无需归档）

## 阶段四：验证与回归

- [x] Task 11: 全量验证 — 运行 `npx tsc --noEmit`（0 错误）、`npx eslint --quiet`（0 error）、`npm test`（全部通过），确认清理未引入回归。（tsc 0 错误、eslint 0 error/1044 warnings、vitest 91 用例全部通过）

# Task Dependencies

- Task 2 可与 Task 1 并行
- Task 3–5（冗余代码）相互独立，可并行
- Task 6–10（冗余文件）相互独立，可并行
- Task 11 依赖 Task 1–10 全部完成
