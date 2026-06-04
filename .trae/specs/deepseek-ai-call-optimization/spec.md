# DeepSeek 全面适配与 AI 调用质量优化规范

## Why

项目当前 AI 模块已能跑通基本流程，但**针对 DeepSeek（特别是 v4 系列）的特性适配**和**生成质量**仍有明显短板：

1. **提示词粗糙**：4 类生成器（ParamGen / Clone / Similar / TestDataGen）的 system prompt 缺少角色背景、风格约束与"质量门禁"，DeepSeek 在生成过程中常出现：
   - JSON 不闭合 / 字段缺失 / 中英混杂
   - 难度名错乱（"普及"档位却生成省选题）
   - 标程代码无法编译
   - 测试数据缺边界（如 N=1、最大值）
2. **DeepSeek v4 特性未充分利用**：
   - 默认采用旧 `deepseek-chat` 而非新的 `deepseek-v4-flash/pro`
   - `thinking` 参数与 `reasoning_effort` 未注入
   - thinking 模式的响应解析未做（DeepSeek 在 thinking 模式下思维链单独在 `reasoning_content` 字段，主流内容在 `content`，与 OpenAI 不一致）
   - Anthropic 兼容入口 `https://api.deepseek.com/anthropic` 未启用
3. **生成参数硬编码**：temperature 在 4 类生成器中写死（0.1/0.5/0.7/0.7），未根据模型能力与难度等级动态调整
4. **前端展示信息密度低**：AI 智能出题页只显示"模型名 + 服务商"，未显示模型能力标签（是否支持 thinking、是否长上下文、是否函数调用），用户难以做选择
5. **缺乏质量校验**：生成完成后没有自检环节（JSON 合法、必填字段、test_cases 数量、solution 语法），错误直接抛给用户
6. **缺少重试 / 退避**：DeepSeek 偶发 5xx 或超时，直接 500 返回给前端

## What Changes

### 1. Prompt 工程（核心）

针对 4 类生成器重写 system prompt + user prompt：

- **统一结构**：角色 → 任务 → 输入 → 质量门禁（必须满足的几条硬性约束）→ 输出格式（带示例）→ 反例
- **引入「质量门禁」**：每类生成器内置 5~8 条不可违反的硬性规则（如 test_cases 不少于 5 组、标程必须可编译、JSON 必须合法闭合等），让 DeepSeek 在生成过程中自我约束
- **按难度调整 Prompt 上下文**：把"普及/提高+/省选"对应的算法典型、时空约束、标签库显式枚举，避免模型凭直觉判断
- **加入 Few-shot 范例**：每个生成器在 user prompt 末尾给 1 个高质量标准答案示例（仅 ParamGen 与 Clone）
- **思考步骤（thinking prompt）结构化**：拆为 4 步——审题 → 抽象建模 → 边界与数据范围 → 时空与算法选型
- **TestDataGen 强化边界**：明确要求"小/最大/边界/特殊/反例"5 类必出，并要求"生成的 output 必须是题目描述中输出格式的真实值"（当 hasSolution=false 时）

### 2. DeepSeek v4 适配

