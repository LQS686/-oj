# DeepSeek 全面适配与 AI 调用质量优化 - 验证清单

## 阶段一：DeepSeek v4 字典与基础适配

### 任务1: 服务商字典更新
- [x] [lib/ai/providers.ts](file:///e:/桌面/oj/lib/ai/providers.ts) 中 deepseek slug 的 defaultModels 第一个为 v4
- [x] `deepseek-v4-flash` 与 `deepseek-v4-pro` 标注 `supportsThinkingParam: true`
- [x] 旧的 `deepseek-chat` / `deepseek-reasoner` 兼容别名已移除
- [x] `GET /api/ai/providers-presets?slug=deepseek` 返回 v4 在前

### 任务2: thinking 参数注入
- [x] [lib/ai/factory.ts](file:///e:/桌面/oj/lib/ai/factory.ts) 中 `buildChatParams` 检查 `supportsThinkingParam`
- [x] 当 supportsThinkingParam + reasoning_effort 有值时，向 OpenAI client 调用透传 `thinking` 与 `reasoning_effort`
- [x] 当 reasoning_effort 缺省时，默认注入 `"medium"`

### 任务3: thinking 响应解析
- [x] [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts) 中 `runThinkingStep` 优先读取 `reasoning_content`
- [x] 主生成阶段解析时同样支持 `reasoning_content` 兜底
- [x] 当 DeepSeek v4 思考模式下，thoughtProcess 包含完整 reasoning_content

## 阶段二：Prompt 工程

### 任务4: ParamGen
- [x] system prompt 包含"算法竞赛资深命题人"角色
- [x] user prompt 包含 10 条"质量门禁"（PROBLEM_QUALITY_GATES）
- [x] 按 difficulty 注入"算法典型 + 时空约束 + 标签库"（buildDifficultyContext）
- [x] 至少 1 个 Few-shot 范例（FEW_SHOT_EXAMPLE）
- [x] 思考步骤拆为 4 步（THINKING_STEP_FRAME）
- [x] temperature = 0.8

### 任务5: Clone
- [x] system prompt 明确"严格提取 + 不可编造"
- [x] user prompt 包含 10 条"质量门禁"（CLONE_QUALITY_GATES）
- [x] 至少 1 个 Few-shot 范例（"买苹果"）
- [x] temperature = 0.1

### 任务6: Similar
- [x] system prompt 明确"同算法 + 异背景"
- [x] user prompt 包含"质量门禁"（PROBLEM_QUALITY_GATES）
- [x] temperature = 0.7

### 任务7: TestDataGen
- [x] system prompt 重写
- [x] user prompt 强制 5 类边界（TEST_DATA_QUALITY_GATES）
- [x] hasSolution=false 时 output 必须是真实计算结果
- [x] temperature = 0.3

## 阶段三：调用链稳定性

### 任务8: 重试与退避
- [x] `callWithRetry` 函数存在于 [lib/ai/generator.ts](file:///e:/桌面/oj/lib/ai/generator.ts)
- [x] 429 / 5xx / 超时最多重试 2 次
- [x] 指数退避 800ms / 1600ms
- [x] 4xx 不重试直接抛
- [x] `runThinkingStep` 与主生成都用 callWithRetry 包装

### 任务9: JSON 解析失败重生成
- [x] `safeJsonParse` 失败时记录原始内容预览
- [x] 触发一次重生成（temperature: 0.2）
- [x] 重生成 user prompt 包含"上次响应无法解析"提示

## 阶段四：质量校验

### 任务10: 自检函数
- [x] [lib/ai/quality-check.ts](file:///e:/桌面/oj/lib/ai/quality-check.ts) 文件已新建
- [x] `checkGeneratedProblem(p)` 函数实现
- [x] 校验必填字段
- [x] 校验 samples.length ≥ 1
- [x] 校验 test_cases.length ≥ 3
- [x] `checkTestDataQuality` 函数实现

### 任务11: 自检集成
- [x] `generateProblems` 末尾对每条 problem 调用自检
- [x] 失败时 `logger.warn` 记录
- [x] `GenerationResult` 新增 `qualityIssues` 字段
- [x] 前端展示 chip 提示

## 阶段五：前端展示

### 任务12: AI 出题页
- [x] [app/admin/ai-generation/page.tsx](file:///e:/桌面/oj/app/admin/ai-generation/page.tsx) 模型下拉 option 含能力标签
- [x] 难度说明折叠区存在
- [x] 难度说明按 difficulty 动态显示算法典型
- [x] "附加要求"占位文案根据 difficulty 动态变化

### 任务13: 模型管理页
- [x] [app/admin/ai-models/page.tsx](file:///e:/桌面/oj/app/admin/ai-models/page.tsx) 模型卡片显示能力 chip
- [x] 思考模型 → `🧠 思考`
- [x] supportsThinkingParam → `🧠 思考参数`
- [x] maxTokens → `📏 ${maxTokens}`
- [x] params.thinking / params.reasoning_effort 非空 → `⚙️ v4 高级参数`

### 任务14: ModelSelector
- [x] [components/ai/ModelSelector.tsx](file:///e:/桌面/oj/components/ai/ModelSelector.tsx) 显示能力标识
- [x] 与 `/api/ai/models` 接口字段兼容（已扩展返回 providerSlug / maxTokens / temperature）

## 最终验证

### 代码质量
- [x] TypeScript 编译无错
- [x] ESLint 无错
- [x] 所有改动文件已 git add（用户决定提交时机）

### 功能验证（人工/集成测试）
- [ ] 在 dev 环境选择 deepseek-v4-pro 生成 1 道"普及"难度题
- [ ] 验证返回的 problem 包含完整字段
- [ ] 验证 test_cases ≥ 3 组
- [ ] 验证标程代码语法正确（C++/Python）
- [ ] 验证 thoughtProcess 包含 reasoning_content

### 边界验证
- [ ] 模拟 DeepSeek 返回 502 → 触发重试
- [ ] 模拟 DeepSeek 返回不合法 JSON → 触发重生成
- [ ] 模拟 problem 缺 test_cases → qualityIssues 中能看到提示

## 完成标准

所有自动验证项已通过，TypeScript 编译无错。功能/边界验证需在用户接入 DeepSeek API Key 后人工完成。
