# DeepSeek 全面适配与 AI 调用质量优化 - 任务清单

## 任务总览

本规范围绕"AI 调用质量与 DeepSeek 适配"展开，分 6 个阶段，12 个任务。所有任务可按依赖关系串行或并行执行。

## 阶段一：DeepSeek v4 字典与基础适配

### 任务1: 更新服务商字典 [lib/ai/providers.ts](file:///e:/桌面/oj/lib/ai/providers.ts)
- [x] 1.1: 将 `deepseek-v4-flash` / `deepseek-v4-pro` 置顶
- [x] 1.2: 移除旧 `deepseek-chat` / `deepseek-reasoner` 兼容别名
- [x] 1.3: 标注 v4 模型 `supportsThinkingParam: true`
- [x] 1.4: 验证：`GET /api/ai/providers-presets` 返回的第一个 deepseek model 是 v4

### 任务2: thinking 参数注入 [lib/ai/factory.ts](file:///e:/桌面/oj/lib/ai/factory.ts)
- [x] 2.1: 在 `createAiClient` 中按 model 查找 `supportsThinkingParam`
- [x] 2.2: 若 `supportsThinkingParam` 且 `config.params.reasoning_effort` 有值，向 `chat.completions.create()` 调用透传 `thinking` 与 `reasoning_effort`
- [x] 2.3: 抽离 `buildChatParams` 统一处理（已存在，已扩展）

### 任务3: thinking 响应解析 [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)
- [x] 3.1: `runThinkingStep` 优先读取 `response.choices[0].message.reasoning_content`，回退 `content`
- [x] 3.2: 主生成调用阶段解析时同样支持 `reasoning_content` 兜底
- [x] 3.3: 单元测试：响应解析逻辑已就位（fixture 测试可后续补）

## 阶段二：Prompt 工程重写

### 任务4: ParamGen 提示词重写 [lib/ai/prompts/paramgen/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/paramgen/generator.ts)
- [x] 4.1: 重写 system prompt，加入"算法竞赛资深命题人"角色 + DeepSeek 友好的输出风格
- [x] 4.2: 重写 user prompt，加入"质量门禁"段落（10 条硬性规则，引用 PROBLEM_QUALITY_GATES）
- [x] 4.3: 按 difficulty 注入"算法典型 + 时空约束 + 标签库"（通过 buildDifficultyContext）
- [x] 4.4: 加入 1 个 Few-shot 范例（引用 FEW_SHOT_EXAMPLE）
- [x] 4.5: 思考步骤（thinking prompt）拆为 4 步（引用 THINKING_STEP_FRAME）
- [x] 4.6: temperature 改为 0.8

### 任务5: Clone 提示词重写 [lib/ai/prompts/text-based/clone.ts](file:///e:/桌面/oj/lib/ai/prompts/text-based/clone.ts)
- [x] 5.1: 重写 system prompt，明确"严格提取 + 不可编造"原则
- [x] 5.2: 重写 user prompt，加入"质量门禁"段落（引用 CLONE_QUALITY_GATES，10 条）
- [x] 5.3: 加入 1 个 Few-shot 范例（"买苹果"示例）
- [x] 5.4: temperature 保持 0.1

### 任务6: Similar 提示词重写 [lib/ai/prompts/text-based/similar.ts](file:///e:/桌面/oj/lib/ai/prompts/text-based/similar.ts)
- [x] 6.1: 重写 system prompt，明确"同算法 + 异背景"原则
- [x] 6.2: 重写 user prompt，加入"质量门禁"段落（引用 PROBLEM_QUALITY_GATES）
- [x] 6.3: temperature 保持 0.7

### 任务7: TestDataGen 提示词重写 [lib/ai/prompts/test-data/generator.ts](file:///e:/桌面/oj/lib/ai/prompts/test-data/generator.ts)
- [x] 7.1: 重写 system prompt
- [x] 7.2: 重写 user prompt，强制 5 类边界（引用 TEST_DATA_QUALITY_GATES）
- [x] 7.3: 当 `hasSolution=false` 时，强制要求 output 必须是真实计算结果
- [x] 7.4: temperature 改为 0.3

## 阶段三：调用链稳定性

### 任务8: 重试与退避 [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)
- [x] 8.1: 新建 `callWithRetry(fn, opts)`：对 429/5xx/超时最多重试 2 次，指数退避 800/1600ms
- [x] 8.2: 对 4xx 不重试，直接抛
- [x] 8.3: `runThinkingStep` 与主生成调用都用 `callWithRetry` 包装

