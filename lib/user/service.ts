/**
 * lib/user/service.ts
 * 用户业务层 barrel 入口（向后兼容 @/lib/user/service 的所有 import）
 * 实现已按功能领域拆分到 ./profile / ./public-info / ./avatar / ./batch / ./admin / ./auth-actions
 */
export * from './profile'
export * from './public-info'
export * from './avatar'
export * from './batch'
export * from './admin'
export * from './auth-actions'
