/**
 * lib/class/service.ts
 * 班级业务层 barrel 入口（向后兼容 @/lib/class/service 的所有 import）
 * 实现已按功能领域拆分到 ./crud / ./member-activity / ./assignment-service
 *  / ./class-problem / ./invite / ./join-request / ./statistics / ./admin
 *  / ./helpers / ./note-service
 */
export * from './crud'
export * from './member-activity'
export * from './assignment-service'
export * from './class-problem'
export * from './invite'
export * from './join-request'
export * from './statistics'
export * from './admin'
export * from './helpers'
export * from './note-service'
export { isClassAdminRole, isClassOwnerRole } from './roles'