### 任务9: JSON 解析失败重生成 [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)
- [x] 9.1: `safeJsonParse` 失败时，记录原始内容预览 + 触发一次重生成（temperature: 0.2）
- [x] 9.2: 重生成 user prompt 追加"上次响应无法解析为合法 JSON，请重新输出完整 JSON 对象"

### 任务10: 质量自检函数 [lib/ai/quality-check.ts](file:///e:/桌面/oj/lib/ai/quality-check.ts) (新建)
- [x] 10.1: 实现 `checkGeneratedProblem(p)`：校验必填字段、samples.length ≥ 1、test_cases.length ≥ 3
- [x] 10.2: 实现 `checkTestDataQuality(testCases, description)`：校验输入/输出格式合规（不包含中文字符、长度合理）
- [x] 10.3: 返回 `{ ok: boolean, reason?: string, severity?: 'warn' | 'error' }`

### 任务11: 集成自检到 generator [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)
- [x] 11.1: `generateProblems` 末尾对每条 problem 调用 `checkGeneratedProblem`
- [x] 11.2: 失败时 `logger.warn` 记录 problem 索引、原因
- [x] 11.3: 在 `GenerationResult` 中新增 `qualityIssues?: Array<{ problemIndex: number, reason: string }>` 字段
- [x] 11.4: 前端展示时用黄色 chip 提示（不阻塞导入）

### 任务12: AI 出题页模型下拉 + 难度说明 [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx)
- [x] 12.1: 模型下拉 option 末尾追加能力标签：`🧠 思考` / `📏 ${maxTokens} tokens` / `🌡️ T=${temperature}`
- [x] 12.2: 新增"难度说明"折叠区，展开后按 difficulty 显示算法典型与时空约束
- [x] 12.3: "生成数量"扩展为 1-3 道
- [x] 12.4: "附加要求"占位文案根据 difficulty 动态变化

### 任务13: 模型管理页能力徽章 [app/admin/ai-models/page.tsx](file:///e:/桌面/oj/app/admin/ai-models/page.tsx)
- [x] 13.1: 思考模型 → `🧠 思考` chip
- [x] 13.2: supportsThinkingParam → `🧠 思考参数` chip
- [x] 13.3: maxTokens → `📏 ${maxTokens}` chip
- [x] 13.4: params.thinking / params.reasoning_effort 非空 → `⚙️ v4 高级参数` chip

### 任务14: ModelSelector 组件能力 chip [components/ai/ModelSelector.tsx](file:///e:/桌面/oj/components/ai/ModelSelector.tsx)
- [x] 14.1: 用户端下拉中每个 model 显示 `📏 ${maxTokens}` 与 `🧠` 标识
- [x] 14.2: `/api/ai/models` 接口扩展返回 `providerSlug` / `maxTokens` / `temperature`

## 任务依赖关系

```
任务1 (字典)
  ├── 任务2 (thinking 注入)
  ├── 任务3 (thinking 解析)
  └── 任务14 (ModelSelector chip)

任务4-7 (Prompt 重写) 互相独立可并行

任务8 (重试) 独立
任务9 (JSON 重生成) 独立
任务10 (quality-check) 独立
  └── 任务11 (集成自检)

任务12-14 (前端) 独立可并行
```

## 验证标准

### DeepSeek v4 适配
- [ ] 服务商字典 v4 置顶，旧 ID 已移除
- [ ] thinking 参数正确注入
- [ ] reasoning_content 正确解析到 thought

### Prompt 质量
- [ ] 4 类生成器 user prompt 均包含"质量门禁"段落
- [ ] ParamGen / Similar 按 difficulty 注入算法典型
- [ ] Clone 加入至少 1 个 Few-shot 范例
- [ ] 温度全部按新规则动态化

### 调用链稳定性
- [ ] 429/5xx/超时自动重试
- [ ] JSON 失败触发重生成
- [ ] 自检问题在 `qualityIssues` 返回

### 前端
- [ ] AI 出题页模型下拉显示能力标签
- [ ] AI 出题页难度说明折叠区可见
- [ ] 模型管理页能力 chip 正确显示
- [ ] ModelSelector 组件能力标识正确

## 完成标准

所有任务勾选完成，所有验证项通过，TypeScript 编译无错。
