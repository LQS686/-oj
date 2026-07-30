// 输出比较模块
// 参考 Project LemonLime 的 judgingthread.cpp 中的比较函数
// 使用 Node.js ReadStream + Buffer 块扫描（O(n) 按行/按 token），禁止逐字符 async 扫描大输出
import { createReadStream } from 'fs'
import { Readable } from 'stream'
import type { CompareInput, CompareResult } from './types'

// 128 KiB 缓冲区，对齐 LemonLime BufferedStreamReader::BUFFER_SIZE (1 << 18)
const BUFFER_SIZE = 128 * 1024

// 浮点数格式正则，对齐 LemonLime compareRealNumbers 中 fscanf("%Lf") 的严格性：
// 拒绝 "3.14abc" 等带尾部垃圾的 token（parseFloat 会静默忽略尾部非数字字符）
const FLOAT_REGEX = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

const LF = 0x0a
const CR = 0x0d
const SPACE = 0x20
const TAB = 0x09

/**
 * 流式缓冲读取器（Buffer 版）
 * 参考 LemonLime BufferedStreamReader：按块读取，用 indexOf 找行/空白分隔，
 * 避免对百万行测点做「逐字符 + async」把 V8 堆打爆。
 */
class BufferedStreamReader {
  private stream: Readable
  private buffer: Buffer
  private pos: number
  private lineNumber: number
  private streamEnded: boolean

  constructor(stream: Readable) {
    this.stream = stream
    // 保持 Buffer 模式，勿 setEncoding
    this.buffer = Buffer.alloc(0)
    this.pos = 0
    this.lineNumber = 1
    this.streamEnded = false
  }

  private compact(): void {
    if (this.pos > 0) {
      this.buffer = this.buffer.subarray(this.pos)
      this.pos = 0
    }
  }

  private async ensureData(): Promise<void> {
    if (this.pos < this.buffer.length) return
    if (this.streamEnded) return

    const pull = (): Buffer | null => {
      // 关键：readable.read(n) 在缓冲不足 n 字节且未 end 时会返回 null。
      // 小文件（如样例）永远凑不齐 128KiB → 一直读到空。应按可读长度拉取。
      const available = this.stream.readableLength
      if (available > 0) {
        return this.stream.read(Math.min(BUFFER_SIZE, available)) as Buffer | null
      }
      if (this.stream.readableEnded) {
        return this.stream.read() as Buffer | null
      }
      // 未知可读长度时尝试一次不限长 read（paused 模式下取当前缓冲）
      return this.stream.read() as Buffer | null
    }

    if (this.stream.readableEnded) {
      this.compact()
      const rest = pull()
      if (rest !== null && rest.length > 0) {
        this.buffer = this.buffer.length === 0 ? rest : Buffer.concat([this.buffer, rest])
        return
      }
      this.streamEnded = true
      return
    }
    this.compact()

    let chunk = pull()
    if (chunk === null || chunk.length === 0) {
      await new Promise<void>((resolve) => {
        const onReadable = (): void => {
          this.stream.off('end', onEnd)
          resolve()
        }
        const onEnd = (): void => {
          this.stream.off('readable', onReadable)
          resolve()
        }
        this.stream.once('readable', onReadable)
        this.stream.once('end', onEnd)
        if (this.stream.readableLength > 0 || this.stream.readableEnded) {
          this.stream.off('readable', onReadable)
          this.stream.off('end', onEnd)
          resolve()
        }
      })
      chunk = pull()
      if ((chunk === null || chunk.length === 0) && this.stream.readableEnded) {
        this.streamEnded = true
        return
      }
    }
    if (chunk !== null && chunk.length > 0) {
      this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    }
  }

  async eof(): Promise<boolean> {
    await this.ensureData()
    return this.pos >= this.buffer.length && this.streamEnded
  }

  line(): number {
    return this.lineNumber
  }

