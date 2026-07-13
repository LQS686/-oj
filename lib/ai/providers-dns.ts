/**
 * lib/ai/providers-dns.ts
 * SSRF DNS 深度防护（仅服务端使用）
 *
 * 此文件独立于 providers.ts，因为 dns 模块是 Node.js 内置模块，
 * 无法在客户端组件 bundle 中解析。客户端只需 getProviderMeta 等纯函数。
 */

/**
 * SSRF 深度防护：DNS 解析校验，防止 DNS Rebinding 攻击。
 * 域名可能解析到内网 IP（如 127.0.0.1 或 169.254.169.254），
 * 此函数对解析结果的所有 IP 进行私有地址校验。
 *
 * 应在 createAiProvider / updateAiProvider 等异步上下文中与 validateAiBaseUrl 配合使用。
 */
export async function validateAiBaseUrlDns(baseUrl: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    return // 格式错误由 validateAiBaseUrl 处理
  }

  const host = parsed.hostname.toLowerCase()
  // 跳过 IP 地址（已由 validateAiBaseUrl 校验）和 localhost
  if (host === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith('[')) {
    return
  }

  const dns = await import('dns')
  let addresses: { address: string; family: number }[]
  try {
    addresses = await dns.promises.lookup(host, { all: true })
  } catch {
    throw new Error(`baseUrl 域名无法解析: ${host}`)
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error(`baseUrl 域名 ${host} 解析到内网地址 ${address}，可能存在 DNS Rebinding 攻击`)
    }
  }
}

/** 判断 IP 地址是否为私有/保留地址 */
function isPrivateIp(ip: string): boolean {
  // IPv4
  const v4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4Match) {
    const [a, b] = v4Match.slice(1).map(Number)
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
  // IPv6
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true
  return false
}
