# DSOJ 标准题包模板

本文件夹是 DSOJ 标准题包格式的完整模板，可作为爬虫批量采集题目的输出目录结构参考。

## 目录结构

```
dsoj-pack.zip
├── pack.yaml              # 包元信息（可选，推荐）
├── README.md              # 格式说明（可选）
├── problems/
│   └── <slug>/
│       ├── problem.yaml   # 题目元信息（必需）
│       ├── description.md # 题目描述（markdown，必需）
│       ├── background.md # 题目背景（markdown，可选）
│       ├── input.md       # 输入格式（可选）
│       ├── output.md      # 输出格式（可选）
│       ├── hint.md        # 说明/提示（可选，含数据范围、样例解释）
│       ├── samples/       # 展示样例（可选，1.in/1.out）
│       ├── testcases/     # 完整测试点（必需，1.in/1.out）
│       ├── config.yaml    # 测试配置覆盖（可选）
│       └── std.cpp        # 标准代码（可选）
```

## 文件说明

### pack.yaml（包元信息，可选）

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| format | string | 是 | 固定值 `dsoj-pack`，用于格式识别 |
| version | string | 是 | 格式版本，当前为 `1.0` |
| created_at | string | 否 | 打包时间（ISO 8601） |
| source | string | 否 | 数据来源（如"洛谷批量采集"） |
| description | string | 否 | 包说明 |
| problem_count | number | 否 | 题目数量（仅用于展示） |

### problem.yaml（题目元信息，必需）

| 字段 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| title | string | 是 | - | 题目标题（1-200 字符） |
| problem_number | string | 否 | 自动分配 | 题号（如 P1001，1-50 字符） |
| difficulty | string | 是 | "入门" | 难度，8 档之一（见下表） |
| tags | string[] | 否 | [] | 标签列表 |
| source | string | 否 | "DSOJ Pack" | 题目来源 |
| visibility | string | 否 | public | 可见性（public/private/contest） |
| time_limit | number | 是 | 1000 | 时间限制（毫秒，1-30000） |
| memory_limit | number | 是 | 128 | 内存限制（MB，1-1024） |
| comparison_mode | string | 否 | default | 比较模式（default/strict/ignore-spaces/real-number） |
| real_precision | number | 否 | 3 | 实数比较精度（0-12，仅 real-number 模式生效） |

**难度 8 档**（对齐洛谷标准，详见 `lib/constants.ts`）：

| 值 | 颜色 | 说明 |
|----|------|------|
| 入门 | 红 | 入门级 |
| 普及- | 橙 | 普及减 |
| 普及 | 黄 | 普及 |
| 普及+ | 绿 | 普及加 |
| 提高 | 青 | 提高 |
| 提高+ | 蓝 | 提高加 |
| 省选 | 紫 | 省选级 |
| NOI | 黑 | NOI 级 |

旧版难度值（简单/中等/困难/easy/medium/hard）会被自动迁移到对应 8 档。

### config.yaml（测试配置覆盖，可选）

字段与 problem.yaml 相同（time_limit / memory_limit / comparison_mode / real_precision），
但**优先级更高**。常用于"题目默认 1s，但某组测试点需要 2s"等场景。

字段范围与 problem.yaml 一致：
- time_limit: 1-30000 ms
- memory_limit: 1-1024 MB
- real_precision: 0-12
- comparison_mode: default / strict / ignore-spaces / real-number

### description.md（题目描述，必需）

markdown 格式。**只写题目主干描述**，不要包含以下内容（前端会通过独立字段/区块渲染，重复会导致内容显示两次）：

- ❌ 题目标题（H1）—— 标题来自 `problem.yaml.title`，前端在页面顶部以 H1 渲染
- ❌ "## 输入格式" 段落 —— 输入格式应写入 `input.md`
- ❌ "## 输出格式" 段落 —— 输出格式应写入 `output.md`
- ❌ "## 数据范围" 段落 —— 数据范围应写入 `hint.md`（说明/提示区块）

