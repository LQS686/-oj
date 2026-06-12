# 命名规范（NAMING_CONVENTION）

> 本文档约束本项目内所有文件 / 变量 / 类型 / API 路由 / Prisma 模型的命名风格。
> ESLint 配置（[eslint.config.js](../eslint.config.js)）会自动检查部分规则。

## 1. 文件命名

| 类别             | 风格          | 示例                          |
| ---------------- | ------------- | ----------------------------- |
| React 组件       | PascalCase    | `UserCard.tsx`、`ProblemList.tsx` |
| 工具 / Hook      | camelCase     | `useCurrentUser.ts`、`formatDate.ts` |
| 业务模块（lib/） | kebab-case 目录 + 固定文件名 | `lib/auth/service.ts` |
| 类型定义文件     | camelCase     | `common.ts`、`api.ts` |
| 文档             | SCREAMING_SNAKE | `NAMING_CONVENTION.md`     |
| 脚本             | kebab-case    | `migrate-team-to-class.ts` |

> ⚠️ 已废弃命名：`lib/` 根目录的 PascalCase 工具文件需迁入业务模块目录。

## 2. 目录命名

| 类别             | 风格         |
| ---------------- | ------------ |
| `app/`           | kebab-case（路由段）/ `[id]` 动态段 |
| `lib/<domain>/`  | kebab-case  |
| `components/<domain>/` | kebab-case |
| `hooks/`         | （单数）camelCase hook 文件 |
| `types/`         | （单数）camelCase 类型文件 |
| `scripts/`       | kebab-case |

## 3. 变量与函数

- **局部变量 / 函数参数 / 普通函数**：camelCase
- **类 / 组件 / 类型 / 接口**：PascalCase
- **常量**：`UPPER_SNAKE_CASE`（如 `MAX_PAGE_SIZE`、`TOTAL_SCORE`）
- **React Hook**：以 `use` 开头，camelCase
- **事件处理函数**：`handle` 前缀（`handleClick`、`handleSubmit`）
- **布尔变量**：`is` / `has` / `can` / `should` 前缀
- **数组**：复数名词（`users`、`items`、`submissions`）

## 4. 保留字规避

TypeScript 保留字禁止作为标识符；本项目常见冲突及解决方案：

| 保留字 | 解决方案            | 示例                  |
| ------ | ------------------- | --------------------- |
| `class` | 使用 `classData` / `classInfo` | `const classData = await getClass(id)` |
| `function` | 使用 `fn` / `handler` | `const handler: Handler = ...` |
| `new` | 使用 `newData` / `record` | `const newData = ...` |
| `delete` | 使用 `remove` | `removeUser(id)` |

ESLint 规则已开启 `no-shadow-restricted-names`。

## 5. Prisma 模型

- 模型名：**PascalCase 单数**（`User`、`Class`、`Submission`）
- 字段名：**camelCase**（`userId`、`createdAt`、`totalScore`）
- 关联字段：模型名 camelCase（`author`、`classMember`）
- 枚举值：UPPER_SNAKE_CASE（如 `'PENDING'`、`'ACCEPTED'`）

## 6. API 路由

- 路径段：kebab-case（`/api/class-members` 而非 `/api/classMembers`）
- HTTP 方法：使用 Next.js App Router 约定 `GET` / `POST` / `PUT` / `PATCH` / `DELETE` 大写
- 响应字段：`{ ok, data?, error?, code? }`

## 7. 业务模块标准结构

每个 `lib/<domain>/` 至少包含：

```
lib/<domain>/
  index.ts        # 公共 re-export
  service.ts      # 数据访问层（唯一允许直接 prisma 调用的位置）
  validation.ts   # 参数校验（基于 lib/api/validation.ts）
  types.ts        # （可选）业务类型
```

新增模块请按此结构组织。

## 8. 注释语言

- 公开模块 / 业务函数：中文 JSDoc
- 行内注释：中文
- 关键算法 / 复杂逻辑：中文 + 必要时附 ASCII 图示

## 9. 检查命令

```bash
npm run lint              # 整体 lint
npx tsc --noEmit          # 类型检查
```

新增文件后请先跑上述两条命令。
