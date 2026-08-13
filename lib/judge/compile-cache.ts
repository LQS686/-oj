// 编译产物缓存：避免「相同代码重复提交 / 多人提交相同模板」时反复跑 g++。
//
// 正确性保证（防误判）：
//   1. key = sha256(完整代码) + 语言 + 稳定编译参数哈希 + 编译器版本。
//      代码有任何差异（哪怕一个空格）哈希即不同，各自编译、互不影响；
//      只有逐字节完全相同的代码才可能命中同一条缓存。
//   2. 命中时做代码原文二次比对（entry.code === code），对 sha256 碰撞做最终兜底。
//   3. 命中只复用「等价编译产物」，判题仍照常跑该题全部测点并逐测点比对，逻辑不变。
//
// 生命周期：
//   - C/C++ 编译成功后产物进入缓存并占用引用（refs++）；评测结束 release（refs--）。
//   - LRU 淘汰只淘汰 refs===0 的条目，避免删掉正在被评测使用的产物。
//   - Python 无需编译，不进缓存（写源文件开销可忽略），仍由调用方清理。
import { createHash } from 'crypto'
import { spawnSync } from 'child_process'
import { unlink } from 'fs/promises'
import { existsSync, utimesSync } from 'fs'
import { logger } from '@/lib/logger'

export interface CompileCacheEntry {
  compiledPath: string
  /** 源文件扩展名（如 '.cpp' / '.c'），用于淘汰时一并删除源文件 */
  sourceExt: string
  /** 代码原文，命中时二次比对防哈希碰撞 */
  code: string
  /** 正在使用该产物的评测任务数；>0 时不可淘汰 */
  refs: number
}

/** 编译器版本（模块加载时同步探测一次，升级 gcc 后 key 自动变化、旧产物自然失效） */
const compilerVersions = new Map<string, string>()

function detectCompilerVersion(bin: string): string {
  try {
    const r = spawnSync(bin, ['-dumpversion'], { encoding: 'utf8', timeout: 8000 })
    const v = (r.stdout || '').trim()
    return v || 'unknown'
  } catch {
    return 'unknown'
  }
}

function compilerVersionFor(bin: string): string {
  let v = compilerVersions.get(bin)
  if (v === undefined) {
    v = detectCompilerVersion(bin)
    compilerVersions.set(bin, v)
  }
  return v
}

/** 稳定编译参数（不含 -o / 源文件路径），构成缓存 key 的一部分 */
export function compileCacheKey(
  language: string,
  code: string,
  stableArgs: string[],
  compiler: string
): string {
  const codeHash = createHash('sha256').update(code, 'utf8').digest('hex')
  const argHash = createHash('sha256')
    .update(stableArgs.join('\n'))
    .update('\ncompiler=' + compiler)
    .update('\ncompilerVersion=' + compilerVersionFor(compiler))
    .digest('hex')
  return `${language}:${codeHash}:${argHash}`
}

const MAX_ENTRIES = 100

class CompileArtifactCache {
  private entries = new Map<string, CompileCacheEntry>()

  /** 命中并占用（refs++）。返回 undefined 表示未命中/失效。 */
  acquire(key: string, code: string): { compiledPath: string; sourceExt: string } | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined

    // 二次比对 + 产物存在性校验：任一不满足即失效，走重新编译
    if (entry.code !== code) {
      this.entries.delete(key)
      return undefined
    }
    if (!existsSync(entry.compiledPath)) {
      this.entries.delete(key)
      return undefined
    }

    // LRU：命中移到末尾
    this.entries.delete(key)
    this.entries.set(key, entry)
    entry.refs++
    // 刷新产物 mtime：避免 cleanupOldTempFiles 按 mtime>1h 误删正在被评测使用的产物
    try {
      const now = new Date()
      utimesSync(entry.compiledPath, now, now)
    } catch {
      // 忽略 touch 失败（文件可能刚好被外部清理）
    }
    return { compiledPath: entry.compiledPath, sourceExt: entry.sourceExt }
  }

  /** 写入新条目（refs=0，由调用方随后 acquire 占用）。若已有在用条目（并发编译相同代码）则不覆盖，避免引用计数错乱。 */
  put(key: string, entry: Omit<CompileCacheEntry, 'refs'>): void {
    const existing = this.entries.get(key)
    if (existing) {
      // 并发编译相同代码：旧条目仍在用，保留它（调用方会转而复用旧产物并清理自己的孤儿产物）
      if (existing.refs > 0) return
      // 旧条目已无引用：删除其产物文件后覆盖
      void this.removeArtifact(existing)
    }
    this.entries.set(key, { ...entry, refs: 0 })
    // 传入 protectKey，确保刚写入的条目不会被本次淘汰误删（随后 acquire 必须能命中它）
    this.evictIfNeeded(key)
  }

  /** 评测结束释放引用；释放后如超限则尝试淘汰 */
  release(key: string): void {
    const entry = this.entries.get(key)
    if (!entry) return
    entry.refs = Math.max(0, entry.refs - 1)
    this.evictIfNeeded()
  }

  private evictIfNeeded(protectKey?: string): void {
    if (this.entries.size <= MAX_ENTRIES) return
    // 按插入顺序（近似 LRU）淘汰 refs===0 的条目；在用条目与 protectKey 跳过
    for (const [k, e] of this.entries) {
      if (k === protectKey) continue
      if (e.refs > 0) continue
      this.entries.delete(k)
      void this.removeArtifact(e)
      logger.debug('编译缓存淘汰', { compiledPath: e.compiledPath })
      if (this.entries.size <= MAX_ENTRIES) return
    }
  }

  private async removeArtifact(entry: { compiledPath: string; sourceExt: string }): Promise<void> {
    const paths = [entry.compiledPath]
    if (entry.sourceExt) paths.push(entry.compiledPath + entry.sourceExt)
    for (const p of paths) {
      try {
        if (existsSync(p)) await unlink(p)
      } catch {
        // 文件可能已被 cleanupOldTempFiles 清理，忽略
      }
    }
  }
}

const cache = new CompileArtifactCache()

/** 命中缓存并占用；返回产物路径或 undefined */
export function acquireCompileCache(
  key: string,
  code: string
): { compiledPath: string; sourceExt: string } | undefined {
  return cache.acquire(key, code)
}

/** 写入缓存 */
export function putCompileCache(
  key: string,
  entry: Omit<CompileCacheEntry, 'refs'>
): void {
  cache.put(key, entry)
}

/** 释放缓存引用（评测结束调用） */
export function releaseCompileCache(key: string): void {
  cache.release(key)
}
