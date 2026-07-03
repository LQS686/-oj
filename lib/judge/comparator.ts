// 输出比较模块
// 参考 Project LemonLime 的 judgingthread.cpp 中的比较函数
// 使用 Node.js ReadStream + 128KB 缓冲区逐块比较（对应 LemonLime BufferedStreamReader）
import { Readable } from 'stream'
import type { CompareInput, CompareResult } from './types'

// 128 KiB 缓冲区，对齐 LemonLime BufferedStreamReader::BUFFER_SIZE (1 << 18)
const BUFFER_SIZE = 128 * 1024

/**
 * 流式缓冲读取器
 * 参考 LemonLime 的 BufferedStreamReader，包装 Node.js Readable，
 * 以 BUFFER_SIZE 为单位逐块读取，逐字符处理，不使用 split()。
 */
class BufferedStreamReader {
  private stream: Readable
  private buffer: string
  private pos: number
  private lineNumber: number
  private streamEnded: boolean

  constructor(stream: Readable) {
    this.stream = stream
    this.stream.setEncoding('utf-8')
    this.buffer = ''
    this.pos = 0
    this.lineNumber = 1
    this.streamEnded = false
  }

  // 必要时从流中加载下一块数据
  private async ensureData(): Promise<void> {
    if (this.pos < this.buffer.length) return
    if (this.streamEnded) return
    if (this.stream.readableEnded) {
      this.streamEnded = true
      return
    }
    // 紧凑缓冲区：丢弃已消费前缀，重置 pos
    if (this.pos > 0) {
      this.buffer = this.buffer.slice(this.pos)
      this.pos = 0
    }
    // 尝试同步读取一块
    let chunk = this.stream.read()
    if (chunk === null) {
      if (this.stream.readableEnded) {
        this.streamEnded = true
        return
      }
      // 暂无数据可读，等待 'readable' 或 'end' 事件
      await new Promise<void>((resolve) => {
        const onReadable = (): void => {
          this.stream.off('end', onEnd)
          resolve()
        }
        const onEnd = (): void => {
          this.stream.off('readable', onReadable)
          this.streamEnded = true
          resolve()
        }
        this.stream.once('readable', onReadable)
        this.stream.once('end', onEnd)
      })
      if (this.streamEnded) return
      chunk = this.stream.read()
    }
    if (chunk !== null) {
      this.buffer += chunk
    }
  }

  // 是否已读到末尾
  async eof(): Promise<boolean> {
    await this.ensureData()
    return this.pos >= this.buffer.length && this.streamEnded
  }

  // 当前行号
  line(): number {
    return this.lineNumber
  }

  // 读取直到换行符或末尾，处理 \r\n / \n / \r 行尾，每行最多 maxLen 字符
  async nextUntilNewLine(maxLen = 1024): Promise<string> {
    let result = ''
    while (result.length < maxLen) {
      await this.ensureData()
      if (this.pos >= this.buffer.length) {
        break
      }
      const ch = this.buffer[this.pos]
      if (ch === '\r' || ch === '\n') {
        if (ch === '\r') {
          this.pos++
          await this.ensureData()
          if (this.pos < this.buffer.length && this.buffer[this.pos] === '\n') {
            this.pos++
          }
        } else {
          this.pos++
        }
        this.lineNumber++
        break
      }
      result += ch
      this.pos++
    }
    return result
  }

  // 跳过前导空白后读取一个 token，最多 maxLen 字符
  async nextUntilSpace(maxLen = 256): Promise<string> {
    // 跳过前导空白（空格、制表符、\r、\n，换行会增加行号）
    while (true) {
      await this.ensureData()
      if (this.pos >= this.buffer.length) break
      const ch = this.buffer[this.pos]
      if (ch === ' ' || ch === '\t') {
        this.pos++
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r') {
          this.pos++
          await this.ensureData()
          if (this.pos < this.buffer.length && this.buffer[this.pos] === '\n') {
            this.pos++
          }
        } else {
          this.pos++
        }
        this.lineNumber++
      } else {
        break
      }
    }
    // 读取非空白字符
    let result = ''
    while (result.length < maxLen) {
      await this.ensureData()
      if (this.pos >= this.buffer.length) break
      const ch = this.buffer[this.pos]
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') break
      result += ch
      this.pos++
    }
    return result
  }
}

// 将字符串切分为 BUFFER_SIZE 大小的块，构造为 Readable 流，提供流式语义
function createStringStream(data: string): Readable {
  const chunks: string[] = []
  for (let i = 0; i < data.length; i += BUFFER_SIZE) {
    chunks.push(data.slice(i, i + BUFFER_SIZE))
  }
  return Readable.from(chunks)
}

