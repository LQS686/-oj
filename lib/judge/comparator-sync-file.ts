/**
 * 同步文件比对（fs.readSync）
 *
 * 百万行测点禁止「每行一个 await」：1e6 次 Promise/微任务会在与 Next 同进程时把堆打到 OOM。
 * 固定读缓冲 + 可复用行缓冲，峰值 O(BUFFER)，接近顺序读盘速度。
 */
import { closeSync, openSync, readSync, statSync } from 'fs'
import { createHash } from 'crypto'
import type { CompareResult, ComparisonMode } from './types'

const READ_SIZE = 256 * 1024
const LINE_CAP = 1024
const TOKEN_CAP = 256

const LF = 0x0a
const CR = 0x0d
const SPACE = 0x20
const TAB = 0x09

const FLOAT_REGEX = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

function trimEndLen(buf: Buffer, len: number): number {
  let e = len
  while (e > 0) {
    const c = buf[e - 1]
    if (c === SPACE || c === TAB) e--
    else break
  }
  return e
}

function bufEqual(a: Buffer, aLen: number, b: Buffer, bLen: number): boolean {
  if (aLen !== bLen) return false
  for (let i = 0; i < aLen; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

class SyncFileReader {
  private fd: number
  private buf: Buffer
  private len = 0
  private pos = 0
  private fileEnded = false
  private lineNumber = 1
  private closed = false
  /** 可复用行缓冲，避免每行 new Buffer */
  readonly lineBuf: Buffer = Buffer.allocUnsafe(LINE_CAP)

  constructor(filePath: string) {
    this.fd = openSync(filePath, 'r')
    this.buf = Buffer.allocUnsafe(READ_SIZE)
  }

  line(): number {
    return this.lineNumber
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      closeSync(this.fd)
    } catch {
      // ignore
    }
  }

  private fill(): void {
    if (this.fileEnded) return
    if (this.pos > 0 && this.pos < this.len) {
      this.buf.copyWithin(0, this.pos, this.len)
      this.len -= this.pos
      this.pos = 0
    } else if (this.pos >= this.len) {
      this.pos = 0
      this.len = 0
    }
    const space = this.buf.length - this.len
    if (space <= 0) return
    const n = readSync(this.fd, this.buf, this.len, space, null)
    if (n === 0) {
      this.fileEnded = true
      return
    }
    this.len += n
  }

  eof(): boolean {
    if (this.pos < this.len) return false
    this.fill()
    return this.pos >= this.len && this.fileEnded
  }

  private consumeNewline(): void {
    if (this.pos >= this.len) this.fill()
    if (this.pos >= this.len) {
      this.lineNumber++
      return
    }
    if (this.buf[this.pos] === CR) {
      this.pos++
      if (this.pos >= this.len) this.fill()
      if (this.pos < this.len && this.buf[this.pos] === LF) this.pos++
    } else if (this.buf[this.pos] === LF) {
      this.pos++
    }
    this.lineNumber++
  }

  /**
   * 读一行到 this.lineBuf，返回有效字节长度。
   * 空文件/已 EOF 且无残留 → 返回 0 且 eof() 为 true。
   * 超长行截断到 LINE_CAP，并丢弃至行尾。
   */
  readLine(): number {
    if (this.eof()) return 0

    let copied = 0
    for (;;) {
      if (this.pos >= this.len) {
        this.fill()
        if (this.pos >= this.len) {
          return copied
        }
      }

      const slice = this.buf.subarray(this.pos, this.len)
      const nl = slice.indexOf(LF)
      const cr = slice.indexOf(CR)
      let rel = -1
      if (nl >= 0 && cr >= 0) rel = Math.min(nl, cr)
      else if (nl >= 0) rel = nl
      else if (cr >= 0) rel = cr

      if (rel >= 0) {
        const cut = this.pos + rel
        const avail = cut - this.pos
        const need = Math.min(avail, LINE_CAP - copied)
        if (need > 0) {
          this.buf.copy(this.lineBuf, copied, this.pos, this.pos + need)
          copied += need
        }
        this.pos = cut
        this.consumeNewline()
        return copied
      }

      const avail = this.len - this.pos
      const need = Math.min(avail, LINE_CAP - copied)
      if (need > 0) {
        this.buf.copy(this.lineBuf, copied, this.pos, this.pos + need)
        copied += need
      }
      this.pos = this.len

      if (copied >= LINE_CAP) {
        for (;;) {
          if (this.pos >= this.len) {
            this.fill()
            if (this.pos >= this.len) {
              this.lineNumber++
              return copied
            }
          }
          const s2 = this.buf.subarray(this.pos, this.len)
          const nli = s2.indexOf(LF)
          const cri = s2.indexOf(CR)
          let r2 = -1
          if (nli >= 0 && cri >= 0) r2 = Math.min(nli, cri)
          else if (nli >= 0) r2 = nli
          else if (cri >= 0) r2 = cri
          if (r2 >= 0) {
            this.pos = this.pos + r2
            this.consumeNewline()
            return copied
          }
          this.pos = this.len
        }
      }
    }
  }

  nextToken(): string {
    for (;;) {
      if (this.eof()) return ''
      const c = this.buf[this.pos]
      if (c === SPACE || c === TAB) {
        this.pos++
        continue
      }
      if (c === CR || c === LF) {
        this.consumeNewline()
        continue
      }
      break
    }

    let out = ''
    let taken = 0
    while (taken < TOKEN_CAP) {
      if (this.eof()) break
      const c = this.buf[this.pos]
      if (c === SPACE || c === TAB || c === CR || c === LF) break
      const start = this.pos
      let p = this.pos + 1
      while (p < this.len && taken + (p - start) < TOKEN_CAP) {
        const ch = this.buf[p]
        if (ch === SPACE || ch === TAB || ch === CR || ch === LF) break
        p++
      }
      out += this.buf.toString('utf-8', start, p)
      taken += p - start
      this.pos = p
      if (this.pos < this.len) break
    }
    return out
  }
}

/** 同步流式 SHA1；大文件 AC 快路径用 */
function sha1FileSync(filePath: string): string {
  const h = createHash('sha1')
  const fd = openSync(filePath, 'r')
  const buf = Buffer.allocUnsafe(1024 * 1024)
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null)
      if (n <= 0) break
      h.update(n === buf.length ? buf : buf.subarray(0, n))
    }
  } finally {
    closeSync(fd)
  }
  return h.digest('hex')
}

