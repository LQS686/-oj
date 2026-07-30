import { logger } from '../logger'
import { CSRF_CONSTANTS } from '@/lib/security/csrf-constants'

interface ClientApiError {
  message: string
  code?: string
  details?: unknown
}

interface ClientApiResponse<T> {
  success: boolean
  data: T
  message?: string
  error?: string
  code?: string
}

const REQUEST_TIMEOUT_MS = 30000
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

let csrfInflight: Promise<string> | null = null
let csrfGeneration = 0

function readCsrfFromDocumentCookie(): string | null {
  if (typeof document === 'undefined') return null
  const raw = document.cookie || ''
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === '__Host-csrf' || k === 'csrf') {
      const v = decodeURIComponent(rest.join('='))
      if (v) return v
    }
  }
  return null
}

/** 确保持有可用 CSRF token（写请求前调用） */
export async function ensureCsrfToken(): Promise<string> {
  const fromCookie = readCsrfFromDocumentCookie()
  if (fromCookie) {
    return fromCookie
  }
  // Cookie 已清除时走重新签发，避免与空 Cookie 不匹配
  if (csrfInflight) return csrfInflight

  const gen = csrfGeneration
  csrfInflight = (async () => {
    const res = await fetch('/api/auth/csrf', { credentials: 'include', cache: 'no-store' })
    const json = await res.json()
    const token = json?.data?.csrfToken as string | undefined
    if (!token) throw { message: '无法获取 CSRF token', code: 'CSRF_INIT' } as ClientApiError
    // 签发过程中若已 clear（跨标签登出），丢弃本次结果并重新同步
    if (gen !== csrfGeneration) {
      return ensureCsrfToken()
    }
    return token
  })().finally(() => {
    csrfInflight = null
  })

  return csrfInflight
}

export function clearCsrfTokenCache(): void {
  csrfGeneration++
  csrfInflight = null
}

async function withCsrfHeaders(
  method: string,
  headers: Record<string, string>
): Promise<Record<string, string>> {
  if (!WRITE_METHODS.has(method.toUpperCase())) return headers
  const token = await ensureCsrfToken()
  return { ...headers, [CSRF_CONSTANTS.HEADER]: token }
}

class ApiClient {
  private baseUrl: string
  private requestCount: number = 0

  constructor() {
    this.baseUrl = '/api'
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, csrfRetried = false): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const method = (options.method || 'GET').toUpperCase()

    const headers = await withCsrfHeaders(method, {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    this.requestCount++

    try {
      const response = await fetch(url, {
        ...options,
        method,
        headers,
        credentials: 'include',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorMessage = '请求失败'
        let errorCode = 'NETWORK_ERROR'

        switch (response.status) {
          case 400:
            errorMessage = '请求参数错误'
            errorCode = 'BAD_REQUEST'
            break
          case 401:
            errorMessage = '未授权访问，请重新登录'
            errorCode = 'UNAUTHORIZED'
            break
          case 403:
            errorMessage = '禁止访问，权限不足'
            errorCode = 'FORBIDDEN'
            break
          case 404:
            errorMessage = '请求的资源不存在'
            errorCode = 'NOT_FOUND'
            break
          case 429:
            errorMessage = '请求过于频繁，请稍后重试'
            errorCode = 'RATE_LIMIT'
            break
          case 500:
            errorMessage = '服务器内部错误，请稍后重试'
            errorCode = 'INTERNAL_ERROR'
            break
        }

        try {
          const data = await response.json()
          if (typeof data.error === 'string' && data.error) {
            errorMessage = data.error
          }
          if (data.code) {
            errorCode = data.code
          }
        } catch {
          // ignore
        }

        // 跨标签登出后偶发 token/cookie 不同步：清缓存后重试一次写请求
        if (errorCode === 'CSRF_INVALID' && WRITE_METHODS.has(method) && !csrfRetried) {
          clearCsrfTokenCache()
          return this.request<T>(endpoint, options, true)
        }

        throw { message: errorMessage, code: errorCode } as ClientApiError
      }

      const text = await response.text()
      let data: ClientApiResponse<T>
      try {
        data = JSON.parse(text)
      } catch {
        throw {
          message: `服务器响应解析失败 (${response.status})`,
          code: 'PARSE_ERROR',
        } as ClientApiError
      }

      if (!data.success) {
        throw {
          message: typeof data.error === 'string' ? data.error : data.message || '请求失败',
          code: data.code,
        } as ClientApiError
      }

      return data.data
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw { message: '请求超时，请稍后重试', code: 'TIMEOUT' } as ClientApiError
      }

      if (error instanceof TypeError && (error as Error).message.includes('Failed to fetch')) {
        logger.error(`网络连接失败: ${endpoint}`, error)
        throw { message: '网络连接失败，请检查网络设置', code: 'NETWORK_ERROR' } as ClientApiError
      }

      const errCode = (error as ClientApiError)?.code
      if (errCode === 'UNAUTHORIZED') throw error

      logger.error(`API请求失败: ${endpoint}`, error)
      throw error
    } finally {
      this.requestCount--
    }
  }

  async get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    const cleanParams: Record<string, string> = {}
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue
        cleanParams[key] = String(value)
      }
    }
    const queryString =
      Object.keys(cleanParams).length > 0 ? '?' + new URLSearchParams(cleanParams).toString() : ''

    return this.request<T>(`${endpoint}${queryString}`, { method: 'GET' })
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    })
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data ?? {}),
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const headers = await withCsrfHeaders('POST', {})

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)
    this.requestCount++

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers,
        credentials: 'include',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorMessage = '上传失败'
        let errorCode = 'UPLOAD_ERROR'
        try {
          const data = await response.json()
          if (typeof data.error === 'string' && data.error) errorMessage = data.error
          if (data.code) errorCode = data.code
        } catch {
          // ignore
        }
        throw { message: errorMessage, code: errorCode } as ClientApiError
      }

      const text = await response.text()
      const data = JSON.parse(text) as ClientApiResponse<T>
      if (!data.success) {
        throw {
          message: typeof data.error === 'string' ? data.error : data.message || '上传失败',
          code: data.code,
        } as ClientApiError
      }
      return data.data
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    } finally {
      this.requestCount--
    }
  }

  isLoading(): boolean {
    return this.requestCount > 0
  }
}

export const apiClient = new ApiClient()

export async function fetchWithCookie(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase()
  const headers = await withCsrfHeaders(method, {
    ...(options.headers as Record<string, string>),
  })
  return fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'include',
  })
}

/** @deprecated 请使用 fetchWithCookie */
export const fetchWithAuth = fetchWithCookie
