/**
 * lib/class/assignment-service.ts
 * 作业业务 barrel 入口（向后兼容 assignment-service 的所有 import）
 * 实现已按职责拆分到 ./assignment-stats / ./assignment-submit / ./assignment-manage
 */
export * from './assignment-stats'
export * from './assignment-submit'
export * from './assignment-manage'
