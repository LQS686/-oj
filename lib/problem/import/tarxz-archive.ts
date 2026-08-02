/**
 * lib/problem/import/tarxz-archive.ts
 * tar.xz 题包解压适配器
 *
 * 将 tar.xz buffer 解压为内存中的文件列表，包装为 ArchiveLike 接口，
 * 复用 dsoj-parser 的 parseDsojArchive 主体逻辑，无需为 tar.xz 重复实现解析。
 *
 * 链路：Buffer → spawn('xz -d') stdin → stdout → tar Extract → InMemoryArchiveEntry[]
 *
 * 依赖：
 *   - 系统 xz 命令（debian-slim 自带 xz-utils；避免 lzma-native native 编译开销）
 *   - tar-stream v3（entry 回调风格：header, stream, next）
 *
 * 内存模型：
 *   - 所有条目全部读入内存，受 IMPORT_MAX_FILE_BYTES（50MB）限制，无 OOM 风险
 *   - 与 AdmZip 一致：getData() 可重复调用且无解码开销（直接返回持有的 Buffer）
 */
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import { extract as tarExtract } from 'tar-stream'
import type { Headers as TarHeaders } from 'tar-stream'
import { ApiError } from '@/lib/api/errors'
import type { ArchiveEntry, ArchiveLike } from './dsoj-parser'

/* ============================================================================
 * 魔数与格式检测
 * ========================================================================== */

/** XZ 文件魔数：FD 37 7A 58 5A 00（即 "\xFD7zXZ\x00"） */
const XZ_MAGIC = Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])

/** ZIP 文件魔数前两字节："PK"（0x50 0x4B） */
const ZIP_MAGIC_0 = 0x50
const ZIP_MAGIC_1 = 0x4b

/** 归档格式检测结果 */
export type DsojArchiveKind = 'zip' | 'tar.xz' | 'unknown'

/**
 * 检测 buffer 的归档格式
 *
 * 仅靠魔数前缀判断，不解压、不读全量，开销极低：
 *   - ZIP：0x50 0x4B（"PK"）
 *   - XZ：0xFD 0x37 0x7A 0x58 0x5A 0x00（"\xFD7zXZ\x00"）
 *
 * 用于导入入口（execute.ts）按格式分派到 AdmZip 或 tar.xz 适配器。
 */
export function detectArchiveFormat(buf: Buffer): DsojArchiveKind {
  if (!buf || buf.length < 4) return 'unknown'
  if (buf[0] === ZIP_MAGIC_0 && buf[1] === ZIP_MAGIC_1) return 'zip'
  if (buf.length >= XZ_MAGIC.length && buf.subarray(0, XZ_MAGIC.length).equals(XZ_MAGIC)) {
    return 'tar.xz'
  }
  return 'unknown'
}

/* ============================================================================
 * InMemoryArchive：内存中的归档条目列表，实现 ArchiveLike
 * ========================================================================== */

/** 内存归档条目：直接持有 Buffer，getData 可重复调用且零解码开销 */
class InMemoryArchiveEntry implements ArchiveEntry {
  private readonly name: string
  private readonly dir: boolean
  private readonly data: Buffer

  constructor(name: string, isDirectory: boolean, data: Buffer) {
    this.name = name
    this.dir = isDirectory
    this.data = data
  }

  get entryName(): string {
    return this.name
  }

  get isDirectory(): boolean {
    return this.dir
  }

  getData(): Buffer {
    return this.data
  }
}

/**
 * 内存归档：把解压后的 (路径, Buffer) 列表包装为 ArchiveLike
 *
 * 与 AdmZip 行为对齐：
 *   - getEntries() 返回全部条目（含目录）
 *   - getEntry(name) 按完整 entryName 精确匹配（路径分隔符统一为 /）
 */
export class InMemoryArchive implements ArchiveLike {
  private readonly entries: ArchiveEntry[]
  private readonly byName: Map<string, ArchiveEntry>

  constructor(entries: ArchiveEntry[]) {
    this.entries = entries
    this.byName = new Map<string, ArchiveEntry>()
    for (const e of entries) {
      const name = e.entryName.replace(/\\/g, '/')
      // 重复条目以首次出现为准（与 ZIP 扫描顺序一致）
      if (!this.byName.has(name)) {
        this.byName.set(name, e)
      }
    }
  }

  getEntries(): ArchiveEntry[] {
    return this.entries
  }

