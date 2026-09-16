/**
 * lib/backup/config.ts
 * 备份/恢复相关配置：目录、保留策略、体积上限（全部可选，含默认值）。
 *
 * 注意：保留策略只读（走环境变量），不在数据库里持久化，避免引入新集合。
 */
import { join } from 'path'

export interface BackupConfig {
  /** 备份包存放目录（容器内建议挂卷） */
  dir: string
  /** 备份包自动清理的最大保留天数 */
  keepDays: number
  /** 备份包自动清理的最大保留份数 */
  keepCount: number
  /** 单个备份包上传/恢复体积上限（MB） */
  maxSizeMb: number
}

function toPositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

export function getBackupConfig(): BackupConfig {
  const dir = process.env.BACKUP_DIR?.trim() || join(process.cwd(), 'data', 'backups')
  return {
    dir,
    keepDays: toPositiveInt(process.env.BACKUP_KEEP_DAYS, 7, 365),
    keepCount: toPositiveInt(process.env.BACKUP_KEEP_COUNT, 7, 100),
    maxSizeMb: toPositiveInt(process.env.BACKUP_MAX_SIZE_MB, 4096, 51200),
  }
}

/** 生成供 env.ts 启动告警使用的非关键配置提示（不抛错） */
export function getBackupEnvWarnings(): string[] {
  const warnings: string[] = []
  for (const k of ['BACKUP_KEEP_DAYS', 'BACKUP_KEEP_COUNT', 'BACKUP_MAX_SIZE_MB'] as const) {
    if (process.env[k] !== undefined) {
      const parsed = parseInt(process.env[k] ?? '', 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        warnings.push(`${k} 不是合法正整数，将使用默认值。`)
      }
    }
  }
  return warnings
}
