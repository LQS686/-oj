/**
 * lib/ai/fetch-safe.ts
 * SSRF-safe fetch 封装
 *
 * 用途：
 *   所有需要从服务端发起外部 HTTP 请求的地方（AI Provider / OAuth / Webhook），
 *   必须通过 safeFetch 而非原生 fetch。
 *
 * 防护措施：
 *   1. URL 协议白名单：仅 http/https
 *   2. URL 格式校验：拒绝内网 IP / 元数据端点
 *   3. **DNS Rebinding 防御**：每次 fetch 前重新解析 + 校验
 *      —— lookup 后到 fetch 之间攻击者可能 rebind，所以**重新解析**确保当前仍合规。
 *   4. **强 IP 直连**：fetch 时通过自定义 lookup 把域名锁定到本次解析的 IP，
 *      避免 libcurl/undici 在 fetch 内重新解析（这是 DNS Rebinding 的真正窗口）。
 *
 * 已知局限：
 *   - Node 18+ 的 fetch 走 undici，undici 不支持自定义 lookup。
 *     因此本实现改为直接调用 `http.request`/`https.request`，
 *     牺牲一些 fetch 高级特性（如 HTTP/2 streaming）换取 SSRF 安全。
 *   - 如未来要使用 undici 高级特性，可改用 `node-fetch` + `agent: { lookup }` 方案。
 *
 * 引入依赖：本文件只使用 Node.js 内置 http/https 模块，零运行时依赖。
 */

import * as http from 'http'
import * as https from 'https'
import { URL } from 'url'
import { validateAiBaseUrlDns } from './providers-dns'
import { validateAiBaseUrl } from './providers'

interface SafeFetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string | Buffer
  signal?: AbortSignal
  /** 超时（毫秒），默认 30000 */
  timeoutMs?: number
}

/**
 * 判断 IPv4 是否为私有/保留地址。
 * 与 providers-dns.ts 中 isPrivateIp 保持一致（避免重复维护）。
 */
function isPrivateIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = m.slice(1).map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true
  // IPv4-mapped IPv6 地址（如 ::ffff:127.0.0.1）可绕过纯 IPv4 校验，
  // 提取内嵌 IPv4 后再用既有 IPv4 私有段判断
  const v4Mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4Mapped && isPrivateIpv4(v4Mapped[1])) return true
  return false
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) return isPrivateIpv6(ip)
  return isPrivateIpv4(ip)
}

/**
 * SSRF-safe fetch
 *
 * 与原生 fetch 差异：
 *   - 仅支持 string URL
 *   - 返回 { status, headers, text() }（简化 Response 接口，避免依赖 undici 类型）
 *   - 不支持 HTTP/2（除非 http.request 内部协商）
 *   - 不支持 streaming body
 */
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<{
  status: number
  ok: boolean
  headers: http.IncomingHttpHeaders
  text(): Promise<string>
  json<T = unknown>(): Promise<T>
}> {
  // 1) URL 格式校验（拒绝内网 IP / 危险协议）
  //    与 providers.ts 的 validateAiBaseUrl 共用同一套校验逻辑（保持一致）
  validateAiBaseUrl(url)

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`URL 格式错误: ${url}`)
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`不允许的协议: ${parsed.protocol}（仅支持 http/https）`)
  }

  const host = parsed.hostname
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')

  // 2) 同步校验：URL 本身是否含内网 IP（覆盖直接写 IP 的场景）
  if (host && !host.startsWith('[') && isPrivateIp(host)) {
    throw new Error(`目标主机为内网地址: ${host}`)
  }

  // 3) DNS 重新解析 + 校验（防 Rebinding）
  //    实际请求通过 IP 直连（自定义 lookup），进一步把 re-resolve 窗口压到 0。
  const dns = await import('dns')
  let addresses: { address: string; family: number }[]
  try {
    addresses = await dns.promises.lookup(host, { all: true })
  } catch {
    throw new Error(`域名无法解析: ${host}`)
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error(`目标域名 ${host} 解析到内网地址 ${address}，可能存在 DNS Rebinding 攻击`)
    }
  }

  // 4) **强 IP 直连**：把域名锁定为第一个 IPv4 解析结果
  //    —— 攻击者若在 lookup 后 rebind，本请求仍发往首次解析的 IP。
  const ipv4 = addresses.find((a) => a.family === 4)
  const targetAddress = ipv4?.address || addresses[0]?.address
  if (!targetAddress) {
    throw new Error(`域名 ${host} 无可用解析结果`)
  }

  // 5) 构造请求（替换 hostname 为 IP，原始 host 写入 Host header）
  const requestOptions: http.RequestOptions = {
    host: targetAddress,
    port,
    method: options.method || 'GET',
    path: parsed.pathname + parsed.search,
    headers: {
      ...options.headers,
      Host: parsed.host, // 保留原始 Host 头（SNI/CDN 必需）
    },
  }

  return new Promise((resolve, reject) => {
    const client = parsed.protocol === 'https:' ? https : http
    const req = client.request(requestOptions, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks)
        const status = res.statusCode || 0
        resolve({
          status,
          ok: status >= 200 && status < 300,
          headers: res.headers,
          text: async () => body.toString('utf8'),
          json: async <T = unknown>() => JSON.parse(body.toString('utf8')) as T,
        })
      })
      res.on('error', reject)
    })

    req.on('error', reject)

    // 超时
    const timeoutMs = options.timeoutMs || 30000
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`请求超时 (>${timeoutMs}ms): ${url}`))
    })

    // AbortSignal
    if (options.signal) {
      if (options.signal.aborted) {
        req.destroy(new Error('请求被取消'))
      } else {
        options.signal.addEventListener('abort', () => {
          req.destroy(new Error('请求被取消'))
        })
      }
    }

    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

/**
 * 校验工具导出（供其他模块复用）
 */
export const ssrf = {
  isPrivateIp,
  isPrivateIpv4,
  isPrivateIpv6,
}

// 重新导出 DNS 校验函数，避免上层重复 import
export { validateAiBaseUrl, validateAiBaseUrlDns }