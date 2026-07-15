/**
 * tests/zip-safety.test.ts
 * ZIP 路径穿越防护单测（P0：Zip Slip 防护回归保护）
 */
import { describe, it, expect } from 'vitest'
import { isSafeZipEntryName } from '../lib/problem/testcase'

describe('isSafeZipEntryName', () => {
  it('应接受合法文件名', () => {
    expect(isSafeZipEntryName('1.in')).toBe(true)
    expect(isSafeZipEntryName('test2.out')).toBe(true)
    expect(isSafeZipEntryName('data.in')).toBe(true)
    expect(isSafeZipEntryName('a-1_2.in')).toBe(true)
  })

  it('应拒绝路径分隔符（POSIX / Windows）', () => {
    expect(isSafeZipEntryName('../etc/passwd')).toBe(false)
    expect(isSafeZipEntryName('..\\windows\\system32')).toBe(false)
    expect(isSafeZipEntryName('sub/1.in')).toBe(false)
    expect(isSafeZipEntryName('sub\\1.in')).toBe(false)
  })

  it('应拒绝绝对路径', () => {
    expect(isSafeZipEntryName('/etc/passwd')).toBe(false)
    expect(isSafeZipEntryName('\\server\share')).toBe(false)
    expect(isSafeZipEntryName('C:\\Windows\\System32')).toBe(false)
    expect(isSafeZipEntryName('D:/malware.exe')).toBe(false)
  })

  it('应拒绝父目录引用', () => {
    expect(isSafeZipEntryName('..')).toBe(false)
    expect(isSafeZipEntryName('.')).toBe(false)
    expect(isSafeZipEntryName('a..b.in')).toBe(false) // 含 '..'
    expect(isSafeZipEntryName('..1.in')).toBe(false)
  })

  it('应拒绝 Unicode 路径分隔符', () => {
    expect(isSafeZipEntryName('a\u2028b.in')).toBe(false)
    expect(isSafeZipEntryName('a\u2029b.in')).toBe(false)
    expect(isSafeZipEntryName('a\uFF0Fb.in')).toBe(false)
    expect(isSafeZipEntryName('a\uFF3Cb.in')).toBe(false)
  })

  it('应拒绝 NUL 字节', () => {
    expect(isSafeZipEntryName('1.in\u0000.exe')).toBe(false)
  })

  it('应拒绝空字符串与超长字符串', () => {
    expect(isSafeZipEntryName('')).toBe(false)
    expect(isSafeZipEntryName('a'.repeat(129))).toBe(false)
    expect(isSafeZipEntryName('a'.repeat(128))).toBe(true)
  })

  it('应拒绝非字符串输入', () => {
    // @ts-expect-error 测试运行时行为
    expect(isSafeZipEntryName(null)).toBe(false)
    // @ts-expect-error 测试运行时行为
    expect(isSafeZipEntryName(undefined)).toBe(false)
    // @ts-expect-error 测试运行时行为
    expect(isSafeZipEntryName(123)).toBe(false)
  })
})