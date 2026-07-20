/**
 * MongoDB 原生驱动封装（barrel 入口）
 * 用于绕过 Prisma 事务限制，直接操作 MongoDB
 *
 * 实现已按操作对象拆分到 ./mongodb 子目录：
 *   - ./mongodb/client            客户端获取 + withRetry 重试封装
 *   - ./mongodb/submission-direct Submission / Problem 提交相关直操作
 *   - ./mongodb/assignment-direct AssignmentSubmission / Assignment 直操作
 *   - ./mongodb/contest-direct    Contest / ContestParticipant 直操作
 *
 * 向后兼容：所有从 `@/lib/mongodb-direct` 导入的路径与 export 名称保持不变。
 */
export * from './mongodb/client'
export * from './mongodb/submission-direct'
export * from './mongodb/assignment-direct'
export * from './mongodb/contest-direct'
