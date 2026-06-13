# Tasks - 修复当前线上页面/权限/数据异常

## 任务总览
- [ ] Task 1: 信息收集 - 静态扫描 4 路
- [ ] Task 2: 信息收集 - 服务端错误日志分析
- [ ] Task 3: 信息收集 - 客户端 console.error 拦截日志分析
- [ ] Task 4: 分类与优先级排序
- [ ] Task 5: 高优 - 修复 ctx.params 路由残留（回归确认）
- [ ] Task 6: 高优 - 修复响应字段不一致（items/problems/分页结构）
- [ ] Task 7: 中优 - 修复 ID 校验边界
- [ ] Task 8: 中优 - 修复前端 useEffect 字段缺失防御
- [ ] Task 9: 低优 - 规范化 console.error → logger
- [ ] Task 10: 验证 - tsc 0 错误 + 抽样页面手动验证
- [ ] Task 11: 提交推送

## 详细任务

### Task 1: 静态扫描（4 路并行）
- [ ] 1.1 [P]: `grep -rn "prisma\." app/api/**/route.ts` 应为 0
- [ ] 1.2 [P]: `grep -rn "console\." app/api/**/route.ts` 应为 0
- [ ] 1.3 [P]: `grep -rn "ctx\.params" app/api/**/route.ts | grep -v "(ctx as any)"` 评估是否需 await
- [ ] 1.4 [P]: `grep -rn "(ctx as any)\.params" app/api/**/route.ts` 列出所有使用点
- [ ] 1.5 [P]: `grep -rn "data\.data\.problems\|data\.data\.items" app/**/page.tsx` 字段消费清单
- [ ] 1.6 [P]: `grep -rn "isAdmin" lib/permissions.ts` 角色判断使用方式
- [ ] 1.7: 输出 `scan-report.md`，按 文件:行号 列出所有命中

### Task 2: 服务端错误日志分析
- [ ] 2.1: 读取 `logs/error.log` 最近 100 条
- [ ] 2.2: 分类（PrismaClientValidationError / P2023 / ValidationError / 400 / 401 / 403 / 500）
- [ ] 2.3: 提取最高频 5 类错误，每类生成 1 个修复任务
- [ ] 2.4: 输出 `error-summary.md`

### Task 3: 客户端 console.error 拦截日志分析
- [ ] 3.1: 读取客户端 `intercept-console-error.ts` 实现
- [ ] 3.2: 让用户提供最近 1 小时客户端 console 报错（如不方便则跳过此任务）
- [ ] 3.3: 提取客户端 TypeError / 渲染异常
- [ ] 3.4: 输出 `client-error-summary.md`

### Task 4: 分类与优先级排序
- [ ] 4.1: 合并 Task 1-3 报告
- [ ] 4.2: 标记 P0（崩溃/数据丢失）、P1（功能异常）、P2（体验下降）
- [ ] 4.3: 输出 `priority-list.md`

### Task 5: 高优 - 修复 ctx.params 路由残留
- [ ] 5.1: 列出 Task 1.4 所有使用点
- [ ] 5.2: 验证 withApi 4 个 wrapper 入口已正确 await
- [ ] 5.3: 抽样手动 curl `/api/problems/P1025` / `/api/posts/<id>` / `/api/solutions/<id>` 确认 200
- [ ] 5.4: 修复任何漏网的 `(ctx as any).params` 调用

### Task 6: 高优 - 修复响应字段不一致
- [ ] 6.1: 列出所有 list 端 API 当前返回结构
- [ ] 6.2: 列出所有前端消费点（Task 1.5）
- [ ] 6.3: 决定统一方案（建议 `data.data.items + pagination 子对象`，最小破坏）
- [ ] 6.4: 修复服务端返回结构
- [ ] 6.5: 修复前端消费点
- [ ] 6.6: 加 `data?.data?.items || []` 防御默认值

### Task 7: 中优 - 修复 ID 校验边界
- [ ] 7.1: 检查 `isObjectIdLike` 是否被所有 ctx.params.id 路径调用
- [ ] 7.2: 修复 problemNumber 路径（`P1025` 不应触发 ObjectId 校验）
- [ ] 7.3: 添加 `isProblemNumber` 辅助
- [ ] 7.4: 错误 ID（如 `/api/problems/abc`）应返回 404 而非 500

### Task 8: 中优 - 修复前端 useEffect 字段缺失防御
- [ ] 8.1: 列出所有 `setXxx(data.data.yyy)` 模式
- [ ] 8.2: 补 `|| []` / `|| 0` / `|| {}` 防御
- [ ] 8.3: 检查 useMemo `[...problems]` 这种依赖数组语义的稳健性

### Task 9: 低优 - 规范化 console.error → logger
- [ ] 9.1: 列出 `app/**/page.tsx` 中 console.* 使用
- [ ] 9.2: 替换为 `logger.error` / `logger.warn`
- [ ] 9.3: 测试环境静默逻辑保持

### Task 10: 验证
- [ ] 10.1: `npx tsc --noEmit` 0 错误
- [ ] 10.2: `npm run lint`（如可）0 新增警告
- [ ] 10.3: 抽样手动验证：
  - [ ] /problems 列表页 200 + 渲染
  - [ ] /problem/P1025 详情页 200 + 渲染
  - [ ] /notifications 红点数字显示
  - [ ] 用户主页 /user/<id> 200
  - [ ] 提交代码 /submissions/<id> 200
  - [ ] 题解 /solutions/<id> 200
  - [ ] 帖子 /posts/<id> 200
  - [ ] 班级 /classes/<id> 200
  - [ ] 竞赛 /contests/<id> 200
  - [ ] 训练 /trainings/<id> 200
- [ ] 10.4: 错误日志中无新 PrismaClientValidationError

### Task 11: 提交 + 推送
- [ ] 11.1: 按修复域分批 commit
- [ ] 11.2: `git push origin master`

## 任务依赖关系
- Task 5-9 依赖 Task 1-4
- Task 10 依赖 Task 5-9
- Task 11 依赖 Task 10

## 验证标准
1. `npx tsc --noEmit` 0 错误
2. 抽样 10 个关键页面全部 200
3. logs/error.log 不新增 PrismaClientValidationError
4. 前端 console.error 拦截日志无 TypeError
