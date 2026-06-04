# 清理历史遗留模式（Clone/Similar）并修复 AI 出题功能 - 验收清单

## 阶段一：物理删除

- [ ] [lib/ai/prompts/text-based/clone.ts](file:///e:/桌面/oj/lib/ai/prompts/text-based/clone.ts) 已删除
- [ ] [lib/ai/prompts/text-based/similar.ts](file:///e:/桌面/oj/lib/ai/prompts/text-based/similar.ts) 已删除
- [ ] [lib/ai/prompts/text-based/](file:///e:/桌面/oj/lib/ai/prompts/text-based/) 整个目录已删除

## 阶段二：业务代码修改

- [ ] [lib/ai/prompts/core/types.ts](file:///e:/桌面/oj/lib/ai/prompts/core/types.ts) 移除 `GenerationMode.CLONE` / `GenerationMode.SIMILAR` / `CloneContext` / `SimilarContext`
- [ ] [lib/ai/prompts/core/quality-gates.ts](file:///e:/桌面/oj/lib/ai/prompts/core/quality-gates.ts) 移除 `TEXT_BASED_QUALITY_GATES`（如有）
- [ ] [lib/ai/prompts/loader.ts](file:///e:/桌面/oj/lib/ai/prompts/loader.ts) 移除 Clone/Similar 注入，简化 `validateContext`
- [ ] [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts) `mapToContext` 移除 `text_based` 分支；移除 `textInput` / `textModeType` / `optimizeDescription` 字段
- [ ] [app/api/admin/ai/generate/route.ts](file:///e:/桌面/oj/app/api/admin/ai/generate/route.ts) 移除 text-based 字段接收和校验
- [ ] [scripts/e2e-ai-generation.ts](file:///e:/桌面/oj/scripts/e2e-ai-generation.ts) 移除 Clone/Similar 用例

## 阶段三：编译验证

- [ ] `npx tsc --noEmit` 0 错误
- [ ] `grep -r "Clone\|Similar\|text_based\|textModeType\|optimizeDescription" lib/ app/ scripts/` 0 业务代码匹配

## 阶段四：4 类测试

### 解析器 [scripts/test-1-parser.ts](file:///e:/桌面/oj/scripts/test-1-parser.ts)
- [ ] 跑现有 [scripts/test-response-parser.ts](file:///e:/桌面/oj/scripts/test-response-parser.ts) 全过
- [ ] 新增截断检测：响应末尾 `"ou`（"ou 后无闭合）应抛 AI_PARSE_FAILED 且 hint 含"可能被截断"
- [ ] 新增空字符串 `""` 应抛 AI_PARSE_FAILED
- [ ] 新增 think 块包裹：`<think>...</think>{"title":"x"}` 应正确解析

### 字段归一化 [scripts/test-2-normalize.ts](file:///e:/桌面/oj/scripts/test-2-normalize.ts)
- [ ] 场景 A — 顶层数组 `[{...}, {...}]` → 2 道题
- [ ] 场景 B — 顶层 `{ problems: [...] }` → 2 道题
- [ ] 场景 C — 顶层单对象含 test_cases 数组 → 包成 [obj]（1 道题，不误识别）
- [ ] 场景 D — 顶层 null/undefined → 抛错
- [ ] camelCase → snake_case：`testCases` → `test_cases` / `timeLimit` → `time_limit` / `memoryLimit` → `memory_limit` / `solutionCpp` → `solution_cpp` / `solutionPython` → `solution_python`
- [ ] 兜底字段：缺 time_limit 填 1000、缺 memory_limit 填 128

### 前端页面 [scripts/test-3-static-page.ts](file:///e:/桌面/oj/scripts/test-3-static-page.ts)
- [ ] [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 含 12+ 个关键 UI 元素
  - 模型选择 / 主题输入 / 8 个 quick topic / 8 个难度 / 数量 1/2/3 / 附加要求 / 开始生成 / 3 步工作流 / 创建并自动发布 / 重新生成 / 生成记录 / 重试
- [ ] 不含已删除字符串：`仅生成题目描述` / `补全测试数据` / `skipTestCases` / `handleGenerateTestCases`
- [ ] 不含刚清理字符串：`text_based` / `textModeType` / `optimizeDescription` / `Clone` / `Similar`

### 端到端 [scripts/test-4-e2e.ts](file:///e:/桌面/oj/scripts/test-4-e2e.ts)
- [ ] ParamGen count=1，topic=['动态规划']，difficulty='普及' → 返回 1 道题
- [ ] ParamGen count=2，topic=['图论'] → **关键回归**：返回 2 道题，无重复 key 字段丢失
- [ ] TestData 无标程 → 返回 testCases 数组
- [ ] TestData 有标程 + targetProblemId → 后端用标程重算并替换题目测试数据
- [ ] ParamGen 异常路径：topic 为空 → 后端返回 400

## 阶段五：测试报告

- [ ] [scripts/AI-SELF-TEST-REPORT.md](file:///e:/桌面/oj/scripts/AI-SELF-TEST-REPORT.md) 列出清理文件清单
- [ ] 列出修改文件清单 + diff 摘要
- [ ] 4 类测试结果汇总
- [ ] 任何修复的 bug 记录

## 完成标准
所有勾选完成，TypeScript 0 错误，4 类测试全过，报告输出。
