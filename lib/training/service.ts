/**
 * lib/training/service.ts
 * 训练业务层 barrel 入口（向后兼容 @/lib/training/service 的所有 import）
 * 实现已按功能领域拆分到 ./crud / ./public-list / ./category / ./problems / ./enrollment / ./progress
 */
export * from './crud'
export * from './public-list'
export * from './category'
export * from './problems'
export * from './enrollment'
export * from './progress'
export * from './access'
