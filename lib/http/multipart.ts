/**
 * lib/http/multipart.ts
 * Node / Web Request 通用的 multipart 解析（绕开 Next.js formData 适配层）
 */
import type { IncomingMessage } from 'http'

export interface MultipartPart {
  name: string
  filename: string | null
  contentType: string | null
  data: Buffer
}

/**
 * 从 IncomingMessage 读取完整 body（带大小限制，防止 OOM）
 */
export function readBodyWithLimit(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        req.destroy()
        reject(new Error('PAYLOAD_TOO_LARGE'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * 极简 multipart 解析（Buffer + boundary）
 */
export function parseMultipart(body: Buffer, boundary: string): MultipartPart[] {
  const sep = Buffer.from(`--${boundary}`)
  const parts: MultipartPart[] = []

  let cursor = 0
  while (cursor < body.length) {
    const start = body.indexOf(sep, cursor)
    if (start === -1) break
    let headerStart = start + sep.length
    if (body[headerStart] === 0x2d && body[headerStart + 1] === 0x2d) {
      break
    }
    if (body[headerStart] === 0x0d && body[headerStart + 1] === 0x0a) {
      headerStart += 2
    }
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), headerStart)
    if (headerEnd === -1) break
    const nextStart = body.indexOf(sep, headerEnd + 4)
    if (nextStart === -1) break
    const dataEnd = nextStart - 2

    const headerBuf = body.subarray(headerStart, headerEnd).toString('utf8')
    const data = body.subarray(headerEnd + 4, dataEnd)

    const nameMatch = headerBuf.match(/name="([^"]+)"/i)
    const filenameMatch = headerBuf.match(/filename="([^"]*)"/i)
    const ctMatch = headerBuf.match(/Content-Type:\s*([^\r\n]+)/i)

    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: filenameMatch ? filenameMatch[1] : null,
        contentType: ctMatch ? ctMatch[1].trim() : null,
        data,
      })
    }
    cursor = nextStart
  }
  return parts
}

export function extractMultipartBoundary(contentType: string): string | null {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2]
  return boundary ? boundary.trim() : null
}

/**
 * 从 Web Request 读取 multipart（用 arrayBuffer，避免 req.formData() 在自定义 server 下锁 body）
 */
export async function parseMultipartFromRequest(
  req: Request,
  maxBytes: number
): Promise<MultipartPart[]> {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    throw new Error('INVALID_CONTENT_TYPE')
  }
  const boundary = extractMultipartBoundary(contentType)
  if (!boundary) throw new Error('INVALID_BOUNDARY')

  const ab = await req.arrayBuffer()
  if (ab.byteLength > maxBytes) throw new Error('PAYLOAD_TOO_LARGE')
  return parseMultipart(Buffer.from(ab), boundary)
}
