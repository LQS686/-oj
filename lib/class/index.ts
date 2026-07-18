/**
 * lib/class/index.ts
 * 班级业务层统一入口
 */

export * from './auth'
export * from './member'
export * from './assignment'
export * from './note'

// 作业 update / delete 统一入口为 service.ts（含校验），不再从 assignment.ts 导出
export { updateClassAssignment, deleteClassAssignment } from './service'