  /** 消费一行结尾的 \r\n / \n / \r，并增加行号 */
  private async consumeNewlineAt(pos: number): Promise<number> {
    const ch = this.buffer[pos]
    if (ch === CR) {
      pos++
      if (pos >= this.buffer.length) {
        this.pos = pos
        await this.ensureData()
        pos = this.pos
      }
      if (pos < this.buffer.length && this.buffer[pos] === LF) {
        pos++
      }
    } else if (ch === LF) {
      pos++
    }
    this.lineNumber++
    return pos
  }

  // 读取直到换行符或末尾；返回 Buffer（调用方负责 trim/toString）
  async nextUntilNewLineBuf(maxLen = 1024): Promise<Buffer> {
    await this.ensureData()
    if (this.pos >= this.buffer.length && this.streamEnded) {
      return Buffer.alloc(0)
    }

    const parts: Buffer[] = []
    let taken = 0

    while (true) {
      await this.ensureData()
      if (this.pos >= this.buffer.length) {
        break
      }

      const slice = this.buffer.subarray(this.pos)
      const nl = slice.indexOf(LF)
      const cr = slice.indexOf(CR)
      let cut = -1
      if (nl >= 0 && cr >= 0) cut = Math.min(nl, cr)
      else if (nl >= 0) cut = nl
      else if (cr >= 0) cut = cr

      if (cut >= 0) {
        if (taken < maxLen) {
          const need = Math.min(cut, maxLen - taken)
          if (need > 0) parts.push(slice.subarray(0, need))
          taken += need
        }
        this.pos = await this.consumeNewlineAt(this.pos + cut)
        break
      }

      if (taken < maxLen) {
        const need = Math.min(slice.length, maxLen - taken)
        if (need > 0) parts.push(slice.subarray(0, need))
        taken += need
      }
      this.pos = this.buffer.length
      await this.ensureData()
      if (this.pos >= this.buffer.length && this.streamEnded) {
        break
      }
      if (taken >= maxLen) {
        continue
      }
    }

    if (parts.length === 0) return Buffer.alloc(0)
    if (parts.length === 1) return parts[0]
    return Buffer.concat(parts)
  }

  async nextUntilNewLine(maxLen = 1024): Promise<string> {
    const buf = await this.nextUntilNewLineBuf(maxLen)
    return buf.length === 0 ? '' : buf.toString('utf-8')
  }

  // 跳过前导空白后读取一个 token，最多 maxLen 字符
  async nextUntilSpace(maxLen = 256): Promise<string> {
    while (true) {
      await this.ensureData()
      if (this.pos >= this.buffer.length) break
      const ch = this.buffer[this.pos]
      if (ch === SPACE || ch === TAB) {
        this.pos++
      } else if (ch === CR || ch === LF) {
        this.pos = await this.consumeNewlineAt(this.pos)
      } else {
        break
      }
    }

    const parts: Buffer[] = []
    let taken = 0
    while (taken < maxLen) {
      await this.ensureData()
      if (this.pos >= this.buffer.length) break
      const slice = this.buffer.subarray(this.pos)
      let end = 0
      while (end < slice.length) {
        const c = slice[end]
        if (c === SPACE || c === TAB || c === CR || c === LF) break
        end++
        if (taken + end >= maxLen) break
      }
      if (end === 0) break
      const take = Math.min(end, maxLen - taken)
      parts.push(slice.subarray(0, take))
      taken += take
      this.pos += take
      if (take < end) break // hit maxLen
      // 若停在空白前，下一轮 while 会 break；若本块扫完非空白，继续
      if (this.pos < this.buffer.length) {
        const c = this.buffer[this.pos]
        if (c === SPACE || c === TAB || c === CR || c === LF) break
      }
    }

    if (parts.length === 0) return ''
    if (parts.length === 1) return parts[0].toString('utf-8')
    return Buffer.concat(parts).toString('utf-8')
  }
}

