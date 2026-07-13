import sharp from 'sharp'
import { join, basename } from 'path'
import { writeFile, readFile, unlink, mkdir, readdir, stat } from 'fs/promises'
import { existsSync, createWriteStream, createReadStream } from 'fs'
import { pipeline } from 'stream/promises'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/api/withApi'

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'avatars')
const TEMP_DIR = join(process.cwd(), 'temp', 'uploads')

export const ensureUploadDirs = async () => {
  if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })
  if (!existsSync(TEMP_DIR)) await mkdir(TEMP_DIR, { recursive: true })
}

// 严格校验 uploadId 为标准 UUID 格式，防止通过 uploadId 构造路径穿越
const UPLOAD_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isValidUploadId(id: string): boolean {
  return typeof id === 'string' && UPLOAD_ID_REGEX.test(id)
}

function assertValidUploadId(uploadId: string): void {
  if (!isValidUploadId(uploadId)) {
    throw new ApiError('INVALID_UPLOAD_ID', '无效的上传ID', 400)
  }
}

export interface ProcessAvatarResult {
  filename: string
  path: string
  url: string
  size: number
}

/**
 * 通过 magic number（文件头魔数）检测图片实际 MIME 类型。
 * 不信任 Content-Type / 扩展名，防止上传伪装的恶意文件。
 */
export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 4) return null
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'image/png'
  // GIF: 47 49 46 38 (GIF8)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'image/gif'
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50 (RIFF....WEBP)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return 'image/webp'
  return null
}

export async function processAvatar(
  buffer: Buffer,
  userId: string,
  originalName: string
): Promise<ProcessAvatarResult> {
  await ensureUploadDirs()

  // MIME 校验：通过 magic number（文件头魔数）检测实际类型，防止伪装扩展名上传恶意文件
  const detectedMime = detectImageMime(buffer)
  if (!detectedMime) {
    throw new ApiError('INVALID_FILE_TYPE', '仅支持 JPEG/PNG/GIF/WebP 图片', 400)
  }

  const timestamp = Date.now()
  const filename = `${userId}_${timestamp}.webp`
  const filepath = join(UPLOAD_DIR, filename)
  
  // Process image: resize to 400x400, convert to webp, quality 80
  const processedInfo = await sharp(buffer)
    .resize(400, 400, {
      fit: 'cover',
      position: 'center'
    })
    .webp({ quality: 80 })
    .toFile(filepath)
    
  // Generate thumbnail (100x100)
  const thumbFilename = `${userId}_${timestamp}_thumb.webp`
  await sharp(buffer)
    .resize(100, 100, { fit: 'cover' })
    .webp({ quality: 70 })
    .toFile(join(UPLOAD_DIR, thumbFilename))

  return {
    filename,
    path: filepath,
    url: `/uploads/avatars/${filename}`,
    size: processedInfo.size
  }
}

export async function saveChunk(
  uploadId: string,
  chunkIndex: number,
  buffer: Buffer
) {
  assertValidUploadId(uploadId)
  await ensureUploadDirs()
  const safeId = basename(uploadId)
  const chunkPath = join(TEMP_DIR, `${safeId}_${chunkIndex}`)
  await writeFile(chunkPath, buffer)
}

export async function mergeChunks(
  uploadId: string,
  totalChunks: number,
  userId: string,
  originalName: string
): Promise<ProcessAvatarResult> {
  assertValidUploadId(uploadId)
  const safeId = basename(uploadId)
  const mergedFilePath = join(TEMP_DIR, `${safeId}_merged`)
  const writeStream = createWriteStream(mergedFilePath)

  try {
    // Merge chunks in order
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = join(TEMP_DIR, `${safeId}_${i}`)
      if (!existsSync(chunkPath)) {
        throw new Error(`Chunk ${i} missing`)
      }
      const chunkData = await readFile(chunkPath)
      writeStream.write(chunkData)
    }
    writeStream.end()

    // Wait for stream to finish
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve())
      writeStream.on('error', reject)
    })

    // Process the merged file
    const mergedBuffer = await readFile(mergedFilePath)
    const result = await processAvatar(mergedBuffer, userId, originalName)

    // Cleanup chunks and merged file
    await unlink(mergedFilePath)
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = join(TEMP_DIR, `${safeId}_${i}`)
      if (existsSync(chunkPath)) await unlink(chunkPath)
    }

    return result
  } catch (error) {
    // Cleanup on error if possible
    if (existsSync(mergedFilePath)) await unlink(mergedFilePath).catch(() => {})
    throw error
  }
}

export async function cleanOldTempFiles() {
  try {
    if (!existsSync(TEMP_DIR)) return
    const files = await readdir(TEMP_DIR)
    const now = Date.now()
    const ONE_DAY = 24 * 60 * 60 * 1000
    
    for (const file of files) {
      const filePath = join(TEMP_DIR, file)
      const stats = await stat(filePath)
      if (now - stats.mtimeMs > ONE_DAY) {
        await unlink(filePath).catch(() => {})
      }
    }
  } catch (e) {
    logger.error('Clean temp error', e)
  }
}
