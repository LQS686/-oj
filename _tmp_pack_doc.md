# dsoj-pack 格式说明（v2）

本目录是爬虫输出的题包根目录。**v2** 相对 v1 的核心变化：

1. 题目目录改为稳定 **PID 命名**（如 `LP1001/`），不再使用 `0001-LP1001-中文标题/`
2. 新增机器可读索引 **`index.json`**（解析首选入口）
3. `pack.yaml` 的 `version` 升为 `"2.0"`，并指向 `index`
4. 可选采集 **题解**（`solutions/`）；AI 补全写入 **`testcases/`**

单题正文仍为扁平 markdown + `samples/` + `testcases/`，便于人工阅读与导入。

## 目录结构

```text
dsoj-pack/
├── pack.yaml                 # 题包元信息
├── index.json                # 题目索引（权威列表）
├── README.md                 # 本说明
└── problems/
    └── LP1001/               # 目录名 = problem_number（洛谷题号加 L 前缀）
        ├── problem.yaml
        ├── description.md    # 必有
        ├── background.md     # 可选
        ├── input.md          # 可选
        ├── output.md         # 可选
        ├── hint.md           # 常有（可为空）
        ├── samples/
        │   ├── 1.in
        │   └── 1.out
        ├── testcases/        # AI 补全的测试点（.in / .out）
        │   └── quality.json  # 可选：补全质量元数据
        ├── solutions/        # 可选：采集的题解（需登录 Cookie）
        │   ├── index.json
        │   ├── {lid}.md
        │   └── _runnable/    # 可选缓存：AI 抽出的可运行代码，非导入必需
        └── generator.py      # 可选：AI 缓存的造数脚本
```

题号规则：洛谷 `P1001` → 题包目录 / `problem_number` 为 `LP1001`；已是 `L…` 则保持不变。`luogu_pid` 为去掉一个前导 `L` 后的原题号。

## pack.yaml

| 字段 | 说明 |
|------|------|
| `format` | 固定 `dsoj-pack` |
| `version` | `2.0` |
| `problem_count` | 题目数 |
| `index` | 索引文件名，默认 `index.json` |
| `source` / `description` / `created_at` | 元信息（`created_at` 可为空） |

## index.json

```json
{
  "schema_version": 2,
  "problem_count": 1,
  "problems": [
    {
      "order": 1,
      "pid": "LP1001",
      "luogu_pid": "P1001",
      "dir": "LP1001",
      "title": "A+B Problem",
      "difficulty": "入门",
      "tags": ["模拟"]
    }
  ]
}
```

- `order`：展示 / 导入顺序（替代旧目录名前缀序号）
- `dir`：相对 `problems/` 的目录名
- `pid`：题包题号（与目录名一致）

每次成功写入题目或执行 `rebuild_index` / `migrate-pack` 时会刷新本文件。

## problem.yaml

| 字段 | 类型 | 说明 |
|------|------|------|
| `schema_version` | int | `2` |
| `title` | str | 标题 |
| `problem_number` | str | 题包题号，如 `LP1001` |
| `luogu_pid` | str | 洛谷原题号，如 `P1001` |
| `difficulty` | str | 中文难度 |
| `tags` | list[str] | 标签 |
| `source` | str | 来源，默认「洛谷」 |
| `visibility` | str | 默认 `public` |
| `time_limit` | int | 毫秒 |
| `memory_limit` | int | MB |
| `comparison_mode` | str | 默认 `default` |
| `real_precision` | int | 默认 `3` |

## 样例与测试点

| 目录 | 用途 |
|------|------|
| `samples/` | 题面样例；连续编号 `1.in` / `1.out` …；空 `.in` 表示「无输入」合法 |
| `testcases/` | 补全后的评测数据；同样连续编号；可含 `.out` 与 `quality.json` |

内置 `Pack` API 会读取样例对，并对 `testcases/` 仅收集 `.in` 列表（`testcase_inputs`）。题解不在 `ProblemBundle` 内，需自行读 `solutions/`。

## solutions/（可选）

采集题解时（GUI / CLI 开启且 Cookie 有效）写入：

```text
solutions/
├── index.json
└── {lid}.md          # 文首元数据 + --- + 正文
```

`solutions/index.json` 示例：

```json
{
  "count": 2,
  "solutions": [
    {
      "lid": "xxxx",
      "title": "题解标题",
      "author": "作者",
      "author_uid": 123,
      "thumb_up": 10,
      "file": "xxxx.md"
    }
  ]
}
```

`solutions/_runnable/`、`generator.py`、`testcases/quality.json` 属于爬虫 / AI 工作缓存，**不是** OJ 导入的必需要素；维护清理可能删除它们。

## 解析方案（推荐）

### Python（内置 API）

```python
from luogu_crawler.pack import Pack

pack = Pack.open("dsoj-pack")
print(pack.problem_count)

for problem in pack.iter_problems():
    print(problem.order, problem.pid, problem.title)
    print(problem.description[:100])
    for inp, out in problem.samples:
        ...
    # 转回爬虫内部结构
    data = problem.to_problem_data()
```

按题号读取（`P1001` / `LP1001` 均可）：

```python
problem = pack.get("P1001")
assert problem is not None
print(problem.absolute_dir)
```

重建索引（手工改目录后）：

```python
from luogu_crawler.pack import rebuild_index
rebuild_index("dsoj-pack")
```

### 无依赖伪代码

1. 读 `pack.yaml`，确认 `format == dsoj-pack`
2. 优先读 `index.json` 的 `problems[]`
3. 对每条记录打开 `problems/{dir}/problem.yaml` + 同目录 markdown / `samples/`
4. 若无 `index.json`，扫描 `problems/*/` 下含 `problem.yaml` 的目录（兼容 v1 目录名 `NNNN-PID-...`）
5. 题解（若需要）再读 `problems/{dir}/solutions/index.json`

### 从 v1 迁移

```bash
python -m luogu_crawler migrate-pack
# 预览：
python -m luogu_crawler migrate-pack --dry-run
# 指定目录：
python -m luogu_crawler migrate-pack --pack-dir path/to/dsoj-pack
```

迁移会把 `0003-LP1001-A+B_Problem` 重命名为 `LP1001`，并生成 / 刷新 `index.json`。

## ZIP 打包

将本目录内容打成**扁平 ZIP**（顶层直接是 `pack.yaml` / `index.json` / `problems/`，不再套一层 `dsoj-pack/`）：

```bash
python -m luogu_crawler pack
```

- 默认输出：项目根目录的 **`dsoj-pack.zip`**（可用环境变量 `LUOGU_OUTPUT_ZIP` 覆盖）
- GUI「打包导出」页可改输出路径、压缩等级，并按模式排除 `testcases`、`__pycache__` 等

相关环境变量：`LUOGU_DSOJ_PACK_DIR`、`LUOGU_PROBLEMS_DIR`、`LUOGU_OUTPUT_ZIP`。
