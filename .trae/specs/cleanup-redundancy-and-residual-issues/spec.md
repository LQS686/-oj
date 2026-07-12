# 清理冗余代码与遗留问题 Spec

## Why

上一轮 `comprehensive-project-audit` 已完成安全/评测机/AI/后端/前端/配置六大维度审查，但明确遗留了 6 个 tsc 预存在错误与 3 个 eslint 预存在错误（涉及缺失模块、schema 不一致、Lucide API 变更等），且本轮审查未专门针对「冗余代码」与「冗余文件」做收敛。项目经多轮迭代后，已出现疑似重复模块（如 `lib/notification` 与 `lib/notifications`、`lib/mongodb.ts` 与 `lib/mongodb-direct.ts`、`components/solution/Markdown*` 与 `components/common/Markdown*`）、一次性脚本堆积（`scripts/migrate-*`、`scripts/test-*`、`scripts/probe-*` 等）、参考资源大目录（`参考资源/Project_LemonLime-0.3.6.2/`）等内容。需要一次聚焦的清理规范，在「不回滚用户改动、不扩大重构范围」前提下，收敛遗留缺陷、移除死代码与冗余文件，使 `tsc --noEmit` 与 `eslint` 达到零新增错误状态。

## What Changes

本次为「清理 + 收敛」型规范，分三类工作：

### 1. 遗留缺陷收敛（P0）
- 修复 6 个 tsc 预存在错误：
  - `app/api/admin/ai/solution/status/route.ts:31` — `logId` 为 `string | null` 的类型收窄
  - `app/api/admin/announcements/route.ts:29-30` — `body.title`/`body.content` 为 `string | undefined` 的类型收窄
  - `app/api/classes/[id]/notes/[noteId]/read/route.ts:8` — 引用不存在的 `@/lib/points/award` 模块（积分功能未实现）
  - `app/classes/page.tsx:575,577`、`components/training/TrainingCard.tsx:91` — Lucide React 新版移除图标 `title` prop
  - `lib/category/service.ts:13,20,22` — `prisma.category` 不存在（schema 仅有 `TrainingCategory`）
- 修复 3 个 eslint 预存在 errors：
  - `hooks/useSubmissionSocket.ts:183` — `react-hooks/refs`：渲染期访问 `socketRef.current`
  - `scripts/e2e-ai-generation.ts:19` — `@typescript-eslint/no-require-imports`
  - （第 3 项随上述 tsc 修复或脚本清理一并解决）

### 2. 冗余代码清理（P1）
- 移除未使用的导出、未引用的模块、不可达分支
- 合并/收敛重复逻辑（如重复的 Markdown 编辑器/渲染器、重复的鉴权服务、重复的错误处理模块）
- 收敛重复的类型定义与工具函数
- 清理未使用的环境变量引用、注释掉的死代码

### 3. 冗余文件清理（P1）
- 移除已失效的一次性迁移脚本（迁移已完成且无复用价值的 `scripts/migrate-*`）
- 移除已完成的诊断/探测脚本（`scripts/probe-*`、`scripts/diagnose-*`、`scripts/find-*`）
- 评估并移除过时的临时测试脚本（`scripts/test-*.ts`，非正式测试）
- 评估 `参考资源/Project_LemonLime-0.3.6.2/` 是否应移出仓库（参考用途，体积大）
- 清理根目录过时文档（`AI-SELF-TEST-REPORT.md`、`TEST_REPORT.md`、`test-discussion-api.sh` 等一次性产物）
- 清理 `logs/` 目录中被提交的日志文件（应 gitignore）
- 评估 `.trae/specs/` 中无 `checklist.md`/`tasks.md` 的不完整规范是否归档

## Impact

- Affected specs: `comprehensive-project-audit`（遗留项收敛）、`cleanup-ai-generation-deprecated`（AI 废弃清理延续）、`optimize-project-architecture`（架构收敛延续）
- Affected code:
  - 遗留缺陷涉及：`app/api/admin/ai/solution/status/route.ts`、`app/api/admin/announcements/route.ts`、`app/api/classes/[id]/notes/[noteId]/read/route.ts`、`app/classes/page.tsx`、`components/training/TrainingCard.tsx`、`lib/category/service.ts`、`hooks/useSubmissionSocket.ts`、`scripts/e2e-ai-generation.ts`
  - 冗余代码涉及：`lib/notification` vs `lib/notifications`、`lib/mongodb.ts` vs `lib/mongodb-direct.ts`、`lib/auth.ts` vs `lib/auth/index.ts`、`lib/api-response.ts` vs `lib/api/response.ts`、`components/solution/Markdown*` vs `components/common/Markdown*`、`services/authService.ts` vs `lib/auth/service.ts`、`lib/error-handler.ts` vs `lib/error-monitor.ts`、`lib/open-problem-tab.ts` vs `lib/problem-open.ts`、`lib/page-titles.ts` vs `lib/document-title.ts`、`lib/sensitive-words.ts` vs `lib/content-safety.ts`、`components/SetDocumentTitle.tsx` vs `components/DocumentTitleProvider.tsx`
  - 冗余文件涉及：`scripts/migrate-*.ts`、`scripts/test-*.ts`、`scripts/probe-*.ts`、`scripts/diagnose-*.ps1`、`scripts/find-*.ps1`、`参考资源/`、根目录一次性 `.md`/`.sh`、`logs/`