// 截断字符串到指定长度
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

// 默认比较（NOI 模式）：逐行 trimEnd，仅跳过尾部空行，与旧 normalize 实现等价
async function compareDefault(
  userReader: BufferedStreamReader,
  stdReader: BufferedStreamReader,
  fullScore: number,
): Promise<CompareResult> {
  while (true) {
    const lineNum = userReader.line()
    const userLine = (await userReader.nextUntilNewLine()).trimEnd()
    const stdLine = (await stdReader.nextUntilNewLine()).trimEnd()
    const userEof = await userReader.eof()
    const stdEof = await stdReader.eof()

    if (userLine !== stdLine) {
      return {
        score: 0,
        status: 'WA',
        message: `第 ${lineNum} 行，期望 "${truncate(stdLine, 64)}" 但得到 "${truncate(userLine, 64)}"`,
      }
    }
    if (userEof && stdEof) {
      return { score: fullScore, status: 'AC', message: '' }
    }
  }
}

// 严格比较（逐行字节精确匹配，不规范化）
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
      // 选手输出行数不足
      return { score: 0, status: 'WA', message: `第 ${stdReader.line()} 行，选手输出内容不足` }
    }
    if (!userEof && stdEof) {
      // 选手输出行数过多
      return { score: 0, status: 'OLE', message: `第 ${userReader.line()} 行，选手输出内容过多` }
    }

    const lineNum = userReader.line()
    const userLine = await userReader.nextUntilNewLine()
    const stdLine = await stdReader.nextUntilNewLine()

    if (userLine !== stdLine) {
      return {
        score: 0,
        status: 'WA',
        message: `第 ${lineNum} 行，期望 "${truncate(stdLine, 64)}" 但得到 "${truncate(userLine, 64)}"`,
      }
    }
  }
}

// 忽略空白比较（按 token 比较，忽略所有空白差异）
async function compareIgnoreSpaces(
  userReader: BufferedStreamReader,
  stdReader: BufferedStreamReader,
  fullScore: number,
): Promise<CompareResult> {
  while (true) {
    const userToken = await userReader.nextUntilSpace()
    const stdToken = await stdReader.nextUntilSpace()

    if (userToken === stdToken) {
      // token 相同
      const userEof = await userReader.eof()
      const stdEof = await stdReader.eof()
      if (userEof && stdEof) {
        // 均到末尾，检查行号是否一致
        if (userReader.line() !== stdReader.line()) {
          return { score: 0, status: 'PE', message: `第 ${Math.max(userReader.line(), stdReader.line())} 行格式错误` }
        }
        return { score: fullScore, status: 'AC', message: '' }
      }
      continue
    }

    // token 不同
    const userEmpty = userToken === '' && (await userReader.eof())
    const stdEmpty = stdToken === '' && (await stdReader.eof())

    if (userEmpty && !stdEmpty) {
      // 选手内容不足
      return { score: 0, status: 'WA', message: `第 ${stdReader.line()} 行，选手输出内容不足` }
    }
    if (stdEmpty && !userEmpty) {
      // 选手内容过多
      return { score: 0, status: 'OLE', message: `第 ${userReader.line()} 行，选手输出内容过多` }
    }

    // token 实质不同
    return {
      score: 0,
      status: 'WA',
      message: `第 ${userReader.line()} 行，期望 "${stdToken}" 但得到 "${userToken}"`,
    }
  }
}

// 浮点数比较（带 epsilon）
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

    const a = parseFloat(userToken)
    const b = parseFloat(stdToken)

    // NaN / Inf 处理
    if (Number.isNaN(a) !== Number.isNaN(b) || Number.isFinite(a) !== Number.isFinite(b)) {
      return { score: 0, status: 'WA', message: `第 ${userReader.line()} 行，期望 ${b} 但得到 ${a}` }
    }

    if (Math.abs(a - b) <= Math.max(eps, eps * Math.abs(b))) {
      continue
    }
    return { score: 0, status: 'WA', message: `第 ${userReader.line()} 行，期望 ${b} 但得到 ${a}` }
  }
}

// 比较调度入口
export async function compareOutput(input: CompareInput): Promise<CompareResult> {
  const userReader = new BufferedStreamReader(createStringStream(input.userOutput))
  const stdReader = new BufferedStreamReader(createStringStream(input.expectedOutput))
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
}
