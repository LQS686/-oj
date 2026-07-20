/**
 * lib/problem/service.ts
 * 题目业务层 barrel 入口（向后兼容 @/lib/problem/service 的所有 import）
 * 实现已按功能领域拆分到 ./crud / ./lookup / ./submissions / ./admin / ./batch / ./export
 */
export * from './crud'
export * from './lookup'
export * from './submissions'
export * from './admin'
export * from './batch'
export * from './export'
