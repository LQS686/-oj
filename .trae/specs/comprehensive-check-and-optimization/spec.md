# OJ Platform 全面检查与优化规范

## Why

当前项目虽已有多个优化规范（系统性优化、功能完善、问题修复），但仍存在以下关键问题需要解决：

1. **敏感词库几乎为空**：现有词库仅有3个占位符，无法提供真实的内容安全保障
2. **请求限流未实现**：规范要求但代码中未找到rate-limit中间件
3. **大量console.log遗留**：20个文件存在console.*调用，存在敏感信息泄露风险
4. **ESLint配置不完整**：缺少必要的React规则和TypeScript支持
5. **代码质量问题**：部分组件较大，部分功能可能未完善

## What Changes

### 1. 安全加固 (优先级: 最高)

- 完善敏感词库（1000+真实敏感词）
- 实现请求限流中间件
- 统一日志输出（替换所有console.*）
- 补充ESLint插件和规则

### 2. 代码质量优化 (优先级: 高)

- 替换所有console.*为logger.*
- 检查和拆分大型组件
- 完善错误处理
- 优化TypeScript类型

### 3. 功能完整性检查 (优先级: 中)

- 验证所有API路由正常工作
- 检查前后端数据一致性
- 完善权限控制
- 验证用户流程完整性

### 4. 性能与稳定性 (优先级: 中)

- 优化数据库查询
- 检查图片资源加载
- 验证缓存机制
- 检查内存泄漏

## Impact

- Affected specs: 所有功能模块、安全系统、日志系统
- Affected code:
  - `lib/content-safety.ts` (敏感词库)
  - `lib/rate-limit.ts` (新建 - 限流中间件)
  - `lib/logger.ts` (日志封装)
  - `eslint.config.js` (配置完善)
  - 所有包含console.*的文件 (20个)
  - 所有API路由 (限流应用)

## ADDED Requirements

### Requirement: 真实敏感词库

系统应提供包含至少1000个真实敏感词的词库。

#### Scenario: 敏感词检测
- **WHEN** 用户提交包含任何常见敏感词的内容
- **THEN** 系统过滤该内容或拒绝提交
- **Verification**: 词库覆盖率 > 95%

#### Scenario: 低误判率
- **WHEN** 用户提交正常内容（如"编程"、"学习"）
- **THEN** 内容不会被误判为敏感
- **Verification**: 误判率 < 1%

### Requirement: 请求限流中间件

API应实现基于IP的请求频率限制。

#### Scenario: 正常请求
- **WHEN** IP在1分钟内请求 < 100次
- **THEN** 请求正常处理

#### Scenario: 超出限流
- **WHEN** IP在1分钟内请求 >= 100次
- **THEN** 返回429状态码和重试提示

### Requirement: 统一日志输出

所有代码应使用logger而非console.*。

#### Scenario: 日志记录
- **WHEN** 代码需要记录日志
- **THEN** 使用logger.info/warn/error
- **Verification**: 无console.*在生产代码中

## MODIFIED Requirements

### Requirement: ESLint配置完整

ESLint应配置完整的规则集。

#### Scenario: 运行ESLint
- **WHEN** 执行 `npm run lint`
- **THEN** 检查React hooks、TypeScript、最佳实践
- **Verification**: 无配置错误，所有规则生效

## 技术实施

### 第一步：敏感词库完善
1. 收集常见敏感词分类：
   - 政治敏感词
   - 暴力恐怖词
   - 色情低俗词
   - 广告推广词
   - 其他违规词
2. 存储于 `lib/sensitive-words.ts`
3. 更新 `lib/content-safety.ts` 使用新词库
4. 验证过滤效果和误判率

### 第二步：限流中间件实现
1. 创建 `lib/rate-limit.ts`
2. 使用内存或Redis存储计数
3. 配置限流规则（100次/分钟）
4. 在关键API应用中间件
5. 测试限流效果

### 第三步：日志统一
1. 扫描所有console.*调用
2. 替换为logger.*方法
3. 配置生产环境日志级别
4. 验证日志输出格式

### 第四步：ESLint完善
1. 添加缺失的ESLint插件
2. 配置TypeScript parser
3. 添加React hooks规则
4. 验证lint命令正常运行

### 第五步：代码质量检查
1. 检查大型组件（>300行）
2. 验证API路由完整性
3. 检查权限控制一致性
4. 验证用户流程正确性

## 验证标准

### 安全性
- [ ] 敏感词库包含 >= 1000个词
- [ ] 过滤准确率 > 95%
- [ ] 限流中间件正常工作
- [ ] 无console.log泄露敏感信息

### 代码质量
- [ ] ESLint配置完整且运行正常
- [ ] 所有console.*已替换
- [ ] 大型组件已拆分或合理化
- [ ] TypeScript检查无错误

### 功能完整性
- [ ] 所有核心功能正常工作
- [ ] 权限控制无漏洞
- [ ] API路由返回正确数据
- [ ] 错误处理完善