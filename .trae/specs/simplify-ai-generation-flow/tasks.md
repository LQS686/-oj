# AI 出题流程简化 - 任务清单

## 任务总览

按 4 个阶段推进：模板定义 → Prompt 重写 → 撤掉拆分 → schema 校验。每阶段完成后立即可手动验证。

## 阶段一：JSON 模板定义

### 任务1: 创建 PROBLEM_JSON_TEMPLATE [lib/ai/prompts/paramgen/json-template.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/json-template.ts) (新建)
- [ ] 1.1: 导出 `PROBLEM_JSON_TEMPLATE` 常量（字符串），字段与 [app/api/problems/route.ts](file:///e:/桌面/oj/app/api/problems/route.ts) `requiredFields` + `testCases` schema 完全一致
- [ ] 1.2: 字段顺序：title / description / input / output / samples / hint / tags / difficulty / timeLimit / memoryLimit / testCases / solutionCpp / solutionPython
- [ ] 1.3: `samples` 数组给 2 组占位，注明"至少 2 组"
- [ ] 1.4: `testCases` 数组上方加 10 维覆盖要求的注释（最小/最大/边界/特殊/随机/全相同/单调/极端比例/倒数/随机压力）
- [ ] 1.5: `difficulty` 占位符为 `${difficulty}` 形式，由调用方替换
- [ ] 1.6: 导出 `fillTemplate(difficulty, timeLimit, memoryLimit)` 辅助函数（把 difficulty / timeLimit / memoryLimit 三个变量嵌入模板）

## 阶段二：ParamGen Prompt 重写

### 任务2: 重写 ParamGen Prompt 为填空式 [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts)
- [ ] 2.1: system prompt 改为："你是 JSON 填空机器人。把所有 `<...>` 占位符替换成题目内容，其他字符原样保留。严格按模板字段输出，字段名拼写、大小写、嵌套层级必须 1:1 一致。禁止添加模板之外的字段，禁止删除模板中的字段。禁止在 JSON 之外添加任何解释、markdown 标记、think 块。"
- [ ] 2.2: user prompt 顶部：`请根据主题「{{topic}}」、难度「{{difficulty}}」，按以下 JSON 模板生成 {{count}} 道题。**只输出一个 JSON 对象**，结构与模板 1:1 对应。`
- [ ] 2.3: user prompt 末尾：直接拼接 `PROBLEM_JSON_TEMPLATE`（不重复列字段）
- [ ] 2.4: 删掉旧的【质量门禁】段（旧规则合并到 system prompt）
- [ ] 2.5: 删掉旧的【字段定义】段（已被 JSON 模板取代）
- [ ] 2.6: 删掉旧的【输出格式】示例段（JSON 模板本身就是示例）
- [ ] 2.7: temperature 保持 0.8

## 阶段三：撤掉拆分生成

### 任务3: 移除 skipTestCases 类型定义 [lib/ai/prompts/core/types.ts](file:///e:/桌面/oj/lib/ai/prompts/core/types.ts)
- [ ] 3.1: 移除 `ParamGenContext.skipTestCases` 字段

### 任务4: 移除 generator 中的 skipTestCases 透传 [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)
- [ ] 4.1: `GenerationParams` 移除 `skipTestCases?: boolean`
- [ ] 4.2: `mapToContext` 移除 `skipTestCases: !!params.skipTestCases`

### 任务5: 移除 API 端点 skipTestCases [app/api/admin/ai/generate/route.ts](file:///e:/桌面/oj/app/api/admin/ai/generate/route.ts)
- [ ] 5.1: 解构中移除 `skipTestCases`
- [ ] 5.2: `addAiJob` 的 params 移除 `skipTestCases: !!skipTestCases`

### 任务6: 移除前端拆分生成 UI [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [ ] 6.1: 移除 `useState` 中的 `skipTestCases`
- [ ] 6.2: 移除 `handleGenerate` 中 `skipTestCases` 字段
- [ ] 6.3: 移除 `handleGenerateTestCases` 整个函数
- [ ] 6.4: 移除 `GenerationResult` 接口的 `solutionCpp` / `solutionPython` / `timeLimit` / `memoryLimit` 字段
- [ ] 6.5: 移除 `LogResult.problems[0]` 接口的 `solution_cpp` / `solution_python` / `time_limit` / `memory_limit` 字段
- [ ] 6.6: 移除 `pollLogStatus` 中 result 提取的 `solutionCpp` 等字段
- [ ] 6.7: 移除"仅生成题目描述"checkbox + 提示文案
- [ ] 6.8: 移除结果卡片上"补全测试数据"按钮 + 蓝色提示区
- [ ] 6.9: 移除 `test_data` 模式合并逻辑（`setResult(prev => prev ? { ...prev, testCases: newTestCases } : ...)` 简化为纯替换）

## 阶段四：Schema 校验

### 任务7: 实现 schema 校验 [lib/ai/quality-check.ts](file:///e:/桌面/oj/lib/ai/quality-check.ts)
- [ ] 7.1: 导出 `PROBLEM_SCHEMA` 常量，列出所有必填字段名（按题目层）：`['title', 'description', 'input', 'output', 'samples', 'hint', 'tags', 'difficulty', 'timeLimit', 'memoryLimit', 'testCases', 'solutionCpp', 'solutionPython']`
- [ ] 7.2: 导出 `checkJsonAgainstSchema(parsedProblem): { ok: boolean, missing: string[] }`：遍历 `PROBLEM_SCHEMA`，对每个字段名检查 parsedProblem[field] 是否存在
- [ ] 7.3: 导出 `checkTestCasesAgainstSchema(parsedTestCases): { ok: boolean, missing: string[] }`：每个 testCase 必须有 `input` / `output` / `isSample` / `score`

### 任务8: 集成 schema 校验到 generator [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)
- [ ] 8.1: 解析完成后，对每条 `normalizedProblems[i]` 调用 `checkJsonAgainstSchema`
- [ ] 8.2: 失败时把缺失字段列表 push 到 `qualityIssues` 数组（不阻塞，前端红色 chip 提示）
- [ ] 8.3: `checkTestCasesAgainstSchema` 同样集成

### 任务9: 前端展示 schema 校验问题 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [ ] 9.1: 现有的"黄色自检提示"区扩展为支持"红色 schema 错误"——按 qualityIssues 中 reason 前缀区分颜色
- [ ] 9.2: schema 错误显示格式：`题目 #N 缺失字段：title, testCases`
- [ ] 9.3: 提示用户"重新生成"或"手动补全"

## 任务依赖关系

```
任务1 (JSON 模板)
  └── 任务2 (Prompt 重写)
任务3 → 任务4 → 任务5 → 任务6 (撤掉拆分，按顺序改)
任务7 (schema 校验)
  └── 任务8 (集成到 generator)
       └── 任务9 (前端展示)
```

任务1-2 与任务3-6 可**并行**；任务7-9 在前两组完成后开始。

## 验证标准

### 模板与 Prompt
- [ ] `PROBLEM_JSON_TEMPLATE` 与题目创建 API 字段一致
- [ ] ParamGen system prompt 含"JSON 填空机器人"字样
- [ ] ParamGen user prompt 末尾含完整 `PROBLEM_JSON_TEMPLATE`

### 拆分生成已撤掉
- [ ] 全文搜 `skipTestCases` 0 处
- [ ] 全文搜 "补全测试数据" 0 处
- [ ] 全文搜 "仅生成题目描述" 0 处
- [ ] 全文搜 `solutionCpp` 0 处
- [ ] 全文搜 `handleGenerateTestCases` 0 处

### Schema 校验
- [ ] AI 返回缺字段时，前端 result 卡片显示红色提示
- [ ] AI 返回完整字段时，前端 result 卡片不显示 schema 错误

### 代码质量
- [ ] `npx tsc --noEmit` 0 错误
- [ ] 端到端：用户输入主题 → 点"开始生成" → 5-15 秒后一次性看到完整题目 + testCases（无需再点"补全"）

## 完成标准

所有 9 个任务勾选完成，TypeScript 0 错误，AI 出题页只剩 1 个"开始生成"按钮。