## ADDED Requirements

### Requirement: 零新增 tsc 错误

`npx tsc --noEmit` 执行结果为 0 错误（含上一轮遗留的 6 项预存在错误全部收敛）。

#### Scenario: 类型检查通过
- **WHEN** 运行 `npx tsc --noEmit`
- **THEN** 退出码为 0，无任何错误输出

### Requirement: 零新增 eslint error

`npx eslint --quiet` 执行结果为 0 error（含上一轮遗留的 3 项预存在 error 全部收敛）。

#### Scenario: lint 通过
- **WHEN** 运行 `npx eslint --quiet`
- **THEN** 退出码为 0，无 error（warn 项不增加）

### Requirement: 无未引用的死代码

项目内不存在未被任何地方引用的导出（函数/类/常量/类型）、不可达分支、被注释保留的死代码块。

#### Scenario: 死代码识别
- **WHEN** 对 `lib/`、`components/`、`app/api/` 做引用分析
- **THEN** 每个导出至少有一处真实引用，无孤儿导出

### Requirement: 无重复模块/文件

不存在功能重叠的重复模块（同名职责、重复实现）。

#### Scenario: 重复模块合并
- **WHEN** 发现两处模块职责重叠（如两个 Markdown 渲染器、两个鉴权服务）
- **THEN** 保留实现更完整的一处，另一处移除并更新所有引用

### Requirement: 无冗余文件

仓库内不存在已失效的一次性脚本、已过时的临时产物、不应纳入版本控制的日志/构建产物。

#### Scenario: 一次性脚本清理
- **WHEN** 某脚本仅用于一次性迁移且迁移已完成、无复用价值
- **THEN** 该脚本从仓库移除

#### Scenario: 日志文件清理
- **WHEN** `logs/` 目录下存在被提交的运行时日志
- **THEN** 日志文件从仓库移除并加入 `.gitignore`

### Requirement: 测试不回归

`npm test` 全部通过，清理未破坏既有测试覆盖。

#### Scenario: 测试通过
- **WHEN** 运行 `npm test`
- **THEN** 全部用例通过，无新增失败

## MODIFIED Requirements

无（本次为清理型规范，不修改既有功能需求定义）。

## REMOVED Requirements

### Requirement: 积分功能占位（`@/lib/points/award`）
**Reason**: 积分功能从未实现，`read/route.ts` 引用不存在的模块导致 tsc 错误，且无对应 schema/服务层。
**Migration**: 移除该路由中对 `@/lib/points/award` 的引用，笔记已读标记逻辑保留（若已有），积分奖励逻辑待后续独立规范实现。

### Requirement: `lib/category/service.ts` 独立 Category 模型访问
**Reason**: schema 中仅有 `TrainingCategory`，无独立 `Category` 模型，该服务访问 `prisma.category` 永远失败。
**Migration**: 若 `lib/category/service.ts` 无引用则移除；若有引用则改为使用 `prisma.trainingCategory` 或并入 `lib/training/`。

## 清理执行原则

1. **安全第一**：删除前必须验证引用情况，确认无引用方可移除；有引用时先更新引用再移除。
2. **最小改动**：清理以收敛为目标，不做无关重构、不改变既有功能行为。
3. **不回滚用户改动**：工作区可能存在与本规范无关的用户改动，保持原样。
4. **可验证闭环**：每类清理完成后运行 `npx tsc --noEmit`、`npx eslint --quiet`、`npm test` 验证无回归。
5. **保留历史**：`.trae/specs/` 下的规范文档为历史记录，不删除；仅归档明显不完整的草稿。
6. **参考资源审慎处理**：`参考资源/` 目录若仍有参考价值，保留但加入 `.gitignore` 或移出仓库根目录；不擅自删除用户资料。
