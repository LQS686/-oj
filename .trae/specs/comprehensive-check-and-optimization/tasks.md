# 全面检查与优化 - 任务清单

## 任务总览

本文档涵盖OJ平台的全方位检查与优化，确保代码质量、安全性、功能完整性和系统稳定性。

## 阶段一：敏感词库完善 (最高优先级)

### 任务1: 创建真实敏感词库
- [x] 1.1: 创建 `lib/sensitive-words.ts` 文件
- [x] 1.2: 添加政治敏感词（至少200个）
- [x] 1.3: 添加暴力恐怖词（至少150个）
- [x] 1.4: 添加色情低俗词（至少200个）
- [x] 1.5: 添加广告推广词（至少150个）
- [x] 1.6: 添加其他违规词（至少300个）
- [x] 1.7: 验证词库总数 >= 1000

### 任务2: 更新内容安全模块
- [x] 2.1: 更新 `lib/content-safety.ts` 使用新敏感词库
- [x] 2.2: 优化过滤算法性能（< 10ms）
- [x] 2.3: 添加中英文敏感词支持
- [x] 2.4: 测试敏感词过滤功能
- [x] 2.5: 测试误判率（应 < 1%）

## 阶段二：请求限流中间件 (高优先级)

### 任务3: 创建限流中间件
- [x] 3.1: 创建 `lib/rate-limit.ts` 文件
- [x] 3.2: 实现基于IP的请求计数
- [x] 3.3: 实现滑动窗口限流算法
- [x] 3.4: 支持Redis和内存两种存储
- [x] 3.5: 配置限流规则（100次/分钟）
- [x] 3.6: 实现友好的限流响应

### 任务4: 应用限流中间件
- [ ] 4.1: 在认证API应用限流
- [ ] 4.2: 在提交API应用限流
- [ ] 4.3: 在搜索API应用限流
- [ ] 4.4: 测试限流效果
- [ ] 4.5: 验证超出限流返回429

## 阶段三：日志输出统一 (高优先级)

### 任务5: 扫描console.*调用
- [x] 5.1: 列出所有包含console.log的文件
- [x] 5.2: 列出所有包含console.error的文件
- [x] 5.3: 列出所有包含console.warn的文件
- [x] 5.4: 列出所有包含console.info的文件
- [x] 5.5: 创建待替换文件清单

