# AI 出题流程简化规范

## Why

当前 AI 出题流程过度复杂化：

1. **流程碎片化**：最近刚加的"拆分生成"（先描述后测试数据）让用户需要点两次按钮、等两次轮询才能完成一题
2. **提示词松散**：[lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) 用"请生成 N 道题..."+ 字段定义的方式描述，AI 需要"理解后自己组织 JSON"，容易遗漏字段、改字段名
3. **JSON schema 与入库字段不对齐**：AI 生成的 `test_cases[].score` / `isSample` 字段有时缺失或命名错乱，前端要做兼容
4. **题库与生成 schema 分散**：题目创建 API [app/api/problems/route.ts](file:///e:/桌面/oj/app/api/problems/route.ts) 有一份 `requiredFields` 清单，AI prompt 又是另一份，没有统一来源
5. **JSON 解析失败率高**：上次截图里"AI 返回格式异常：JSON.parse failed"就是因为 prompt 没有给出可直接套用的 JSON 模板，AI 容易自由发挥

## What Changes

### 1. 单一 JSON Schema 模板（"填空式"）

**核心思路**：从 [app/api/problems/route.ts](file:///e:/桌面/oj/app/api/problems/route.ts#L207) 的 `requiredFields` 出发，定义一份"完整填空模板"，AI 直接按字段填值即可，不再需要"理解后构造"。

新模板（[lib/ai/prompts/paramgen/json-template.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/json-template.ts) 新建）：

```ts
// 与 Problem 创建 API 的字段一一对应
export const PROBLEM_JSON_TEMPLATE = `{
  "title": "<4-10字中文题目名>",
  "description": "<Markdown 格式详细题目描述>",
  "input": "<输入格式说明，中文>",
  "output": "<输出格式说明，中文>",
  "samples": [
    { "input": "<样例1输入>", "output": "<样例1输出>", "explanation": "<样例1解释>" },
    { "input": "<样例2输入>", "output": "<样例2输出>", "explanation": "<样例2解释>" }
  ],
  "hint": "<1-2句数据范围提示，不要直接透露算法>",
  "tags": ["<标签1>", "<标签2>"],
  "difficulty": "${difficulty}",
  "timeLimit": <1000|1500|2000|3000|5000>,
  "memoryLimit": <64|128|256|512|1024>,
  "testCases": [
    { "input": "<测试1输入>", "output": "<测试1输出>", "isSample": false, "score": <会被后端重新分配> }
    /* 必须 15 组，覆盖 10 个维度 */
  ],
  "solutionCpp": "<#include <bits/stdc++.h> 开头的 C++17 标程>",
  "solutionPython": "<Python3 标程>"
}`
```

### 2. 重写 ParamGen Prompt（"填空式"）

新 prompt 结构：
- **system**：`你是 JSON 填空机器人。下面是一个完整 JSON 模板，把所有 `<...>` 占位符替换成题目内容，其他字符原样保留。`
- **user**：`请根据主题「{{topic}}」、难度「{{difficulty}}」，按以下 JSON 模板生成 {{count}} 道题。**只输出一个 JSON 对象**，结构与模板 1:1 对应。\n\n{{PROBLEM_JSON_TEMPLATE}}`

### 3. 撤掉拆分生成（"一次到位"）

回退最近加的"split generation"功能：
- 删 `app/admin/ai-generation/page.tsx` 的 `skipTestCases` checkbox
- 删 `handleGenerateTestCases` 函数
- 删 `GenerationResult` 的 `solutionCpp`/`solutionPython`/`timeLimit`/`memoryLimit` 字段（无需前端缓存）
- 删后端 `skipTestCases` 参数
- 删 `lib/ai/prompts/core/types.ts` 的 `ParamGenContext.skipTestCases`
- 删 `lib/ai/generator.ts` 的 `skipTestCases` 透传

**理由**：用户明确说"流程过于繁杂，需要简化" + 拆分生成有 bug（需要传标程、API 校验等）。一次性生成 + 严格 JSON 模板才是正道。

### 4. JSON 解析器保持现状

[lib/ai/response-parser.ts](file:///e:/桌面/oj/lib/ai/response-parser.ts) 的极简版（剥 think 块 + JSON.parse）已能正确工作，**不动**。新 prompt 让 AI 严格按模板输出，本身就降低了 JSON 错误率。

### 5. 质量自检（生成后端）

[lib/ai/quality-check.ts](file:///e:/桌面/oj/lib/ai/quality-check.ts) 加 `checkJsonAgainstSchema(parsed, template)`：检查必填字段都存在、字段名拼写正确。前端把 schema 不匹配的情况标红显示。

## Impact

- Affected specs: `verify-ai-generation-end-to-end`（解析器层）、`deepseek-ai-call-optimization`（Prompt 层）
- Affected code:
  - [lib/ai/prompts/paramgen/json-template.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/json-template.ts) (新建)
  - [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts) (重写)
  - [lib/ai/prompts/core/types.ts](file:///e:/桌面/oj/lib/ai/prompts/core/types.ts) (移除 skipTestCases)
  - [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts) (移除 skipTestCases 透传)
  - [app/api/admin/ai/generate/route.ts](file:///e:/桌面/oj/app/api/admin/ai/generate/route.ts) (移除 skipTestCases)
  - [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) (移除拆分 UI、移除补全测试数据按钮、移除 handleGenerateTestCases)
  - [lib/ai/quality-check.ts](file:///e:/桌面/oj/lib/ai/quality-check.ts) (加 schema 校验)

## ADDED Requirements

### Requirement: 单一 JSON Schema 模板
The system SHALL 在 [lib/ai/prompts/paramgen/json-template.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/json-template.ts) 定义 `PROBLEM_JSON_TEMPLATE`，字段与 [app/api/problems/route.ts](file:///e:/桌面/oj/app/api/problems/route.ts) `requiredFields` 一一对应。

#### Scenario: 生成器读取 JSON 模板
- **WHEN** `ParamGenPromptGenerator.generate(context)` 被调用
- **THEN** user prompt 末尾必须包含 `PROBLEM_JSON_TEMPLATE` 完整字符串
- **AND** 模板中 `difficulty` 占位符被替换为 context.difficulty

### Requirement: 填空式 Prompt
The system SHALL 在 ParamGen system prompt 中明确指示 AI 是"JSON 填空机器人"，禁止 AI 自由发挥字段名或结构。

#### Scenario: AI 接收到填空式 prompt
- **WHEN** ParamGen 触发
- **THEN** system prompt 包含以下要点：
  - "你是 JSON 填空机器人"
  - "严格按模板字段输出，字段名拼写、大小写、嵌套层级必须 1:1 一致"
  - "禁止添加模板之外的字段，禁止删除模板中的字段"
  - "禁止在 JSON 之外添加任何解释、markdown 标记、think 块"

### Requirement: 测试点 15 组 + 10 维覆盖
The system SHALL 在 JSON 模板的 `testCases` 数组注释中显式列出 10 个维度的要求。

#### Scenario: AI 看到模板中的维度要求
- **WHEN** Prompt 拼装完成
- **THEN** `testCases` 字段上方有显式注释，要求覆盖 10 个维度中的至少 9 个：最小值情形 / 最大值压力 / 边界条件 / 特殊反例 / 随机典型 / 全相同 / 严格单调 / 极端比例 / 倒数边界 / 随机压力

### Requirement: 撤掉拆分生成
The system SHALL **不再提供**"先描述后测试数据"的拆分生成模式。

#### Scenario: 用户访问 AI 出题页
- **WHEN** 打开 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- **THEN** 不再出现"仅生成题目描述"checkbox
- **AND** 不再出现"补全测试数据"按钮
- **AND** 描述生成完成后直接展示完整结果（含 testCases）

### Requirement: API 移除 skipTestCases
The system SHALL 在 `POST /api/admin/ai/generate` 移除 `skipTestCases` 参数。

#### Scenario: 客户端不传 skipTestCases
- **WHEN** 前端调用 API
- **THEN** 请求体不含 `skipTestCases`
- **AND** 服务端 queue 中 params 不含 `skipTestCases`

### Requirement: schema 校验
The system SHALL 在 [lib/ai/quality-check.ts](file:///e:/桌面/oj/lib/ai/quality-check.ts) 新增 `checkJsonAgainstSchema(parsed, template)`，校验 AI 返回的 JSON 字段是否与模板一致。

#### Scenario: AI 返回缺 testCases
- **WHEN** parsed.problems[0] 没有 testCases 字段
- **THEN** `checkJsonAgainstSchema` 返回 `{ ok: false, reason: "testCases 字段缺失" }`
- **AND** 前端在结果区显示红色 chip 提示"字段缺失：testCases"

## MODIFIED Requirements

### Requirement: ParamGen Prompt 结构
**原行为**：用"请生成 N 道题... 【质量门禁】 ... 【字段定义】 ... 【输出格式】 ..."的方式描述，让 AI 自由组织 JSON。
**改为**：直接给一个完整 JSON 模板 + "把占位符替换成题目内容"的指令。

**Migration**：
- 老的"质量门禁"段落（"JSON 必须合法闭合"、"标程必须可编译"等）合并到 system prompt 的"JSON 填空机器人"角色定义中
- 老的【字段定义】段落废弃——字段定义直接来自 JSON 模板
- 老的【输出格式】示例段废弃——JSON 模板本身就是输出格式

### Requirement: 前端 AI 出题页 UI
**原行为**：默认勾选"仅生成题目描述" + 描述卡片下显示"补全测试数据"按钮
**改为**：用户点"开始生成"→ 等结果 → 一次性展示完整题目（含 testCases）+ "创建此题目"按钮

**Migration**：
- `skipTestCases` state 删除
- `handleGenerateTestCases` 函数删除
- `GenerationResult` 接口移除 `solutionCpp`/`solutionPython`/`timeLimit`/`memoryLimit` 字段
- 描述卡片下"补全测试数据"按钮 + 蓝色提示区删除

## REMOVED Requirements

### Requirement: 拆分生成模式
**Reason**：用户反馈流程过于繁杂，期望一次到位；拆分模式还引入了"补全测试数据"按钮的 bug（标程传递、API 校验问题）。
**Migration**：完全移除，不留开关、不留默认。

## 验证标准

- [ ] `PROBLEM_JSON_TEMPLATE` 在 [lib/ai/prompts/paramgen/json-template.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/json-template.ts) 定义，字段与 [app/api/problems/route.ts](file:///e:/桌面/oj/app/api/problems/route.ts) `requiredFields` 一致
- [ ] ParamGen system prompt 明确"JSON 填空机器人"角色
- [ ] ParamGen user prompt 末尾包含完整 `PROBLEM_JSON_TEMPLATE` 字符串
- [ ] `app/admin/ai-generation/page.tsx` 无 "仅生成题目描述" checkbox
- [ ] `app/admin/ai-generation/page.tsx` 无 "补全测试数据" 按钮
- [ ] `app/api/admin/ai/generate/route.ts` 无 `skipTestCases` 参数处理
- [ ] `lib/ai/prompts/core/types.ts` `ParamGenContext` 无 `skipTestCases` 字段
- [ ] `lib/ai/generator.ts` `GenerationParams` 无 `skipTestCases` 字段
- [ ] `lib/ai/quality-check.ts` 新增 `checkJsonAgainstSchema` 函数
- [ ] 端到端：用户点击"开始生成"→ 5-15 秒后一次性看到完整题目 + testCases
- [ ] 端到端：AI 返回的 JSON 字段名与模板 1:1 对应（无 `test_cases` 复数化、无 `solution_cpp` 替代 `solutionCpp`）

## 风险与回滚

- **风险**：新 prompt 第一次生成可能仍然有 JSON 错误（模型不熟悉模板）
- **缓解**：保留 `generator.ts` 内部的"解析失败时降温度重试 2 次"机制
- **回滚**：所有改动在 `lib/ai/prompts/paramgen/generator.ts` 一个文件，回滚只需 git revert 该文件
