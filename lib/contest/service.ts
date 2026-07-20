/**
 * lib/contest/service.ts
 * 比赛业务层 barrel 入口（向后兼容 @/lib/contest/service 的所有 import）
 * 实现已按功能领域拆分到 ./crud / ./public / ./rankings / ./submissions / ./admin / ./problems
 */
export * from './crud'
export * from './public'
export * from './rankings'
export * from './submissions'
export * from './admin'
export * from './problems'
