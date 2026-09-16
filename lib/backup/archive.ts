/**
 * lib/backup/archive.ts
 * 归档相关的公共工具：递归列文件、上传路径穿越防护。
 * 实际打包/解包在 create.ts / restore.ts 中借助 archiver / tar-stream 完成。
 */
import { readdir, stat } from 'fs/promises'
import { join, normalize, relative, sep } from 'path'

export interface FileEntry {
  /** 磁盘绝对路径 */
  abs: string
  /** 归档内相对路径（统一用正斜杠） */
  rel: string
}

/** 递归枚举目录下所有文件（不含目录项）。 */
export async function listFilesRecursively(dir: string): Promise<FileEntry[]> {
  const out: FileEntry[] = []
  const walk = async (current: string) => {
    const entries = await readdir(current, { withFileTypes: true })
    for (const e of entries) {
      const abs = join(current, e.name)
      if (e.isDirectory()) {
        await walk(abs)
      } else if (e.isFile()) {
        out.push({ abs, rel: toArchiveRelPath(relative(dir, abs)) })
      }
    }
  }
  await walk(dir)
  return out
}

function toArchiveRelPath(p: string): string {
  return p.split(sep).join('/')
}

/**
 * 归一化归档内相对路径，并拦截路径穿越。
 * - 拒绝绝对路径、空段、`.`/`..` 越界。
 * - 返回以 `/` 分隔的统一相对路径；不安全时返回 null。
 */
export function sanitizeArchiveRelPath(rel: string | undefined | null): string | null {
  if (!rel) return null
  const normalized = rel.split('\\').join('/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) return null
  const parts = normalized.split('/').filter((p) => p !== '' && p !== '.')
  if (parts.length === 0) return null
  if (parts.some((p) => p === '..')) return null
  // 重新拼装前再兜底一次（normalize 处理 `a/../b`）
  const joined = parts.join('/')
  if (normalize(joined).startsWith('..')) return null
  return joined
}

/** 确认目录存在（递归创建）。 */
export async function ensureDir(dir: string): Promise<void> {
  const { mkdir } = await import('fs/promises')
  await mkdir(dir, { recursive: true })
  await stat(dir).catch(() => null)
}
