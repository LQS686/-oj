/**
 * /api/users/avatar/upload/chunk - 接收头像分片
 */
import { withApi, ok, throw400 } from '@/lib/api/withApi'
import { saveChunk, isValidUploadId } from '@/lib/upload'
import { assertAvatarUploadOwner } from '@/lib/avatar-upload-registry'
import { logger } from '@/lib/logger'

/** 单个分片大小上限：2MB（init 路由推荐 1MB，允许一定余量） */
const MAX_CHUNK_SIZE = 2 * 1024 * 1024
/** chunkIndex 上限（与 complete 路由的 totalChunks 上限一致） */
const MAX_CHUNK_INDEX = 1000

export const POST = withApi.auth(async (req, _ctx, { user }) => {
  // 关键修复：自定义 server 模式下（tsx server.ts + Next 16），req.formData() 在 multipart/form-data
  // 编码 + chunk 较大（>1MB）时会触发 Response body object should not be disturbed or locked。
  // 改用 req.arrayBuffer() 自己解析 multipart，绕开 Next.js 的 Web Request formData 转换层。
  let uploadId = ''
  let chunkIndex = NaN
  let fileBuffer: Buffer | null = null
  let fileName = 'chunk'
  let fileMime = 'application/octet-stream'

  try {
    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      throw400('INVALID_CONTENT_TYPE', '请求必须是 multipart/form-data')
    }

    const arrayBuffer = await req.arrayBuffer()
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
    if (!boundaryMatch) {
      throw400('INVALID_BOUNDARY', 'multipart boundary 缺失')
      return // unreachable, throw400 throws
    }
    const boundaryValue: string = boundaryMatch[1] || boundaryMatch[2] || ''
    if (!boundaryValue) {
      throw400('INVALID_BOUNDARY_VALUE', 'multipart boundary 值为空')
      return // unreachable, throw400 throws
    }
    const boundary = `--${boundaryValue}`
    const body = Buffer.from(arrayBuffer)

    // 极简 multipart 解析：定位各 part 的头部与正文
    const parts: Array<{ headers: string; data: Buffer }> = []
    let cursor = 0
    while (cursor < body.length) {
      const boundaryStart = body.indexOf(Buffer.from(boundary), cursor)
      if (boundaryStart === -1) break
      const headerStart = boundaryStart + boundary.length
      // boundary 后是 \r\n
      const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), headerStart)
      if (headerEnd === -1) break
      const nextBoundary = body.indexOf(Buffer.from(boundary), headerEnd + 4)
      const dataEnd = nextBoundary === -1 ? body.length - 2 : nextBoundary - 2 // -2 去掉 \r\n
      if (nextBoundary === -1) break
      const headers = body.subarray(headerStart, headerEnd).toString('utf8')
      const data = body.subarray(headerEnd + 4, dataEnd)
      parts.push({ headers, data })
      cursor = nextBoundary
    }

    for (const part of parts) {
      const nameMatch = part.headers.match(/name="([^"]+)"/i)
      const filenameMatch = part.headers.match(/filename="([^"]*)"/i)
      const mimeMatch = part.headers.match(/Content-Type:\s*([^\r\n]+)/i)
      const name = nameMatch?.[1]

      if (name === 'uploadId') {
        uploadId = part.data.toString('utf8').trim()
      } else if (name === 'chunkIndex') {
        chunkIndex = parseInt(part.data.toString('utf8').trim(), 10)
      } else if (name === 'file' && filenameMatch) {
        fileBuffer = part.data
        fileName = filenameMatch[1] || 'chunk'
        fileMime = mimeMatch?.[1]?.trim() || 'application/octet-stream'
      }
    }
  } catch (e) {
    logger.error('multipart 解析失败', e instanceof Error ? e : new Error(String(e)))
    throw400('PARSE_FAILED', 'multipart 解析失败')
  }

  if (!uploadId || isNaN(chunkIndex) || !fileBuffer) {
    throw400('INVALID_PARAMS', 'Invalid params')
    // 不可达分支
  }
  const chunkFile: Buffer = fileBuffer as Buffer

  if (!isValidUploadId(uploadId)) {
    throw400('INVALID_UPLOAD_ID', '无效的上传ID')
  }

  // P1-5 修复：二次鉴权 - 必须是该 uploadId 的拥有者本人
  assertAvatarUploadOwner(uploadId, user.id)

  if (chunkIndex < 0 || chunkIndex > MAX_CHUNK_INDEX) {
    throw400('INVALID_CHUNK_INDEX', `chunkIndex 超出范围 (0-${MAX_CHUNK_INDEX})`)
  }

  if (chunkFile.length > MAX_CHUNK_SIZE) {
    throw400('CHUNK_TOO_LARGE', `分片大小超过限制 (Max ${MAX_CHUNK_SIZE} bytes)`)
  }

  await saveChunk(uploadId, chunkIndex, chunkFile)
  return ok({})
})