- **模型字典** [lib/ai/providers.ts](file:///e:/桌面/oj/lib/ai/providers.ts)：
  - 调整 defaultModels 顺序，新 v4 模型置顶
  - `deepseek-v4-flash` 与 `deepseek-v4-pro` 标注 `supportsThinkingParam: true`
  - 移除旧 ID 兼容别名（已 2026/07/24 弃用），仅保留推荐 ID
- **thinking 参数注入** [lib/ai/factory.ts](file:///e:/桌面/oj/lib/ai/factory.ts)：
  - 当模型 `supportsThinkingParam: true` 时，向 `client.chat.completions.create()` 注入 `thinking: { type: "enabled" }` 与 `reasoning_effort`
  - 注入项来源：模型 `params.thinking` 与 `params.reasoning_effort`，缺省 `reasoning_effort: "medium"`
- **DeepSeek thinking 响应解析** [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)：
  - `runThinkingStep` 读取 `response.choices[0].message.reasoning_content` 拼到 thought
  - 主调用阶段解析时优先取 `content`，若无则降级到 `reasoning_content` 解析
- **Anthropic 兼容入口**：在 `createAiClient` 内部按 provider slug + `apiFormat === 'both'` 自动决定 baseUrl（保持现状即可，但确保 DeepSeek 字典中 anthropicBaseUrl 正确）

### 3. 动态温度 + 重试

- **温度动态化** [lib/ai/prompts/core/types.ts](file:///e:/桌面/oj/lib/ai/prompts/core/types.ts) + 各 generator：
  - ParamGen（创作题）→ 0.8
  - Clone（结构化提取）→ 0.1
  - Similar（仿写）→ 0.7
  - TestDataGen → 0.3
  - Thinking 步骤 → 由 config.thinkingLevel 决定（保持现状）
- **重试与退避** [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)：
  - 封装 `callWithRetry(fn, { maxRetries: 2, backoffMs: 800 })`
  - 仅对 429 / 5xx / 超时重试，4xx 立即抛
  - JSON 解析失败时尝试一次"重生成"（注入 `temperature: 0.2` 提高稳定性）

### 4. 质量校验（生成后自检）

- **校验函数** [lib/ai/quality-check.ts](file:///e:/桌面/oj/lib/ai/quality-check.ts) 新建：
  - `checkGeneratedProblem(p)`：必填字段、samples ≥ 1、test_cases ≥ 3、tags 非空、hint 非空
  - 失败时返回 `{ ok: false, reason }`，由 generator 决定重试或抛错
- **集成点** [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)：
  - `generateProblems` 末尾调用 check，对失败问题逐条日志记录（不阻塞，但前端提示）

### 5. 前端 AI 出题页改造 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)

- 模型下拉中每个 option 末尾追加能力标签：
  - `🧠 支持思考`（`supportsThinkingParam`）
  - `📏 ${maxTokens} tokens`
  - `🌡️ T=${temperature}`
- 难度下拉上方加"难度说明"折叠区，鼠标悬停显示该档位的算法典型、时空约束
- "生成数量"扩展为 1-3 道
- "附加要求"占位文案根据难度变化：
  - 入门/普及 → "例如：单源最短路径、DP 入门..."
  - 提高+/省选 → "例如：树链剖分、莫队、FFT..."

### 6. 模型管理页能力徽章 [app/admin/ai-models/page.tsx](file:///e:/桌面/oj/app/admin/ai-models/page.tsx)

- 模型卡片在服务商与 ID 标签后追加能力 chip：
  - `🧠 思考`（type === 'thinking' 或 supportsThinkingParam）
  - `📏 ${maxTokens} tokens`
  - 当 params 中有非空 `thinking`/`reasoning_effort` → 显示 `⚙️ v4 高级参数`

## Impact

- Affected specs: `add-ai-model-auto-discovery`（模型字典更新）、`fix-ai-provider-model-consistency`（过滤逻辑保持）
- Affected code:
  - [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts)（重写）
  - [lib/ai/prompts/text-based/clone.ts](file:///e:/桌面/oj/lib/ai/prompts/text-based/clone.ts)（重写）
  - [lib/ai/prompts/text-based/similar.ts](file:///e:/桌面/oj/lib/ai/prompts/text-based/similar.ts)（重写）
  - [lib/ai/prompts/test-data/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/test-data/generator.ts)（重写）
  - [lib/ai/providers.ts](file:///e:/桌面/oj/lib/ai/providers.ts)（v4 优先 + 移除旧 ID 兼容）
  - [lib/ai/factory.ts](file:///e:/桌面/oj/lib/ai/factory.ts)（thinking 注入）
  - [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)（thinking 解析 + 重试 + 自检）
  - [lib/ai/quality-check.ts](file:///e:/桌面/oj/lib/ai/quality-check.ts)（新建）
  - [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)（前端展示）
  - [app/admin/ai-models/page.tsx](file:///e:/桌面/oj/app/admin/ai-models/page.tsx)（能力徽章）
  - [components/ai/ModelSelector.tsx](file:///e:/桌面/oj/components/ai/ModelSelector.tsx)（能力 chip）

## ADDED Requirements

### Requirement: DeepSeek v4 优先
The system SHALL 在服务商字典中以 `deepseek-v4-flash` / `deepseek-v4-pro` 置顶，移除 2026/07/24 弃用的旧 ID 兼容别名。

#### Scenario: 用户在服务商字典中查看 DeepSeek 默认模型
- **WHEN** 通过 `GET /api/ai/providers-presets?slug=deepseek` 获取预设
- **THEN** 返回的第一个 default model 应是 `deepseek-v4-flash`
- **AND** 返回的模型元数据包含 `supportsThinkingParam: true`

### Requirement: DeepSeek thinking 模式自动启用
The system SHALL 在调用 `deepseek-v4-flash` / `deepseek-v4-pro` 且模型 `params.reasoning_effort` 不为空时，向 `client.chat.completions.create()` 注入：
```
thinking: { type: "enabled" }
reasoning_effort: <params.reasoning_effort>
```

#### Scenario: 用户选择 deepseek-v4-pro 并设置 reasoning_effort="high"
- **WHEN** 前端调用 `/api/admin/ai/generate` 触发生成
- **THEN** 服务端 OpenAI client 收到的请求体应包含 `thinking.type="enabled"` 与 `reasoning_effort="high"`
- **AND** 响应中 `reasoning_content` 字段被提取到 `thought` 字段返回给前端

### Requirement: DeepSeek thinking 响应解析
The system SHALL 在 `runThinkingStep` 优先读取 `response.choices[0].message.reasoning_content`，回退到 `content`。

#### Scenario: DeepSeek v4 thinking 模型返回 reasoning_content
- **WHEN** 思考步骤完成
- **THEN** `thoughtProcess` 变量包含 `reasoning_content` 的完整文本
- **Verification**: 单元测试断言 `reasoning_content` 被正确提取

### Requirement: 4 类生成器质量门禁
The system SHALL 在 4 类生成器（ParamGen / Clone / Similar / TestDataGen）的 user prompt 末尾追加"质量门禁"段落，列出该模式必须满足的 5~8 条硬性规则。

#### Scenario: 用户触发 ParamGen 模式生成
- **WHEN** 服务端调用 DeepSeek
- **THEN** user prompt 必须包含 8 条"质量门禁"，包括：
  - test_cases 不少于 5 组
  - 至少 1 组边界（n=1 / max）
  - C++ 标程必须包含 `#include <bits/stdc++.h>`
  - JSON 必须合法闭合、不带 markdown 标记
  - difficulty 字段必须与用户传入严格相等
  - samples 不少于 2 组

### Requirement: 难度档位算法典型枚举
The system SHALL 在 ParamGen / Similar 模式的 user prompt 中按 difficulty 注入对应的"算法典型 + 时空约束 + 标签库"。

#### Scenario: 用户选择"提高+"难度
- **WHEN** ParamGen 触发
- **THEN** user prompt 必须显式列出"提高+"对应的算法典型（树链剖分、莫队、FFT、SAM、生成函数等）与标签库
- **AND** 显式给出该档位的 time_limit 范围（建议 2000-4000ms）与 memory_limit（256-512MB）

### Requirement: 动态温度
The system SHALL 根据生成模式动态选择 temperature，不再硬编码。

#### Scenario: 不同模式调用 DeepSeek
- **WHEN** ParamGen 调用 → temperature = 0.8
- **AND** Clone 调用 → temperature = 0.1
- **AND** Similar 调用 → temperature = 0.7
- **AND** TestDataGen 调用 → temperature = 0.3

### Requirement: 重试与退避
The system SHALL 在 DeepSeek 调用层封装 `callWithRetry`，对 429 / 5xx / 超时最多重试 2 次（指数退避 800ms / 1600ms）。

#### Scenario: DeepSeek 首次调用返回 502
- **WHEN** `callWithRetry` 收到 502
- **THEN** 等待 800ms 后重试
- **AND** 若仍 502 → 再等 1600ms 重试
- **AND** 若仍失败 → 抛 502 给上层

### Requirement: JSON 解析失败重生成
The system SHALL 在 `safeJsonParse` 全部 fallback 失败后，以 `temperature: 0.2` 重试 1 次。

#### Scenario: DeepSeek 首次返回不合法 JSON
- **WHEN** `safeJsonParse` 抛出
- **THEN** 触发重生成（temperature 降到 0.2，user prompt 追加"上次响应无法解析为合法 JSON，请重新输出"）
- **AND** 仍失败 → 抛 500 给上层，附原始内容预览

### Requirement: 生成质量自检
The system SHALL 在 `generateProblems` 返回前对每条 problem 调用 `checkGeneratedProblem`：
- 必填字段（title / description / input / output / difficulty / tags / hint / samples / test_cases / time_limit / memory_limit / solution_cpp / solution_python）
- samples.length ≥ 1
- test_cases.length ≥ 3

#### Scenario: 生成的 problem 缺 test_cases
- **WHEN** `checkGeneratedProblem` 返回 `{ ok: false, reason: "test_cases 不足 3 组" }`
- **THEN** 服务端 logger.warn 记录问题 id 与 reason
- **AND** 仍将该 problem 返回给前端（不阻塞），前端在结果区显示黄色提示

### Requirement: AI 出题页模型能力展示
The system SHALL 在 `app/admin/ai-generation/page.tsx` 的模型下拉中，每个 option 末尾追加能力标签：`🧠 支持思考` / `📏 ${maxTokens} tokens` / `🌡️ T=${temperature}`。

#### Scenario: 模型列表中包含 deepseek-v4-pro
- **WHEN** 用户展开下拉
- **THEN** 每个 option 文案如：`DeepSeek V4 Pro (DeepSeek) - 生成模型 🧠 支持思考 📏 8000 tokens 🌡️ T=0.8`

### Requirement: 难度档位说明
The system SHALL 在 AI 出题页"目标难度"下拉上方加折叠区，鼠标悬停或点击展开时显示该档位的算法典型与时空约束。

#### Scenario: 用户展开"提高"难度说明
- **WHEN** 鼠标悬停
- **THEN** 显示"提高：图论（最短路、最小生成树、拓扑排序）、高级 DP（区间 DP、状压 DP）、二叉堆、单调栈/队列、ST 表，时间 1500-3000ms，内存 256-512MB"

### Requirement: 模型管理页能力徽章
The system SHALL 在 `app/admin/ai-models/page.tsx` 的模型卡片上追加能力 chip：
- 思考模型 → `🧠 思考`（紫色）
- supportsThinkingParam → `🧠 思考参数`（紫色）
- maxTokens 标签（蓝色）
- params 中有非空 thinking/reasoning_effort → `⚙️ v4 高级参数`（蓝色）

#### Scenario: 模型卡片展示
- **WHEN** 用户访问 `/admin/ai-models`
- **THEN** 每张卡片在服务商与 ID 之后显示上述 chip

## MODIFIED Requirements

### Requirement: 旧 DeepSeek ID 兼容
**原行为**：保留 `deepseek-chat` / `deepseek-reasoner` 旧 ID 作为兼容别名
**改为**：完全移除，2026/07/24 弃用后不再维护

**Migration**：
- 数据库中若仍有 `model='deepseek-chat'/'deepseek-reasoner'` 的 AiModel 记录，需用户手动迁移到 `deepseek-v4-flash`/`deepseek-v4-pro`
- 清理脚本 `scripts/cleanup-orphan-ai-models.ts` 不再处理此类记录（因已经验证通过 --force 清空）

## REMOVED Requirements

无

## 验证标准

- [ ] 4 个生成器的 prompt 经过重写，包含"质量门禁"段落
- [ ] DeepSeek v4 模型 ID 在 `lib/ai/providers.ts` 中置顶
- [ ] `createAiClient` 调用层注入 `thinking` 与 `reasoning_effort`
- [ ] `runThinkingStep` 正确读取 `reasoning_content`
- [ ] `callWithRetry` 处理 429/5xx/超时
- [ ] `checkGeneratedProblem` 自检函数存在并被调用
- [ ] 前端模型下拉展示能力 chip
- [ ] 前端难度下拉显示说明
- [ ] 模型管理页能力徽章显示

## 风险与回滚

- **风险**：新 prompt 可能在某些难度档位下生成更"保守"的题目（因约束更严）
- **回滚**：所有改动在独立文件，回滚只需 git revert