支持嵌入 HTML 标签（由前端 rehype-raw 渲染）、数学公式（KaTeX）、
代码高亮（Prism）。推荐使用纯 markdown 编写。

**正确示例**（`0001-a-plus-b/description.md`）：

```markdown
给定两个整数 $a$ 和 $b$，求 $a + b$ 的值。
```

### background.md（题目背景，可选）

markdown 格式。**只写题目背景**（如赛事背景、故事背景等），展示在"题目描述"区块之前。

若题目没有背景，不提供此文件即可。

### input.md / output.md（输入/输出格式，可选）

markdown 格式。若不提供，前端会显示为空。推荐填写，便于学员理解题意。

- `input.md`：写输入格式描述，**数据范围建议附在此文件末尾**（与输入字段相关）
- `output.md`：写输出格式描述

**正确示例**（`0001-a-plus-b/input.md`）：

```markdown
一行，包含两个整数 $a$ 和 $b$，以空格分隔。

**数据范围**：$-10^9 \le a, b \le 10^9$
```

### hint.md（提示，可选）

markdown 格式。展示在题目"说明/提示"区块，包含：
- 数据范围
- **样例解释**（所有样例的解释统一写在这里，不再为每个样例单独提供解释文件）
- 算法提示、实现注意点等

**不要把数据范围放在 description.md 或 input.md 中**（数据范围应附在 hint.md 中）。

### samples/（展示样例，可选）

- 文件名约定：`<编号>.in` / `<编号>.out`
- 编号从 1 开始，连续递增
- 展示在题目描述的"样例"区域，**不参与评测**
- 若不提供，导入时会自动取 testcases 的前 2 组作为展示样例

### testcases/（完整测试点，必需）

- 文件名约定：`<编号>.in` / `<编号>.out` / `<编号>.score`
- 编号从 1 开始，连续递增
- **参与评测**，是题目的完整测试集
- `.score` 文件可选，内容是该测点分数（0-100 的整数），不填则所有测点均分 100 分
- **单题测试点数量上限：50 组**（对齐项目 `TESTCASE_UPLOAD_CONFIG.MAX_TESTCASES`）

### std.cpp / std.c / std.py（标准代码，可选）

标程代码文件。导入后存入 `problem.stdCode` + `problem.stdLang` 字段，
供 AI 题解生成和评测验证使用。

- 扩展名决定 `stdLang`：`.cpp` → cpp，`.c` → c，`.py` → python
- 支持的扩展名：`.cpp` / `.cc` / `.cxx` / `.c` / `.py`
- 候选文件名：`std.*` / `standard.cpp` / `sol.cpp`（按优先级查找）

### spj.cpp（特判代码，可选）

当前项目 Problem 模型暂未启用 SPJ 字段，解析时会忽略此文件，
待项目支持 SPJ 后启用。

## 导入方法

1. 将整个 `dsoj-pack-template/` 文件夹打包为 ZIP
2. 进入管理后台 → 题库管理 → 批量导入
3. 选择格式 "DSOJ"
4. 上传 ZIP 文件

## 爬虫采集建议

1. **目录命名**：建议用 `题号-slug` 格式（如 `0001-a-plus-b`），便于排序和去重
2. **编号填充**：题号前补零到 4 位（0001、0002、...、9999），保证排序正确
3. **UTF-8 编码**：所有 .md / .yaml / .in / .out 文件必须 UTF-8 编码
4. **换行符**：建议统一使用 LF（\n），避免 CRLF 跨平台问题
5. **测试数据完整性**：每组测试点必须同时有 `.in` 和 `.out` 文件
6. **去重**：通过 `problem.yaml.problem_number` 或题目标题去重
7. **错误隔离**：单题解析失败不影响其他题，可在采集脚本中针对每题独立 try/catch

## 完整示例

参考 `problems/0001-a-plus-b/` 和 `problems/0002-max-of-three/` 两个完整示例。
