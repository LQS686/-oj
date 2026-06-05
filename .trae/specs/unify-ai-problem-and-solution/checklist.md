# AI 题目 + 题解合并生成 - 验收清单

## 阶段一：JSON 模板 + 类型扩展

- [x] [lib/ai/prompts/paramgen/json-template.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/json-template.ts) `SINGLE_PROBLEM_TEMPLATE` 含 `solution_article` 字段
- [x] [json-template.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/json-template.ts) `REQUIRED_FIELDS` 含 `'solution_article'`
- [x] [lib/ai/prompts/core/types.ts](file:///e:/桌面/oj/lib/ai/prompts/core/types.ts) `GeneratedProblem` 含 `solution_article?: string` 字段

## 阶段二：Prompt 增补

- [x] [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) system prompt 增补"题解结构（5 段）"段落
- [x] system prompt 列出 5 个 H2 标题：思路分析 / 算法描述 / 复杂度分析 / 参考代码 / 关键点说明
- [x] system prompt 强调"参考代码"段用 ```cpp ... ``` 包裹 + 与 `solution_cpp` 内容一致
- [x] system prompt 提示字符串中可能含双引号 / 反引号 / 换行需转义

## 阶段三：queue.ts 改造

- [x] [lib/ai/queue.ts](file:///e:/桌面/oj/lib/ai/queue.ts) PARAM_GEN 路径**不**调用 `enqueueSolutionJob`（grep 验证 0 引用）
- [x] 删除 `import { enqueueSolutionJob }` 行
- [x] PARAM_GEN 路径在 `prisma.problem.create()` 成功后**直接**调 `prisma.solution.create()`
- [x] Solution 字段映射：
  - `content = problem.solution_article`
  - `code = problem.solution_cpp || problem.solution_python || null`
  - `codeLanguage = 'cpp' | 'python' | null`
  - `language = codeLanguage`（兼容字段）
  - `isAiGenerated = true`
  - `isOfficial = true`
  - `sourceType = 'AI_OFFICIAL'`
  - `authorId = job.data.userId`
  - `title = \`AI 标程题解 - ${newProblem.title}\``
- [x] 创建 Solution 前对同 `problemId + sourceType='AI_OFFICIAL'` 做 `deleteMany`
- [x] AI 缺 `solution_article` 时**不**创建 Solution，**不**阻断主流程，log warning
- [x] `AiGenerationLog.result.solutionStatus` 字段写入（'created' | 'missing' + problemNumber / solutionId）

## 阶段四：手动路径不受影响

- [x] [app/api/admin/problems/route.ts:279](file:///e:/桌面/oj/app/api/admin/problems/route.ts#L279) 仍调 `enqueueSolutionJob`（手动新建题目）
- [x] [app/api/admin/problems/[id]/regenerate-solution/route.ts:100](file:///e:/桌面/oj/app/api/admin/problems/%5Bid%5D/regenerate-solution/route.ts#L100) 仍调 `enqueueSolutionJob`（手动重新生成题解）
- [x] `enqueueSolutionJob` / `generateSolutionForProblem` 函数本身**保留**未删

## 阶段五：端到端验证

- [ ] ParamGen 完成 → DB 1 条 Problem + 1 条 Solution + 1 条 AiGenerationLog(COMPLETED)
- [ ] UI 触发 AI 出题 → "X 个任务进行中" 显示 1（不是 2）
- [ ] 题目详情页能看到 AI 题解（`isAiGenerated=true, isOfficial=true, sourceType='AI_OFFICIAL'`）
- [ ] 题解内容含 5 段 H2 标题（思路分析 / 算法描述 / 复杂度分析 / 参考代码 / 关键点说明）
- [ ] 题解"参考代码"段用 ```cpp ... ``` 包裹
- [ ] 同题重新生成时旧 AI_OFFICIAL Solution 被 deleteMany
- [ ] AI 缺 `solution_article` 时题目正常入库，Solution 不创建，log `solutionStatus='missing'`

## 代码质量

- [x] `npx tsc --noEmit` 0 错误
- [x] `enqueueSolutionJob` 引用在 queue.ts PARAM_GEN 路径 0 处（grep 验证）
- [x] `prisma.solution.create` 字段映射与 [lib/ai/solution-queue.ts](file:///e:/桌面/oj/lib/ai/solution-queue.ts) 一致
- [x] 日志字段命名与文件内其他 result 字段风格一致
- [x] `enqueueSolutionJob` 函数本身**保留**（手动路径仍可用）