/**
 * 字节级完全一致 → AC（跳过逐行解析）。
 * 正解输出通常与标准答案文件一致；WA 再走完整比对。
 * 仅对较大文件启用（小文件逐行本身很快）。
 */
function tryHashFastAc(
  userPath: string,
  stdPath: string,
  fullScore: number,
  minBytes = 64 * 1024,
): CompareResult | null {
  try {
    const us = statSync(userPath).size
    const ss = statSync(stdPath).size
    if (us !== ss) return null
    if (us < minBytes) return null
    if (sha1FileSync(userPath) === sha1FileSync(stdPath)) {
      return { score: fullScore, status: 'AC', message: '' }
    }
  } catch {
    // ignore → fall through
  }
  return null
}

export function compareFilesSync(
  userPath: string,
  stdPath: string,
  fullScore: number,
  mode: ComparisonMode,
  realPrecision = 3,
): CompareResult {
  // default / strict：先尝试哈希快路径（ignore-spaces / real-number 语义不能用原始哈希）
  if (mode === 'default' || mode === 'strict' || !mode) {
    const fast = tryHashFastAc(userPath, stdPath, fullScore)
    if (fast) return fast
  }

  const user = new SyncFileReader(userPath)
  const std = new SyncFileReader(stdPath)
  try {
    switch (mode) {
      case 'strict':
        return compareStrict(user, std, fullScore)
      case 'ignore-spaces':
        return compareIgnoreSpaces(user, std, fullScore)
      case 'real-number':
        return compareRealNumbers(user, std, fullScore, realPrecision)
      case 'default':
      default:
        return compareDefault(user, std, fullScore)
    }
  } finally {
    user.close()
    std.close()
  }
}

function compareDefault(user: SyncFileReader, std: SyncFileReader, fullScore: number): CompareResult {
  for (;;) {
    const lineNum = user.line()
    const uLen = user.readLine()
    const sLen = std.readLine()
    const uTrim = trimEndLen(user.lineBuf, uLen)
    const sTrim = trimEndLen(std.lineBuf, sLen)
    const userEof = user.eof()
    const stdEof = std.eof()

    if (!bufEqual(user.lineBuf, uTrim, std.lineBuf, sTrim)) {
      return {
        score: 0,
        status: 'WA',
        message: `第 ${lineNum} 行，期望 "${truncate(std.lineBuf.toString('utf-8', 0, sTrim), 64)}" 但得到 "${truncate(user.lineBuf.toString('utf-8', 0, uTrim), 64)}"`,
      }
    }
    if (userEof && stdEof) {
      return { score: fullScore, status: 'AC', message: '' }
    }
  }
}

