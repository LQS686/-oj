# Tasks - 修复所有项目问题

## 任务总览
- [x] Task 1: 修复ESLint配置文件
- [x] Task 2: 创建ObjectID验证工具函数
- [x] Task 3: 修复所有API路由的ID验证问题

## 详细任务

### Task 1: 修复ESLint配置文件
- [x] Task 1.1: 分析当前ESLint配置问题
- [x] Task 1.2: 更新eslint.config.js使用正确的模块语法
- [x] Task 1.3: 验证ESLint能正常运行

### Task 2: 创建ObjectID验证工具函数
- [x] Task 2.1: 在lib目录创建或更新validation.ts
- [x] Task 2.2: 实现isValidObjectId函数
- [x] Task 2.3: 实现isValidId函数（支持ObjectId或数字ID）
- [x] Task 2.4: 导出验证函数供API路由使用

### Task 3: 修复所有API路由的ID验证问题
- [x] Task 3.1: 修复 `/app/api/users/[id]/stats/route.ts`
- [x] Task 3.2: 修复 `/app/api/users/[id]/info/route.ts`
- [x] Task 3.3: 修复 `/app/api/posts/[id]/route.ts`
- [x] Task 3.4: 检查并修复其他使用动态ID的API路由
- [x] Task 3.5: 运行TypeScript检查确保无类型错误
- [x] Task 3.6: 运行构建测试确保项目能正常构建

## 任务依赖
- Task 2 完成后，Task 3 才能开始
- Task 1 和 Task 2 可以并行进行

## 验证标准
1. `npm run lint` 能正常运行（无语法错误）
2. 所有使用动态ID的API在接收到无效ID时返回400错误
3. `npm run build` 能成功构建
4. TypeScript类型检查无错误

## 完成状态
所有任务已完成并验证通过！
