/**
 * 备份/恢复相关单元测试（纯逻辑，不依赖真实 Mongo）：
 *  - 恢复口令加解密（secrets.ts）
 *  - 上传路径穿越防护（archive.ts）
 *  - EJSON 类型保真（create/restore 共用序列化基础）
 */
import { describe, it, expect } from 'vitest'
import { encryptSecrets, decryptSecrets } from '@/lib/backup/secrets'
import { sanitizeArchiveRelPath } from '@/lib/backup/archive'
import { uploadBackupToTemp } from '@/lib/backup/restore-upload'
import { BSON, ObjectId } from 'mongodb'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getBackupConfig } from '@/lib/backup/config'

describe('backup secrets（恢复口令加解密）', () => {
  const secrets = { jwtSecret: 'secret-1234567890', encryptionKey: 'enc-0987654321' }

  it('正确口令能还原原文', () => {
    const { cipher, salt } = encryptSecrets(secrets, '备用口令')
    expect(salt.length).toBeGreaterThan(0)
    const decrypted = decryptSecrets(cipher, '备用口令')
    expect(decrypted).toEqual(secrets)
  })

  it('错误口令抛错', () => {
    const { cipher } = encryptSecrets(secrets, '口令A')
    expect(() => decryptSecrets(cipher, '口令B')).toThrow()
  })

  it('空口令抛错', () => {
    expect(() => encryptSecrets(secrets, '')).toThrow()
    const { cipher } = encryptSecrets(secrets, '口令C')
    expect(() => decryptSecrets(cipher, '')).toThrow()
  })

  it('同内容两次加密使用不同盐（密文不同）', () => {
    const a = encryptSecrets(secrets, '口令')
    const b = encryptSecrets(secrets, '口令')
    expect(a.cipher).not.toBe(b.cipher)
    expect(a.salt).not.toBe(b.salt)
  })
})

describe('archive sanitizeArchiveRelPath（路径穿越防护）', () => {
  it('接受正常相对路径并统一分隔符', () => {
    expect(sanitizeArchiveRelPath('uploads/avatar/a.png')).toBe('uploads/avatar/a.png')
    expect(sanitizeArchiveRelPath('uploads\\avatar\\a.png')).toBe('uploads/avatar/a.png')
    expect(sanitizeArchiveRelPath('db/User.ndjson')).toBe('db/User.ndjson')
  })

  it('拒绝绝对路径与穿越', () => {
    expect(sanitizeArchiveRelPath('/etc/passwd')).toBeNull()
    expect(sanitizeArchiveRelPath('../../etc/passwd')).toBeNull()
    expect(sanitizeArchiveRelPath('uploads/../a.png')).toBeNull()
    expect(sanitizeArchiveRelPath('C:/windows/x')).toBeNull()
    expect(sanitizeArchiveRelPath('')).toBeNull()
    expect(sanitizeArchiveRelPath(null)).toBeNull()
  })
})

describe('backup EJSON 序列化保真', () => {
  it('ObjectId/Date 经 EJSON 往返后仍为原生类型', () => {
    const doc = { _id: new ObjectId(), createdAt: new Date('2026-01-01T00:00:00Z'), n: 1.5 }
    const line = JSON.stringify(BSON.EJSON.serialize(doc, { relaxed: false }))
    const restored = BSON.EJSON.parse(line)
    expect(restored._id).toBeInstanceOf(ObjectId)
    expect(restored._id.toHexString()).toBe(doc._id.toHexString())
    expect(restored.createdAt).toBeInstanceOf(Date)
    expect(restored.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(restored.n).toBe(1.5)
  })
})

describe('restore-upload 流式上传落盘（restoreUpload 切分）', () => {
  const BND = 'BNDaaB_TEST99'

  function buildRequest(bodyStr: string): Request {
    const bytes = new TextEncoder().encode(bodyStr)
    return new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${BND}` },
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes)
          c.close()
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })
  }

  it('把 file 部件流式写入临时文件并解析 options', async () => {
    const data = 'PK\x03\x04MOCKDATA_UNIT12345'
    const body = [
      `--${BND}\r\n`,
      'Content-Disposition: form-data; name="options"\r\n',
      '\r\n',
      '{"allowOverwrite":true}\r\n',
      `--${BND}\r\n`,
      'Content-Disposition: form-data; name="file"; filename="backup.dsoj.gz"\r\n',
      'Content-Type: application/gzip\r\n',
      '\r\n',
      `${data}\r\n`,
      `--${BND}--\r\n`,
    ].join('')

    const result = await uploadBackupToTemp(buildRequest(body), 1024 * 1024)

    expect(existsSync(result.filePath)).toBe(true)
    expect(result.fileSize).toBe(data.length)
    expect(JSON.parse(result.optionsRaw ?? '{}')).toEqual({ allowOverwrite: true })

    await result.cleanup()
    expect(existsSync(result.filePath)).toBe(false)
  })

  it('超过 maxBytes 立即抛错并清理临时目录', async () => {
    const data = 'A'.repeat(100)
    const body = [
      `--${BND}\r\n`,
      'Content-Disposition: form-data; name="file"; filename="big.gz"\r\n',
      '\r\n',
      `${data}\r\n`,
      `--${BND}--\r\n`,
    ].join('')

    await expect(uploadBackupToTemp(buildRequest(body), 10)).rejects.toThrow('PAYLOAD_TOO_LARGE')

    const tmpDir = join(getBackupConfig().dir, '.restore-tmp')
    const leftovers = existsSync(tmpDir) && readdirSync(tmpDir).length ? readdirSync(tmpDir) : []
    expect(leftovers).toEqual([])
  })
})