function compareStrict(user: SyncFileReader, std: SyncFileReader, fullScore: number): CompareResult {
  for (;;) {
    const userEof = user.eof()
    const stdEof = std.eof()
    if (userEof && stdEof) return { score: fullScore, status: 'AC', message: '' }
    if (userEof && !stdEof) return { score: 0, status: 'WA', message: `第 ${std.line()} 行，选手输出内容不足` }
    if (!userEof && stdEof) return { score: 0, status: 'OLE', message: `第 ${user.line()} 行，选手输出内容过多` }

    const lineNum = user.line()
    const uLen = user.readLine()
    const sLen = std.readLine()
    if (!bufEqual(user.lineBuf, uLen, std.lineBuf, sLen)) {
      return {
        score: 0,
        status: 'WA',
        message: `第 ${lineNum} 行，期望 "${truncate(std.lineBuf.toString('utf-8', 0, sLen), 64)}" 但得到 "${truncate(user.lineBuf.toString('utf-8', 0, uLen), 64)}"`,
      }
    }
  }
}

function compareIgnoreSpaces(user: SyncFileReader, std: SyncFileReader, fullScore: number): CompareResult {
  for (;;) {
    const userToken = user.nextToken()
    const stdToken = std.nextToken()
    if (userToken === stdToken) {
      if (user.eof() && std.eof()) return { score: fullScore, status: 'AC', message: '' }
      if (user.line() !== std.line()) {
        return { score: 0, status: 'PE', message: `第 ${user.line()} 行格式错误` }
      }
      continue
    }
    const userEmpty = userToken === '' && user.eof()
    const stdEmpty = stdToken === '' && std.eof()
    if (userEmpty && !stdEmpty) return { score: 0, status: 'WA', message: `第 ${std.line()} 行，选手输出内容不足` }
    if (stdEmpty && !userEmpty) return { score: 0, status: 'OLE', message: `第 ${user.line()} 行，选手输出内容过多` }
    return {
      score: 0,
      status: 'WA',
      message: `第 ${user.line()} 行，期望 "${stdToken}" 但得到 "${userToken}"`,
    }
  }
}

function compareRealNumbers(
  user: SyncFileReader,
  std: SyncFileReader,
  fullScore: number,
  realPrecision: number,
): CompareResult {
  const eps = Math.pow(10, -realPrecision)
  for (;;) {
    const userToken = user.nextToken()
    const stdToken = std.nextToken()
    const userEmpty = userToken === '' && user.eof()
    const stdEmpty = stdToken === '' && std.eof()
    if (userEmpty && stdEmpty) return { score: fullScore, status: 'AC', message: '' }
    if (userEmpty && !stdEmpty) return { score: 0, status: 'WA', message: `第 ${std.line()} 行，选手输出内容不足` }
    if (!userEmpty && stdEmpty) return { score: 0, status: 'OLE', message: `第 ${user.line()} 行，选手输出内容过多` }
    if (userToken.length > 0 && !FLOAT_REGEX.test(userToken)) {
      return { score: 0, status: 'WA', message: `第 ${user.line()} 行，无效的数字格式: ${userToken}` }
    }
    if (stdToken.length > 0 && !FLOAT_REGEX.test(stdToken)) {
      return { score: 0, status: 'WA', message: `第 ${std.line()} 行，标准答案含无效数字格式: ${stdToken}` }
    }
    const a = parseFloat(userToken)
    const b = parseFloat(stdToken)
    if (Number.isNaN(a) !== Number.isNaN(b) || Number.isFinite(a) !== Number.isFinite(b)) {
      return { score: 0, status: 'WA', message: `第 ${user.line()} 行，期望 ${b} 但得到 ${a}` }
    }
    if (Math.abs(a - b) <= Math.max(eps, eps * Math.abs(b))) continue
    return { score: 0, status: 'WA', message: `第 ${user.line()} 行，期望 ${b} 但得到 ${a}` }
  }
}
