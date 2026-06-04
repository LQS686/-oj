# 清理历史遗留模式（Clone/Similar）并修复 AI 出题功能

## Why
用户明确要求：
- 生成模式应该只有 **AI 出题**（ParamGen）和 **AI 生成测试数据**（TestData）
- 其它（Clone / Similar 等）属于历史遗留，必须清理
- 重点清理**提示词相关**和**逻辑流程方面**的代码
- 同时要**修复功能**，确保剩余 2 个模式完全可跑通、无遗留 bug

最近日志暴露的 4 个核心 bug（JSON 截断、字段名错位、test_cases=0、重复 key、problems 提取）已在上一轮修过，本 spec 重点：
1. 物理删除 Clone / Similar 全部代码路径（prompts / types / loader / generator / API / scripts）
2. 验证剩下的 2 个模式（ParamGen + TestData）端到端可跑通
3. 修复 ParamGen 流程中的遗留小问题（如 max_tokens 已修，再确认一次）

## What Changes
- [删除] `lib/ai/prompts/text-based/clone.ts` — Clone 模式提示词
- [删除] `lib/ai/prompts/text-based/similar.ts` — Similar 模式提示词
- [删除] `lib/ai/prompts/text-based/` 整个目录
- [修改] `lib/ai/prompts/core/types.ts` — 移除 `GenerationMode.CLONE` / `GenerationMode.SIMILAR` / `CloneContext` / `SimilarContext` / `TextBasedContext`；简化 `PromptContext` 联合类型为 `ParamGenContext | TestDataGenContext`
- [修改] `lib/ai/prompts/core/quality-gates.ts` — 移除 `TEXT_BASED_QUALITY_GATES` 相关（如有）
- [修改] `lib/ai/prompts/loader.ts` — 移除 Clone / Similar 注入，移除 `validateContext` 中的 text-based 检查
- [修改] `lib/ai/generator.ts` — `mapToContext` 移除 `text_based` 分支；移除 `GenerationMode.CLONE` 的 thoughtProcess 跳过逻辑；移除 `textInput` / `textModeType` / `optimizeDescription` 字段定义
- [修改] `app/api/admin/ai/generate/route.ts` — 移除 `textInput` / `textModeType` / `optimizeDescription` 字段接收；移除 `mode === 'text_based'` 校验分支
- [修改] `scripts/e2e-ai-generation.ts` — 移除 Clone / Similar 测试用例
- [新增] `scripts/test-1-parser.ts` — 解析器单元测试（必跑）
- [新增] `scripts/test-2-normalize.ts` — 字段归一化单元测试（必跑）
- [新增] `scripts/test-3-static-page.ts` — 前端页面静态检查（必跑）
- [新增] `scripts/test-4-e2e.ts` — 2 个模式端到端（需 DEEPSEEK_API_KEY）
- [新增] `scripts/AI-SELF-TEST-REPORT.md` — 测试报告

## Impact
- Affected specs: simplify-ai-generation-flow, auto-verify-and-publish-ai-problems, verify-ai-generation-end-to-end
- Affected code:
  - 物理删除 3 个文件：`lib/ai/prompts/text-based/{clone.ts, similar.ts, dir}`
  - 修改 5 个文件：types.ts / quality-gates.ts / loader.ts / generator.ts / generate/route.ts / e2e-ai-generation.ts
  - 新增 5 个文件：4 个测试脚本 + 1 个测试报告

## ADDED Requirements

### Requirement: 必须物理删除 Clone / Similar 全部代码路径
The system SHALL 物理删除所有 Clone / Similar 模式相关代码，包括但不限于：
- 提示词文件
- 枚举值
- 上下文类型
- 加载器注册
- 生成器分支
- API 接收字段
- 验证逻辑
- e2e 测试用例

#### Scenario: 全文搜索无残留
- **WHEN** 跑 `grep -r "Clone\|Similar\|text_based\|textModeType\|optimizeDescription" lib/ app/ scripts/`
- **THEN** 只在历史记录、注释、spec 文档中出现，业务代码 0 匹配

#### Scenario: import 不存在
- **WHEN** 编译
- **THEN** 0 错误（无悬空 import）

### Requirement: ParamGen（AI 出题）端到端可跑通
The system SHALL ParamGen 模式端到端可跑通：
- count=1：返回 1 道题
- count=2：返回 2 道题，**不出现重复 key 字段丢失**
- count=3：返回 3 道题
- 必填字段非空
- test_cases >= 10
- samples >= 2
- tags.length >= 2
- time_limit / memory_limit 为整数

#### Scenario: ParamGen count=1
- **WHEN** 提交 ParamGen，count=1
- **THEN** 返回 1 道题对象，所有必填字段非空

#### Scenario: ParamGen count=2
- **WHEN** 提交 ParamGen，count=2
- **THEN** 返回 2 道题，每道题都满足必填字段要求（不出现 count=1 时的字段缺失 bug）

#### Scenario: ParamGen 异常路径
- **WHEN** 提交 ParamGen，topic 为空
- **THEN** 后端返回 400 错误，不静默继续

### Requirement: TestData（AI 生成测试数据）端到端可跑通
The system SHALL TestData 模式端到端可跑通：
- 给定 title + description + inputDescription + outputDescription
- 可选：solutionCode + solutionLanguage
- 返回 testCases 数组，每项含 input / output
- 有标程时，output 必须是标程真实运行结果

#### Scenario: TestData 无标程
- **WHEN** 提交 TestData，不带 solutionCode
- **THEN** 返回 testCases 数组，AI 给出的 output 必须是真实计算结果

#### Scenario: TestData 有标程
- **WHEN** 提交 TestData，带 solutionCode
- **THEN** 后端用标程重算 output，覆盖 AI 给出的 output

#### Scenario: TestData 给定 targetProblemId
- **WHEN** 提交 TestData，指定 targetProblemId
- **THEN** testCases 替换该题目的旧测试数据，题目状态变 AI_ASSISTED

### Requirement: 4 类测试必须全部通过
The system SHALL 由 AI 亲自跑 4 类测试，输出报告：
1. 解析器单测（已有 + 新增截断检测）
2. 字段归一化单测（problems 提取 + camelCase→snake_case）
3. 前端页面静态检查（含 12 个关键 UI 元素 + 0 个已删除字符串）
4. 端到端 2 个模式（ParamGen count=1/count=2 + TestData 有/无标程）

#### Scenario: 测试全部通过
- **WHEN** 跑 4 类测试
- **THEN** 报告记录所有测试结果，无失败

#### Scenario: 测试发现 bug
- **WHEN** 任何测试失败
- **THEN** AI 立刻定位 + 修复 + 重跑 + 报告记录

## MODIFIED Requirements
无（仅清理 + 测试）

## REMOVED Requirements

### Requirement: Clone 模式（从原题文本提取）
**Reason**: 历史遗留，用户已明确不需要
**Migration**: 无迁移需要

### Requirement: Similar 模式（同算法异背景）
**Reason**: 历史遗留，用户已明确不需要
**Migration**: 无迁移需要