/** 惰性字符串 → Buffer 流 */
function createStringStream(data: string): Readable {
  let offset = 0
  return new Readable({
    read(size) {
      if (offset >= data.length) {
        this.push(null)
        return
      }
      const end = Math.min(offset + Math.max(size || BUFFER_SIZE, 1), data.length)
      const chunk = Buffer.from(data.slice(offset, end), 'utf-8')
      offset = end
      this.push(chunk)
    },
  })
}

function openCompareStream(path: string | undefined, fallback: string | undefined, label: string): Readable {
  if (path) {
    return createReadStream(path, { highWaterMark: BUFFER_SIZE })
  }
  if (typeof fallback === 'string') {
    return createStringStream(fallback)
  }
  throw new Error(`compareOutput: 缺少 ${label}（需提供文件路径或字符串）`)
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

/** 去掉行尾空格/制表符（对齐 trimEnd），不分配字符串 */
function trimEndBuf(buf: Buffer): Buffer {
  let end = buf.length
  while (end > 0) {
    const c = buf[end - 1]
    if (c === SPACE || c === TAB) end--
    else break
  }
  return end === buf.length ? buf : buf.subarray(0, end)
}

function buffersEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && (a.length === 0 || a.equals(b))
}

async function compareDefault(
  userReader: BufferedStreamReader,
  stdReader: BufferedStreamReader,
  fullScore: number,
): Promise<CompareResult> {
  while (true) {
    const lineNum = userReader.line()
    const userLine = trimEndBuf(await userReader.nextUntilNewLineBuf())
    const stdLine = trimEndBuf(await stdReader.nextUntilNewLineBuf())
    const userEof = await userReader.eof()
    const stdEof = await stdReader.eof()

    if (!buffersEqual(userLine, stdLine)) {
      return {
        score: 0,
        status: 'WA',
        message: `第 ${lineNum} 行，期望 "${truncate(stdLine.toString('utf-8'), 64)}" 但得到 "${truncate(userLine.toString('utf-8'), 64)}"`,
      }
    }
    if (userEof && stdEof) {
      return { score: fullScore, status: 'AC', message: '' }
    }
  }
}

async function compareStrict(
  userReader: BufferedStreamReader,
  stdReader: BufferedStreamReader,
  fullScore: number,
): Promise<CompareResult> {
  while (true) {
    const userEof = await userReader.eof()
    const stdEof = await stdReader.eof()

    if (userEof && stdEof) {
      return { score: fullScore, status: 'AC', message: '' }
    }
    if (userEof && !stdEof) {
      return { score: 0, status: 'WA', message: `第 ${stdReader.line()} 行，选手输出内容不足` }
    }
    if (!userEof && stdEof) {
      return { score: 0, status: 'OLE', message: `第 ${userReader.line()} 行，选手输出内容过多` }
    }

    const lineNum = userReader.line()
    const userLine = await userReader.nextUntilNewLineBuf()
    const stdLine = await stdReader.nextUntilNewLineBuf()

    if (!buffersEqual(userLine, stdLine)) {
      return {
        score: 0,
        status: 'WA',
        message: `第 ${lineNum} 行，期望 "${truncate(stdLine.toString('utf-8'), 64)}" 但得到 "${truncate(userLine.toString('utf-8'), 64)}"`,
      }
    }
  }
}

async function compareIgnoreSpaces(
  userReader: BufferedStreamReader,
  stdReader: BufferedStreamReader,
  fullScore: number,
): Promise<CompareResult> {
  while (true) {
    const userToken = await userReader.nextUntilSpace()
    const stdToken = await stdReader.nextUntilSpace()

    if (userToken === stdToken) {
      const userEof = await userReader.eof()
      const stdEof = await stdReader.eof()
      if (userEof && stdEof) {
        return { score: fullScore, status: 'AC', message: '' }
      }
      if (userReader.line() !== stdReader.line()) {
        return { score: 0, status: 'PE', message: `第 ${userReader.line()} 行格式错误` }
      }
      continue
    }

    const userEmpty = userToken === '' && (await userReader.eof())
    const stdEmpty = stdToken === '' && (await stdReader.eof())

    if (userEmpty && !stdEmpty) {
      return { score: 0, status: 'WA', message: `第 ${stdReader.line()} 行，选手输出内容不足` }
    }
    if (stdEmpty && !userEmpty) {
      return { score: 0, status: 'OLE', message: `第 ${userReader.line()} 行，选手输出内容过多` }
    }

    return {
      score: 0,
      status: 'WA',
      message: `第 ${userReader.line()} 行，期望 "${stdToken}" 但得到 "${userToken}"`,
    }
  }
}