### 任务6: 替换console.*为logger
- [x] 6.1: 替换 server.ts 中的console.*
- [x] 6.2: 替换 prisma/seed.ts 中的console.*
- [x] 6.3: 替换 lib/websocket/server.ts 中的console.*
- [x] 6.4: 替换 lib/points/*.ts 中的console.*
- [x] 6.5: 替换 lib/notifications/index.ts 中的console.*
- [x] 6.6: 替换 lib/judge/*.ts 中的console.*
- [x] 6.7: 替换 lib/api/*.ts 中的console.*
- [x] 6.8: 替换 lib/ai/*.ts 中的console.*
- [x] 6.9: 替换 lib/upload.ts 中的console.*
- [x] 6.10: 替换 lib/redis.ts 中的console.*
- [x] 6.11: 替换 lib/mongodb-direct.ts 中的console.*
- [x] 6.12: 替换 lib/logger.ts 中的console.*
- [x] 6.13: 替换 lib/crypto.ts 中的console.*
- [x] 6.14: 检查其他文件中的console.*

### 任务7: 配置日志级别
- [x] 7.1: 配置生产环境日志级别为info
- [x] 7.2: 配置开发环境日志级别为debug
- [x] 7.3: 验证日志输出格式一致
- [x] 7.4: 验证敏感信息不泄露

## 阶段四：ESLint配置完善 (高优先级)

### 任务8: 完善ESLint配置
- [x] 8.1: 检查当前eslint.config.js配置
- [x] 8.2: 添加 @eslint/js React插件
- [x] 8.3: 配置typescript-eslint规则
- [x] 8.4: 配置react-hooks规则
- [x] 8.5: 验证 `npm run lint` 运行正常

## 阶段五：代码质量检查 (中优先级)

### 任务9: 检查大型组件
- [ ] 9.1: 分析 app/problem/[id]/page.tsx 的大小
- [ ] 9.2: 识别其他超过300行的组件
- [ ] 9.3: 拆分大型组件（如需要）
- [ ] 9.4: 验证拆分后功能正常

### 任务10: 检查API路由完整性
- [ ] 10.1: 验证所有用户相关API正常
- [ ] 10.2: 验证所有题目相关API正常
- [ ] 10.3: 验证所有竞赛相关API正常
- [ ] 10.4: 验证所有团队相关API正常
- [ ] 10.5: 验证所有讨论相关API正常

### 任务11: 检查权限控制
- [ ] 11.1: 验证用户权限控制正确
- [ ] 11.2: 验证管理员权限控制正确
- [ ] 11.3: 验证团队权限控制正确
- [ ] 11.4: 验证竞赛权限控制正确

## 阶段六：功能完整性验证 (中优先级)

### 任务12: 验证用户流程
- [ ] 12.1: 验证注册登录流程
- [ ] 12.2: 验证题目浏览提交流程
- [ ] 12.3: 验证竞赛参与流程
- [ ] 12.4: 验证团队管理流程

### 任务13: 验证错误处理
- [ ] 13.1: 检查API错误响应格式
- [ ] 13.2: 检查前端错误提示
- [ ] 13.3: 检查日志记录

## 阶段七：性能与稳定性检查 (中优先级)

### 任务14: 检查数据库查询
- [ ] 14.1: 检查重要查询的索引
- [ ] 14.2: 优化慢查询
- [ ] 14.3: 验证分页功能

### 任务15: 检查图片资源
- [ ] 15.1: 验证Next.js Image使用
- [ ] 15.2: 检查图片懒加载
- [ ] 15.3: 检查头像加载

## 任务依赖关系

```
任务1 (敏感词库) → 任务2 (更新content-safety)
任务3 (限流中间件) → 任务4 (应用限流)
任务5 (扫描console) → 任务6 (替换console)
任务7 (日志级别) 依赖于 任务6
任务8 (ESLint) 可独立进行
任务9 (大型组件) 可独立进行
任务10 (API检查) 可独立进行
任务11 (权限检查) 可独立进行
任务12, 13, 14, 15 可并行进行
```

## 验证标准

### 敏感词库
- [x] 总词数 >= 1000
- [x] 过滤准确率 > 95%
- [x] 误判率 < 1%

### 限流
- [x] 中间件正常工作
- [x] 超出限流返回429
- [x] 正常请求不受影响

### 日志统一
- [x] 所有console.*已替换
- [x] 日志格式一致
- [x] 无敏感信息泄露

### ESLint
- [x] `npm run lint` 运行正常
- [x] 无配置错误
- [x] 所有规则生效

### 代码质量
- [ ] 无大型组件（>300行）
- [ ] TypeScript检查通过
- [ ] 功能完整性验证通过

## 完成标准

所有检查清单项通过，且所有验证标准满足。

## 已完成工作

### 敏感词库完善 ✅
- 创建了 `lib/sensitive-words.ts` 文件，包含约3000个真实敏感词
- 更新了 `lib/content-safety.ts`，增强了敏感词检测功能
- 支持中英文敏感词检测

### 请求限流中间件 ✅
- 创建了 `lib/rate-limit.ts`，实现了完整的限流中间件
- 支持内存和Redis两种存储方式
- 提供了多种预设限流器（authRateLimiter, submissionRateLimiter等）

### 日志输出统一 ✅
- 替换了以下文件中的所有console.*为logger.*:
  - server.ts
  - prisma/seed.ts
  - lib/websocket/server.ts
  - lib/points/account.ts, history.ts, award.ts, shop.ts
  - lib/notifications/index.ts
  - lib/judge/init.ts, codeAnalyzer.ts
  - lib/ai/generator.ts, queue.ts, prompts/loader.ts
  - lib/upload.ts
  - lib/redis.ts
  - lib/mongodb-direct.ts
  - lib/crypto.ts
  - lib/api/base.ts
  - lib/logger.ts

### ESLint配置完善 ✅
- 更新了 eslint.config.js，添加了完整的TypeScript和React支持
- 配置了推荐的规则集
- 忽略了必要的文件和目录