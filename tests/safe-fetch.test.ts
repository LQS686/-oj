/**
 * tests/safe-fetch.test.ts
 * safeFetch SSRF 防护单元测试（P0：DNS Rebinding + 内网穿透防护）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { safeFetch, ssrf } from '../lib/security/safe-fetch'

// mock node http/https，让测试不真的发请求
const { mockHttpRequest, mockHttpsRequest } = vi.hoisted(() => ({
  mockHttpRequest: vi.fn(),
  mockHttpsRequest: vi.fn(),
}))

vi.mock('http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('http')>()
  return {
    ...actual,
    request: (...args: any[]) => mockHttpRequest(...args),
  }
})

vi.mock('https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('https')>()
  return {
    ...actual,
    request: (...args: any[]) => mockHttpsRequest(...args),
  }
})

// mock dns，让测试可控制解析结果
vi.mock('dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dns')>()
  return {
    ...actual,
    promises: {
      lookup: vi.fn(),
    },
  }
})

import * as dns from 'dns'
const lookupMock = dns.promises.lookup as ReturnType<typeof vi.fn>

function mockHttpResponse(statusCode: number, body: string, headers: Record<string, string> = {}) {
  const req = {
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    setTimeout: vi.fn(),
    destroy: vi.fn(),
  }
  const impl = (opts: any, cb: any) => {
    // 模拟 socket 收到响应
    const res = {
      statusCode,
      headers,
      on: vi.fn((event: string, fn: any) => {
        if (event === 'data') fn(Buffer.from(body))
        if (event === 'end') fn()
      }),
    }
    cb(res)
    return req
  }
  mockHttpRequest.mockImplementation(impl)
  mockHttpsRequest.mockImplementation(impl)
  return req
}

describe('safeFetch - SSRF 防护', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认解析到公网 IP
    lookupMock.mockResolvedValue([{ address: '1.2.3.4', family: 4 }])
  })

  it('应拒绝 file:// 协议', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(/不允许的协议/)
  })

  it('应拒绝 ftp:// 协议', async () => {
    await expect(safeFetch('ftp://example.com')).rejects.toThrow(/不允许的协议/)
  })

  it('应拒绝 javascript: 协议', async () => {
    await expect(safeFetch('javascript:alert(1)')).rejects.toThrow(/不允许的协议/)
  })

  it('应拒绝 127.0.0.1 直连', async () => {
    await expect(safeFetch('http://127.0.0.1/x')).rejects.toThrow(/内网/)
  })

  it('应拒绝 169.254.169.254 元数据端点（AWS/GCP/Azure）', async () => {
    await expect(safeFetch('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/内网/)
  })

  it('应拒绝 192.168.0.1', async () => {
    await expect(safeFetch('http://192.168.0.1/admin')).rejects.toThrow(/内网/)
  })

  it('应拒绝 10.0.0.1', async () => {
    await expect(safeFetch('http://10.0.0.1/x')).rejects.toThrow(/内网/)
  })

  it('应拒绝域名解析到内网 IP（DNS Rebinding 防护）', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    await expect(safeFetch('http://evil.example.com/')).rejects.toThrow(/内网地址/)
  })

  it('应拒绝 IPv6 内网（::1）', async () => {
    lookupMock.mockResolvedValue([{ address: '::1', family: 6 }])
    await expect(safeFetch('http://[::1]/')).rejects.toThrow(/内网/)
  })

  it('应拒绝 IPv6 fc00::/7（ULA）', async () => {
    lookupMock.mockResolvedValue([{ address: 'fc00::1', family: 6 }])
    await expect(safeFetch('http://[fc00::1]/')).rejects.toThrow(/内网/)
  })

  it('应拒绝 IPv6 fe80::/10（link-local）', async () => {
    lookupMock.mockResolvedValue([{ address: 'fe80::1', family: 6 }])
    await expect(safeFetch('http://[fe80::1]/')).rejects.toThrow(/内网/)
  })

  it('应允许公网请求通过（https）', async () => {
    mockHttpResponse(200, '{"data":[{"id":"cf-round-1"}]}', { 'content-type': 'application/json' })
    const res = await safeFetch('https://codeforces.com/api/contest.list', {
      headers: { Authorization: 'Bearer test' },
    })
    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
    const json = await res.json<{ data: { id: string }[] }>()
    expect(json.data[0].id).toBe('cf-round-1')
  })

  it('应保留原始 Host 头（SNI/CDN 必需）', async () => {
    mockHttpResponse(200, '')
    await safeFetch('https://codeforces.com/api/contest.list')
    const reqOpts = mockHttpsRequest.mock.calls[0][0]
    // host 应该是 IP（直连），但 Host header 保留原始域名
    expect(reqOpts.host).toBe('1.2.3.4')
    expect(reqOpts.headers.Host).toBe('codeforces.com')
  })

  it('应使用 https.request 当协议为 https:', async () => {
    mockHttpResponse(200, '')
    await safeFetch('https://api.example.com/x')
    expect(mockHttpsRequest).toHaveBeenCalled()
    expect(mockHttpRequest).not.toHaveBeenCalled()
  })

  it('应使用 http.request 当协议为 http:', async () => {
    mockHttpResponse(200, '')
    await safeFetch('http://api.example.com/x')
    expect(mockHttpRequest).toHaveBeenCalled()
    expect(mockHttpsRequest).not.toHaveBeenCalled()
  })

  it('应支持 POST + body', async () => {
    mockHttpResponse(201, '{"ok":true}')
    const req = mockHttpResponse(201, '')
    await safeFetch('https://api.example.com/x', {
      method: 'POST',
      body: '{"a":1}',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(req.write).toHaveBeenCalledWith('{"a":1}')
    expect(req.end).toHaveBeenCalled()
  })

  it('应处理超时', async () => {
    // 不触发任何响应事件，模拟超时
    const noResponseImpl = () => {
      let destroyError: Error | null = null
      const destroyFn = vi.fn((err?: Error) => {
        if (err) destroyError = err
        // 触发 req 的 'error' 事件，让 Promise reject
        const handlers = errorHandlers
        for (const h of handlers) h(destroyError || new Error('socket hang up'))
      })
      const errorHandlers: Array<(e: Error) => void> = []
      return {
        on: (event: string, fn: any) => {
          if (event === 'error') errorHandlers.push(fn)
        },
        write: vi.fn(),
        end: vi.fn(),
        setTimeout: (_ms: number, fn: any) => setImmediate(fn), // 立即触发超时
        destroy: destroyFn,
      }
    }
    mockHttpRequest.mockImplementation(noResponseImpl)
    mockHttpsRequest.mockImplementation(noResponseImpl)
    await expect(
      safeFetch('https://api.example.com/x', { timeoutMs: 50 })
    ).rejects.toThrow()
  })

  it('应支持 AbortSignal', async () => {
    const controller = new AbortController()
    const errorHandlers: Array<(e: Error) => void> = []
    const destroyFn = vi.fn((err?: Error) => {
      const handlers = errorHandlers
      for (const h of handlers) h(err || new Error('aborted'))
    })
    const noResponseImpl = () => ({
      on: (event: string, fn: any) => {
        if (event === 'error') errorHandlers.push(fn)
      },
      write: vi.fn(),
      end: vi.fn(),
      setTimeout: vi.fn(),
      destroy: destroyFn,
    })
    mockHttpRequest.mockImplementation(noResponseImpl)
    mockHttpsRequest.mockImplementation(noResponseImpl)
    const promise = safeFetch('https://api.example.com/x', { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toThrow(/取消/)
  })

  it('ssrf.isPrivateIp 应正确分类 IP', () => {
    expect(ssrf.isPrivateIp('127.0.0.1')).toBe(true)
    expect(ssrf.isPrivateIp('169.254.169.254')).toBe(true)
    expect(ssrf.isPrivateIp('10.0.0.1')).toBe(true)
    expect(ssrf.isPrivateIp('192.168.1.1')).toBe(true)
    expect(ssrf.isPrivateIp('172.16.0.1')).toBe(true)
    expect(ssrf.isPrivateIp('100.64.0.1')).toBe(true) // CGNAT
    expect(ssrf.isPrivateIp('8.8.8.8')).toBe(false)
    expect(ssrf.isPrivateIp('1.1.1.1')).toBe(false)
    expect(ssrf.isPrivateIp('::1')).toBe(true)
    expect(ssrf.isPrivateIp('::')).toBe(true)
    expect(ssrf.isPrivateIp('fe80::1')).toBe(true)
    expect(ssrf.isPrivateIp('fc00::1')).toBe(true)
    expect(ssrf.isPrivateIp('fd00::1')).toBe(true)
    expect(ssrf.isPrivateIp('2001:4860:4860::8888')).toBe(false) // Google DNS IPv6
  })
})