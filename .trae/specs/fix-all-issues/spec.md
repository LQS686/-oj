# 修复所有项目问题 Spec

## Why
当前项目存在多个关键问题影响代码质量和运行稳定性：
- ESLint配置语法错误导致lint命令无法运行
- ObjectID格式验证不一致导致API请求失败
- 缺少统一的ID验证中间件

## What Changes

### 1. 修复ESLint配置文件
- **BREAKING** 更新ESLint配置使用CommonJS语法以兼容当前环境
- 添加必要的ESLint插件依赖

### 2. 统一ID参数验证
- 创建统一的ObjectID验证中间件/工具函数
- 为所有API路由添加ID格式验证
- 返回友好的错误信息而非数据库错误

### 3. 规范化API错误处理
- 确保所有API路由有一致的错误处理模式
- 验证传入参数格式后再进行数据库查询

## Impact
- Affected specs: 所有API路由、认证服务、数据库操作
- Affected code: 
  - `eslint.config.js`
  - `app/api/**/route.ts` (所有带[id]参数的路由)
  - 新增 `lib/validation.ts` (ObjectID验证工具)

## ADDED Requirements

### Requirement: ObjectID验证工具
系统应提供统一的ObjectID验证功能，用于验证MongoDB ID格式。

#### Scenario: 有效ObjectID
- **WHEN** 传入24位十六进制字符串
- **THEN** 返回true

#### Scenario: 无效ObjectID
- **WHEN** 传入非24位十六进制字符串（如"1"）
- **THEN** 返回false

### Requirement: API路由ID验证
所有使用动态ID参数的API路由应在查询数据库前验证ID格式。

#### Scenario: 无效ID格式请求
- **WHEN** API收到无效的ID参数
- **THEN** 返回400状态码和友好的错误信息 "无效的ID格式"

## MODIFIED Requirements

### Requirement: ESLint配置
ESLint配置文件应能正常运行，不出现模块导入错误。

#### Scenario: 运行ESLint
- **WHEN** 执行 `npm run lint`
- **THEN** ESLint正常运行，无语法错误

## REMOVED Requirements

无

## 技术细节

### ObjectID格式
- 有效的ObjectID是24位十六进制字符串（0-9, a-f, A-F）
- 正则表达式: `/^[0-9a-fA-F]{24}$/`

### 需要修复的API路由
1. `/app/api/users/[id]/stats/route.ts`
2. `/app/api/users/[id]/info/route.ts`
3. `/app/api/posts/[id]/route.ts`
4. `/app/api/problems/[id]/route.ts` (已有验证，需确认)
5. 其他使用动态ID参数的API路由

### ESLint配置修复
当前问题: `import { defineConfig } from 'eslint'` 在CommonJS环境中失败
解决方案: 使用兼容写法或调整为ESM模式
