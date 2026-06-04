# 清理历史遗留模式（Clone/Similar）并修复 AI 出题功能 - 任务清单

## 阶段一：物理删除 Clone / Similar 代码

### 任务1: 删除 text-based 目录
- [ ] 1.1: 删除 `lib/ai/prompts/text-based/clone.ts`
- [ ] 1.2: 删除 `lib/ai/prompts/text-based/similar.ts`
- [ ] 1.3: 删除 `lib/ai/prompts/text-based/` 整个空目录

### 任务2: 修改 `lib/ai/prompts/core/types.ts`
- [ ] 2.1: 移除 `GenerationMode.CLONE` 和 `GenerationMode.SIMILAR` 枚举值
- [ ] 2.2: 移除 `CloneContext` / `SimilarContext` / `TextBasedContext`（如有）接口
- [ ] 2.3: 简化 `PromptContext = ParamGenContext | TestDataGenContext`

### 任务3: 修改 `lib/ai/prompts/core/quality-gates.ts`
- [ ] 3.1: 移除 `TEXT_BASED_QUALITY_GATES`（如有）
- [ ] 3.2: 移除 text-based 相关导出

### 任务4: 修改 `lib/ai/prompts/loader.ts`
- [ ] 4.1: 移除 `ClonePromptGenerator` / `SimilarPromptGenerator` import
- [ ] 4.2: 移除 `this.generators.set(GenerationMode.CLONE, ...)` 和 `GenerationMode.SIMILAR`
- [ ] 4.3: 简化 `validateContext`：只校验 ParamGen 字段不混入（text-based 检查移除）

### 任务5: 修改 `lib/ai/generator.ts`
- [ ] 5.1: `mapToContext` 移除 `text_based` 分支
- [ ] 5.2: 移除 `GenerationMode.CLONE` 的 thoughtProcess 跳过逻辑（`if (thoughtProcess && context.mode !== GenerationMode.CLONE)` → 直接判断是否为空）
- [ ] 5.3: `GenerationParams` 接口移除 `textInput` / `textModeType` / `optimizeDescription` 字段
- [ ] 5.4: 验证 `text_based` 字面量在文件中 0 匹配

### 任务6: 修改 `app/api/admin/ai/generate/route.ts`
- [ ] 6.1: 解构参数中移除 `textInput` / `textModeType` / `optimizeDescription`
- [ ] 6.2: 移除 `if (mode === 'text_based')` 校验分支
- [ ] 6.3: 移除 retryParams 中的 text-based 字段
- [ ] 6.4: 移除 addAiJob 中的 text-based 字段

### 任务7: 修改 `scripts/e2e-ai-generation.ts`
- [ ] 7.1: 移除 Clone / Similar 测试用例
- [ ] 7.2: 保留 ParamGen count=1 + TestData 2 个用例

---

## 阶段二：编译验证

### 任务8: TypeScript 编译
- [ ] 8.1: `npx tsc --noEmit` 0 错误
- [ ] 8.2: 全文搜索：`grep -r "Clone\|Similar\|text_based\|textModeType\|optimizeDescription" lib/ app/ scripts/` 只在历史 commit message / spec 文档出现

---

## 阶段三：4 类测试

### 任务9: 解析器单测 `scripts/test-1-parser.ts`（可执行）
- [ ] 9.1: 跑现有 `scripts/test-response-parser.ts`
- [ ] 9.2: 新增截断检测用例：响应末尾 `"ou`（`"ou` 后无闭合）应抛 AI_PARSE_FAILED 且 hint 含"可能被截断"
- [ ] 9.3: 新增空字符串用例：`""` 应抛 AI_PARSE_FAILED
- [ ] 9.4: 新增 think 块包裹用例：`<think>...</think>{"title":"x"}` 应正确解析为 `{"title":"x"}`

### 任务10: 字段归一化单测 `scripts/test-2-normalize.ts`（可执行）
- [ ] 10.1: 场景 A — 顶层数组 `[{...}, {...}]` → 2 道题
- [ ] 10.2: 场景 B — 顶层 `{ problems: [...] }` → 2 道题
- [ ] 10.3: 场景 C — 顶层单对象含 test_cases 数组 → 包成 [obj]（1 道题，不误识别）
- [ ] 10.4: 场景 D — 顶层 null/undefined → 抛错
- [ ] 10.5: camelCase → snake_case：`testCases` → `test_cases` / `timeLimit` → `time_limit` / `memoryLimit` → `memory_limit` / `solutionCpp` → `solution_cpp` / `solutionPython` → `solution_python`
- [ ] 10.6: 兜底字段：缺 time_limit 填 1000、缺 memory_limit 填 128

### 任务11: 前端页面静态检查 `scripts/test-3-static-page.ts`（可执行）
- [ ] 11.1: 读 `app/admin/ai-generation/page.tsx`，断言含 12+ 个关键 UI 元素
  - 模型选择 / 主题输入 / 8 个 quick topic / 8 个难度 / 数量 1/2/3 / 附加要求 / 开始生成 / 3 步工作流 / 创建并自动发布 / 重新生成 / 生成记录 / 重试
- [ ] 11.2: 断言不含已删除字符串：`仅生成题目描述` / `补全测试数据` / `skipTestCases` / `handleGenerateTestCases`
- [ ] 11.3: 断言不含刚清理的字符串：`text_based` / `textModeType` / `optimizeDescription` / `Clone` / `Similar`

### 任务12: 端到端测试 `scripts/test-4-e2e.ts`（需 DEEPSEEK_API_KEY）
- [ ] 12.1: ParamGen count=1，topic=['动态规划']，difficulty='普及' → 返回 1 道题
- [ ] 12.2: ParamGen count=2，topic=['图论'] → **关键回归**：返回 2 道题，无重复 key 字段丢失
- [ ] 12.3: TestData 无标程 → 返回 testCases 数组
- [ ] 12.4: TestData 有标程 + targetProblemId → 后端用标程重算并替换题目测试数据
- [ ] 12.5: ParamGen 异常路径：topic 为空 → 后端返回 400

---

## 阶段四：测试报告

### 任务13: 输出 `scripts/AI-SELF-TEST-REPORT.md`
- [ ] 13.1: 列出清理的文件清单
- [ ] 13.2: 列出修改的文件清单 + diff 摘要
- [ ] 13.3: 4 类测试结果汇总
- [ ] 13.4: 任何修复的 bug 记录

---

## 任务依赖关系

```
阶段一: 任务1-7 (清理) → 阶段二: 任务8 (编译) → 阶段三: 任务9-12 (测试) → 阶段四: 任务13 (报告)
```

## 验证标准

### 清理
- [ ] 3 个文件物理删除（text-based 整个目录）
- [ ] 5 个文件修改（types / quality-gates / loader / generator / generate/route / e2e）
- [ ] `npx tsc --noEmit` 0 错误
- [ ] 全文搜索 Clone/Similar/text_based 0 业务代码匹配

### 功能
- [ ] ParamGen count=1/2/3 端到端通过
- [ ] TestData 有/无标程端到端通过
- [ ] TestData + targetProblemId 端到端通过
- [ ] ParamGen 异常路径返回 400

### 测试
- [ ] 4 类测试全部通过
- [ ] 报告输出完整

## 完成标准
所有 13 个任务勾选完成，TypeScript 0 错误，4 类测试全过，报告输出。
