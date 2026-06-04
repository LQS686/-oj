# AI 题目自动验证 + 自动发布规范

## Why

当前 AI 出题工作流存在两个问题：

1. **AI 生成的测试数据可能与标程输出不一致**——AI 经常"幻觉"出错误的 output（行数不对、计算结果错、浮点精度错）。这些错误必须**真实运行**标程才能发现，AI 自己模拟运行没意义
2. **人工审核是瓶颈**——管理员要点"审核"按钮，发布流程拖慢，AI 出题沦为"半自动"
3. **标程没自动入库**——[app/api/admin/ai/save/route.ts](file:///e:/桌面/oj/app/api/admin/ai/save/route.ts#L115-L127) 把 solution_cpp/solution_python 写到了 `Solution` 表，但前提是用户得通过审核。审核被卡住 → 标程进不去

**目标**：AI 生成 → **真实运行标程**验证 → 通过 → **自动入库 + 自动公开**；不通过 → **AI 自动修正标程** → 再验证 → 通过则入库。**完全移除**人工审核环节，题目 100% 自动化流转。

## What Changes

### 1. 新增"AI 保存并自动验证"端点 `POST /api/admin/ai/save-and-verify`

**位置**：[app/api/admin/ai/save-and-verify/route.ts](file:///e:/桌面/oj/app/api/admin/ai/save-and-verify/route.ts)（新建）

**流程（带自动修正循环）**：
```
接收 problems[] + logId
  ↓
1. 复用 /api/admin/ai/save 的事务逻辑：建题目 + 写 testCase + 写 Solution
   （isPublic 暂时 false，留到验证通过再置 true）
  ↓
2. 调用 [lib/judge/judger.ts](file:///e:/桌面/oj/lib/judge/judger.ts) 的 executeJudge() 跑标程
   - code = problem.solution_cpp 或 solution_python
   - language = 'cpp' | 'python'
   - testCases = 该题目的 testCase 记录
   - timeLimit / memoryLimit = problem 推荐值
  ↓
3. 根据 JudgeResult 分流（最多 3 次自动修正循环）：
   - status === 'AC' && passedTests === totalTests：
     * 跳出循环
   - 其他状态（CE/RE/TLE/MLE/WA）：
     * 收集 failedTest 详情（expected vs actual / compile error / runtime error）
     * 调用 AI 重写 solution_cpp（prompt 附带失败信息 + failedTest）
     * 更新 problem.solution_cpp
     * 重新跑 executeJudge()
     * fixAttempts++，回到步骤 3
  ↓
4. 循环结束后：
   - 通过（任何一次 AC）：
     * UPDATE problem SET isPublic = true, aiStatus = 'VERIFIED'
     * UPDATE solution SET isOfficial = true, verified = true
     * 重新分配 testCase.score
     * 返回成功
   - 3 次修正仍失败：
     * 仍自动入库：isPublic = true, aiStatus = 'AUTO_PUBLISHED_WITH_FAILURES'
     * Solution 表中**不**写入 verified = true 的标程（避免向用户暴露错误的标程）
     * Solution 表可写一条 verified = false 的 "best-effort" 标程（带 verifiedAt = null + 警告）
     * judgeStatus / judgeMessage 记录最后一次失败
     * 返回部分成功（含警告）
```

**注意**：
- 真实运行标程 = 调用 [lib/judge/judger.ts](file:///e:/桌面/oj/lib/judge/judger.ts) 的 `executeJudge()`，**严禁**让 AI 重新生成或模拟
- 编译/执行错误要捕获（try/catch），不能阻塞主流程
- 评测在 5-30 秒内完成（取决于标程复杂度）
- 修正循环上限 3 次（避免无限循环 + 控制成本）

### 2. 修改前端 AI 出题页 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)

**当前**："创建此题目"按钮调用 `/api/admin/ai/save`，再跳到审核页

**改为**：
- 按钮文案："**创建并自动发布**"
- 点击后调用新端点 `/api/admin/ai/save-and-verify`
- 显示实时进度（含自动修正循环步骤）：
  ```
  1/6 正在保存题目到数据库...
  2/6 正在编译标程 (第 1 次)...
  3/6 正在运行测试数据 (1/15)...
  4/6 验证未通过 (1/3)：第 5 组 WA — AI 正在修正标程...
  5/6 正在重新验证 (第 2 次)...
  6/6 已自动公开到题库（修正后通过）✓
  ```
- **成功结果（一次通过）**：
  - 绿色 ✓ "已自动公开到题库（首次验证通过）"
  - "查看题目"按钮（链到 /problem/{id}）
  - "复制题目链接"按钮
  - 评测摘要：passed/total、耗时、内存
- **成功结果（修正后通过）**：
  - 黄色 ✓ "已自动公开到题库（AI 修正 {{attempts}} 次后通过）"
  - 同样的"查看题目" / "复制链接"按钮
  - 展开区显示修正历史："第 1 次 WA（修正）→ 第 2 次 AC"
- **部分成功（3 次修正仍失败）**：
  - 橙色 ⚠ "已自动入库，但标程未通过验证"
  - "查看题目"按钮
  - 警告："题目已公开，但标程未经验证，请在题解中手动添加正确代码"
  - 失败详情：judgeStatus + judgeMessage
- **完全失败**（AI 重写 API 故障）：
  - 红色 ✗ "自动发布失败"
  - "保留为草稿"按钮

### 3. 删除/瘦身"题库审核"页 [app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/)

**当前**：所有 AI 生成的题目停在 `isPublic = false`，管理员去 [app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/) 页面手动点"通过"或"拒绝"

**改为**（**完全移除 AI 题目的审核环节**）：
- **通过自动验证（含修正）的题目**直接 isPublic=true，**不进审核页**
- **3 次修正失败的题目**仍自动入库（isPublic=true, aiStatus='AUTO_PUBLISHED_WITH_FAILURES'），**不进审核页**
- 审核页**仅保留**用户手动提交的非 AI 题目（`isAiGenerated = false`）的原始审核流程
- 管理员**不再需要**对 AI 题目做任何审核操作
- AI 题目的"修正后入库"状态可在 [app/admin/problems/](file:///e:/桌面/oj/app/admin/problems/) 列表中查看"未验证标程"角标

### 4. 题目数据模型调整

`Problem` 模型加字段（Prisma schema + 迁移）：
```prisma
aiStatus       String?   // 'PENDING' | 'VERIFIED' | 'AUTO_PUBLISHED_WITH_FAILURES' | 'DRAFT' | 'FORCE_PUBLISHED'
verifiedAt     DateTime?
judgeStatus    String?   // 'AC' | 'WA' | 'CE' | 'RE' | 'TLE' | 'MLE'  (最后一次验证结果)
judgeMessage   String?   // 失败时的错误信息
fixAttempts    Int       @default(0)  // 自动修正循环执行次数
```

`Solution` 模型加字段：
```prisma
verified       Boolean   @default(false)  // 标程是否通过真实运行验证
verifiedAt     DateTime?
```

### 5. /api/admin/ai/save 路由降级为"草稿保存"

保留作为"创建草稿题目"功能（不验证、不公开），供 AI 生成失败时手动兜底。

## Impact

- Affected specs: `simplify-ai-generation-flow`（依赖此规范的结果）
- Affected code:
  - [app/api/admin/ai/save-and-verify/route.ts](file:///e:/桌面/oj/app/api/admin/ai/save-and-verify/route.ts) (新建)
  - [app/api/admin/ai/save/route.ts](file:///e:/桌面/oj/app/api/admin/ai/save/route.ts) (降级为草稿)
  - [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) (改 UI 流程)
  - [app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/) (调整审核列表过滤)
  - [prisma/schema.prisma](file:///e:/桌面/oj/prisma/schema.prisma) (加 aiStatus / verified / verifiedAt 字段)
  - [lib/judge/judger.ts](file:///e:/桌面/oj/lib/judge/judger.ts) (无改动，**复用**)

## ADDED Requirements

### Requirement: 自动验证 + 自动修正端点
The system SHALL 提供 `POST /api/admin/ai/save-and-verify` 端点，保存题目后立即调用 judger 跑标程，失败时自动调用 AI 修正标程后重新验证，最多重试 3 次。**不进行任何人工审核**——通过则公开，3 次失败仍自动公开但标记标程未验证。

#### Scenario: 标程一次通过所有测试
- **WHEN** AI 返回的 solution_cpp 编译并通过所有 testCase（status === 'AC'，passedTests === totalTests）
- **THEN** problem.isPublic = true, problem.aiStatus = 'VERIFIED', problem.fixAttempts = 0
- **AND** solution.verified = true, solution.verifiedAt = now()
- **AND** 返回 HTTP 200 { success: true, problemId, attempts: 0, judgeResult: { status: 'AC', passed: 15, total: 15 } }

#### Scenario: 标程第一次失败，AI 修正后通过
- **WHEN** solution_cpp 第一次 WA（不匹配），AI 重新生成后第二次 AC
- **THEN** problem.isPublic = true, problem.aiStatus = 'VERIFIED', problem.fixAttempts = 1
- **AND** solution.verified = true（基于最终修正版本）
- **AND** 返回 HTTP 200 { success: true, problemId, attempts: 1, judgeResult: { status: 'AC', passed: 15, total: 15 } }

#### Scenario: 标程 3 次修正仍失败
- **WHEN** solution_cpp 连续 3 次都未通过验证（CE/RE/TLE/MLE/WA 任意）
- **THEN** problem.isPublic = true, problem.aiStatus = 'AUTO_PUBLISHED_WITH_FAILURES', problem.fixAttempts = 3
- **AND** problem.judgeStatus / judgeMessage 记录最后一次失败
- **AND** solution.verified = **false**（不向用户暴露未验证标程）
- **AND** 返回 HTTP 200 { success: 'partial', problemId, attempts: 3, judgeResult: { status: 'WA', message: '...', failedTest: {...} }, warning: '标程未通过验证，已入库但未在题解中显示' }

#### Scenario: AI 重写 API 故障
- **WHEN** 标程第一次失败，但 AI 重新生成调用抛出异常
- **THEN** problem.isPublic = **false**, problem.aiStatus = 'DRAFT'
- **AND** 返回 HTTP 200 { success: false, error: 'AI 重写标程失败：' + error.message }

#### Scenario: 标程编译失败
- **WHEN** solution_cpp 编译失败（CE 状态）
- **THEN** 进入修正循环：调用 AI 重写（提示编译错误信息）
- **AND** 1 次 AC 则成功，3 次仍 CE 则按"3 次修正仍失败"处理

### Requirement: 真实运行标程
The system SHALL 调 [lib/judge/judger.ts](file:///e:/桌面/oj/lib/judge/judger.ts) 的 `executeJudge()` 跑标程，**严禁**用 AI 模拟运行结果或信任 AI 自我声明。

#### Scenario: 评测执行
- **WHEN** `/api/admin/ai/save-and-verify` 收到请求
- **THEN** 必须把 `code = problem.solution_cpp` + `language = 'cpp'` + `testCases = testCase records` 喂给 `executeJudge()`
- **AND** 评测在 30 秒内完成（超时则按 TLE 处理）
- **AND** JudgeResult 写到 problem.judgeStatus 字段

### Requirement: 失败时不入标程库
The system SHALL 在标程未通过验证时**不创建** `verified = true` 的 Solution 记录（防止用户看到错误的标程）。

#### Scenario: WA 时不暴露标程
- **WHEN** 3 次修正循环后仍 WA/RE/TLE/MLE
- **THEN** 该题目的 Solution 表里**没有** `verified = true` 的记录
- **AND** 前端"查看题解"页面**不展示**该题目的任何 AI 标程
- **AND** 管理员可在题库详情页手动添加 verified = true 的标程

### Requirement: 前端实时进度（含修正循环）
The system SHALL 在 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) "创建并自动发布"按钮点击后展示 6 步进度，包含修正循环步骤。

#### Scenario: 用户点击创建按钮
- **WHEN** 用户点"创建并自动发布"
- **THEN** 立刻显示进度条 + 6 个步骤
- **AND** 后端返回最终结果后跳到"成功" / "修正后成功" / "部分成功" / "完全失败" 4 种结果区

### Requirement: 成功结果可访问
The system SHALL 在验证通过后提供题目链接和题解链接。

#### Scenario: 显示成功结果（一次通过）
- **WHEN** save-and-verify 返回 success, attempts = 0
- **THEN** 展示绿色 ✓ "已自动公开到题库（首次验证通过）"
- **AND** "查看题目"按钮跳到 `/problem/{id}`
- **AND** "查看题解"按钮跳到 `/problem/{id}#solutions`（标程已自动入库）

#### Scenario: 显示成功结果（修正后通过）
- **WHEN** save-and-verify 返回 success, attempts > 0
- **THEN** 展示黄色 ✓ "已自动公开到题库（AI 修正 N 次后通过）"
- **AND** "查看题目" + "查看题解"按钮同上
- **AND** 展开区显示修正历史：第 1 次 WA → 第 2 次 AC

#### Scenario: 显示部分成功（3 次仍失败）
- **WHEN** save-and-verify 返回 partial
- **THEN** 展示橙色 ⚠ "已自动入库，但标程未通过验证"
- **AND** "查看题目"按钮（题目已公开）
- **AND** 警告文字："题目已公开，但标程未经验证，请在题解中手动添加正确代码"
- **AND** 失败详情：judgeStatus + judgeMessage

### Requirement: 审核页过滤（仅手动提交题目）
The system SHALL 让 [app/admin/problems/review/](file:///e:/桌面/oj/app/admin/problems/review/) 页面**不展示**任何 AI 生成的题目（无论 VERIFIED 或 AUTO_PUBLISHED_WITH_FAILURES），**仅展示** `isAiGenerated = false` 的手动提交题目。

#### Scenario: 审核页加载
- **WHEN** 管理员打开审核页
- **THEN** 只展示 `isAiGenerated = false` 的题目
- **AND** AI 题目（无论 isAiGenerated = true）**完全不在**列表里
- **AND** AI 题目状态可在 [app/admin/problems/](file:///e:/桌面/oj/app/admin/problems/) 列表通过 `aiStatus` 字段查看

#### Scenario: 管理员查看 AI 题目详情
- **WHEN** 管理员打开 AI 题目详情页
- **THEN** 显示 `aiStatus`、`judgeStatus`、`fixAttempts`、`verifiedAt` 等字段
- **AND** 如果 `aiStatus = 'AUTO_PUBLISHED_WITH_FAILURES'`，显示红色警告"标程未通过验证"
- **AND** 管理员可手动在题解板块添加 verified = true 的标程

## MODIFIED Requirements

### Requirement: AI Save 端点降级
**原行为**：[app/api/admin/ai/save/route.ts](file:///e:/桌面/oj/app/api/admin/ai/save/route.ts) 永久 `isPublic = false`，要求审核后才公开
**改为**：保留作为"草稿保存"，新建 save-and-verify 端点为默认路径

**Migration**：
- 前端默认调用 save-and-verify
- save 端点保留调用入口但显示"保存为草稿"按钮供高级用户使用

### Requirement: Solution 写入策略
**原行为**：只要 AI 返回了 solution_cpp/solution_python 就写入 Solution 表（isOfficial = true）
**改为**：只有验证通过（status === 'AC'）才写入 Solution 表，verified = true；未通过的题**不写** verified = true 的标程（避免用户看到错误代码）

**Migration**：
- 老数据：现有 Solution 记录保持不变（已发布的不动）
- 新数据：save-and-verify 端点接管

## REMOVED Requirements

### Requirement: 人工审核 AI 题目
**Reason**：用户明确要求"移除人工审核"——AI 题目 100% 自动化流转（通过则公开 / 3 次修正失败仍公开但不带 verified 标程）。
**Migration**：
- 审核页**不再展示** AI 生成的题目
- 管理员对 AI 题目的"修正"操作在题目详情页进行（手动添加 verified 标程）
- 用户手动提交的非 AI 题目**仍然走**原审核流程（保留在审核页）

### Requirement: 用户手动"重新生成标程"按钮
**Reason**：自动修正循环已在后端完成，前端无需用户介入。
**Migration**：
- 移除 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 的"重新生成标程"按钮
- 移除 [app/api/admin/ai/regenerate-solution/route.ts](file:///e:/桌面/oj/app/api/admin/ai/regenerate-solution/route.ts) 端点
- 修正逻辑内联到 save-and-verify 端点

### Requirement: 管理员"强制公开"按钮
**Reason**：AI 题目已 100% 自动化入库，管理员无需强制公开；如确需修复，管理员在题目详情页手动操作。
**Migration**：
- 移除审核页的"强制公开"按钮
- 管理员改为在题目详情页直接编辑 isPublic / aiStatus 字段

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 标程有 bug → 频繁 WA | 前端"重新生成标程"按钮可重试；AI 重写时附带失败信息 |
| 测试点 + 标程都错（两者对不上）→ 一直 WA | 验证失败 N 次后提示用户"测试数据可能也有问题，建议手动录入" |
| 评测队列拥塞 | 复用现有 [lib/judge/queue.ts](file:///e:/桌面/oj/lib/judge/queue.ts) 内存队列 |
| 安全：AI 标程可能含危险代码 | 评测前 [lib/judge/codeAnalyzer.ts](file:///e:/桌面/oj/lib/judge/codeAnalyzer.ts) 已有 `validateCodeSafety` 校验 |
| 公开后不可控（用户立即看到） | 问题已加 `isAiGenerated` + `verifiedAt` 字段，可追溯 |

## 验证标准

- [ ] `POST /api/admin/ai/save-and-verify` 端点存在且可调用
- [ ] 标程 AC → problem.isPublic = true，前端"查看题目"按钮可点开
- [ ] 标程 WA → problem.isPublic = false，aiStatus = 'VERIFICATION_FAILED'，前端展示红色错误
- [ ] 标程 CE → problem.isPublic = false，aiStatus = 'VERIFICATION_FAILED'，前端展示编译错误
- [ ] 审核页**不**展示 VERIFIED 题目
- [ ] 审核页**展示** VERIFICATION_FAILED 题目，管理员可"强制公开"
- [ ] 前端"创建并自动验证"按钮展示 4 步进度
- [ ] 成功结果显示"查看题解"按钮，题解页能看到 AI 标程
- [ ] 端到端：用户从 AI 出题 → 看到结果 → 点"创建并自动验证" → 30 秒内题目自动公开

## 验收清单

见 [checklist.md](file:///e:/桌面/oj/.trae/specs/auto-verify-and-publish-ai-problems/checklist.md)