  getEntry(name: string): ArchiveEntry | null {
    return this.byName.get(name.replace(/\\/g, '/')) ?? null
  }
}

/* ============================================================================
 * 解压入口
 * ========================================================================== */

/**
 * 解压 tar.xz buffer 为 InMemoryArchive
 *
 * @param buffer tar.xz 文件内容
 * @returns 实现了 ArchiveLike 的内存归档对象，可直接传给 parseDsojArchive
 * @throws ApiError 内容为空、魔数不匹配、解压或 tar 解析失败
 */
export async function parseTarXzBuffer(buffer: Buffer): Promise<ArchiveLike> {
  if (!buffer || buffer.length === 0) {
    throw new ApiError('INVALID_DSOJ_TARXZ', 'DSOJ tar.xz 题包内容为空', 400)
  }

  // 魔数校验：防止误传非 xz 文件给 xz 进程，避免解码失败抛出含糊错误
  if (buffer.length < XZ_MAGIC.length || !buffer.subarray(0, XZ_MAGIC.length).equals(XZ_MAGIC)) {
    throw new ApiError('INVALID_DSOJ_TARXZ', '不是有效的 tar.xz 文件（缺少 XZ 魔数）', 400)
  }

  const entries: ArchiveEntry[] = []

  await new Promise<void>((resolve, reject) => {
    // xz -d: 解压到 stdout；-c: 写入 stdout（与 dsoj-exporter 的 -c 对称）
    // 注意：xz 单独 -d 默认就地解压到文件，必须显式 -c 输出到 stdout
    const xz = spawn('xz', ['-d', '-c'], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    const tar = tarExtract()

    let settled = false
    const fail = (err: unknown): void => {
      if (settled) return
      settled = true
      // 用 destroy 而非 removeAllListeners：destroy 让流安全关闭，
      // 避免 pipe 链中残留 error 事件因无 listener 而抛 uncaught exception；
      // destroy 不传参时只触发 'close'，不触发 'error'，也不会让 tar 卡在等 next()
      try {
        xz.kill('SIGKILL')
      } catch {
        // ignore kill errors on already-exited process
      }
      tar.destroy()
      reject(err)
    }
    const done = (): void => {
      if (settled) return
      settled = true
      resolve()
    }

    tar.on('entry', (header: TarHeaders, stream: NodeJS.ReadableStream, next: () => void) => {
      const name = String(header.name || '').replace(/\\/g, '/')
      const isDir = header.type === 'directory'
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('error', (err: unknown) => {
        // 先推进入参 next 让 tar-stream 释放当前条目，再 fail 终止整体流程
        next()
        fail(err)
      })
      stream.on('end', () => {
        if (name) {
          entries.push(new InMemoryArchiveEntry(name, isDir, Buffer.concat(chunks)))
        }
        // tar-stream v3：必须调用 next() 才会继续下一个条目
        next()
      })
    })

    // 完成条件：tar 流结束 AND xz 进程退出码 0
    // 不能只看 tar 'finish' 就 resolve：xz 可能还没退出，若随后异常退出，
    // fail() 会因 settled=true 被吞，导致静默产出不完整数据。
    // 也不能只看 xz 'close' 就 resolve：tar 可能还在异步处理最后几个 entry。
    let tarFinished = false
    let xzExitCode: number | null | undefined = undefined
    const tryComplete = (): void => {
      if (tarFinished && xzExitCode !== undefined) {
        if (xzExitCode === 0) done()
        else fail(new Error(`xz 解压进程异常退出，exit code: ${xzExitCode}`))
      }
    }

    tar.on('finish', () => {
      tarFinished = true
      tryComplete()
    })
    tar.on('error', fail)
    xz.on('error', fail)
    // xz 进程退出：exit code 0 = 成功，非 0 = 解码失败（数据损坏、非 xz 内容等）
    xz.on('close', (code: number | null) => {
      xzExitCode = code
      tryComplete()
    })

    // 输入：buffer → xz stdin；输出：xz stdout → tar
    // xz.stdin 在数据写完后 end，触发 xz 处理并输出到 stdout
    xz.stdin.on('error', fail)
    xz.stdout!.on('error', fail)
    xz.stdout!.pipe(tar)
    Readable.from([buffer]).pipe(xz.stdin)
  })

  return new InMemoryArchive(entries)
}