async function compareRealNumbers(
  userReader: BufferedStreamReader,
  stdReader: BufferedStreamReader,
  fullScore: number,
  realPrecision = 3,
): Promise<CompareResult> {
  const eps = Math.pow(10, -realPrecision)
  while (true) {
    const userToken = await userReader.nextUntilSpace()
    const stdToken = await stdReader.nextUntilSpace()

    const userEmpty = userToken === '' && (await userReader.eof())
    const stdEmpty = stdToken === '' && (await stdReader.eof())

    if (userEmpty && stdEmpty) {
      return { score: fullScore, status: 'AC', message: '' }
    }
    if (userEmpty && !stdEmpty) {
      return { score: 0, status: 'WA', message: `第 ${stdReader.line()} 行，选手输出内容不足` }
    }
    if (!userEmpty && stdEmpty) {
      return { score: 0, status: 'OLE', message: `第 ${userReader.line()} 行，选手输出内容过多` }
    }

    if (userToken.length > 0 && !FLOAT_REGEX.test(userToken)) {
      return { score: 0, status: 'WA', message: `第 ${userReader.line()} 行，无效的数字格式: ${userToken}` }
    }
    if (stdToken.length > 0 && !FLOAT_REGEX.test(stdToken)) {
      return { score: 0, status: 'WA', message: `第 ${stdReader.line()} 行，标准答案含无效数字格式: ${stdToken}` }
    }

    const a = parseFloat(userToken)
    const b = parseFloat(stdToken)

    if (Number.isNaN(a) !== Number.isNaN(b) || Number.isFinite(a) !== Number.isFinite(b)) {
      return { score: 0, status: 'WA', message: `第 ${userReader.line()} 行，期望 ${b} 但得到 ${a}` }
    }

    if (Math.abs(a - b) <= Math.max(eps, eps * Math.abs(b))) {
      continue
    }
    return { score: 0, status: 'WA', message: `第 ${userReader.line()} 行，期望 ${b} 但得到 ${a}` }
  }
}

// 比较调度入口（双方均为文件时走同步比对，避免百万行 Promise OOM）
export async function compareOutput(input: CompareInput): Promise<CompareResult> {
  if (input.userOutputPath && input.expectedOutputPath) {
    // 让出事件循环，使并行测点的其它 child 能完成调度
    await new Promise<void>((r) => setImmediate(r))
    const { compareFilesSync } = await import('./comparator-sync-file')
    return compareFilesSync(
      input.userOutputPath,
      input.expectedOutputPath,
      input.fullScore,
      input.comparisonMode,
      input.realPrecision ?? 3,
    )
  }

  const userStream = openCompareStream(input.userOutputPath, input.userOutput, 'userOutput')
  const stdStream = openCompareStream(input.expectedOutputPath, input.expectedOutput, 'expectedOutput')
  const userReader = new BufferedStreamReader(userStream)
  const stdReader = new BufferedStreamReader(stdStream)
  try {
    switch (input.comparisonMode) {
      case 'strict':
        return await compareStrict(userReader, stdReader, input.fullScore)
      case 'ignore-spaces':
        return await compareIgnoreSpaces(userReader, stdReader, input.fullScore)
      case 'real-number':
        return await compareRealNumbers(userReader, stdReader, input.fullScore, input.realPrecision ?? 3)
      case 'default':
      default:
        return await compareDefault(userReader, stdReader, input.fullScore)
    }
  } finally {
    userStream.destroy()
    stdStream.destroy()
  }
}
