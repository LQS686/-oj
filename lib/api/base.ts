import { logger } from '../logger';

interface ClientApiError {
  message: string;
  code?: string;
  details?: any;
}

interface ClientApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  code?: string;
}

const REQUEST_TIMEOUT_MS = 30000

class ApiClient {
  private baseUrl: string;
  private requestCount: number = 0;

  constructor() {
    this.baseUrl = '/api';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    this.requestCount++;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorMessage = '请求失败';
        let errorCode = 'NETWORK_ERROR';
        
        switch (response.status) {
          case 400:
            errorMessage = '请求参数错误';
            errorCode = 'BAD_REQUEST';
            break;
          case 401:
            errorMessage = '未授权访问，请重新登录';
            errorCode = 'UNAUTHORIZED';
            break;
          case 403:
            errorMessage = '禁止访问，权限不足';
            errorCode = 'FORBIDDEN';
            break;
          case 404:
            errorMessage = '请求的资源不存在';
            errorCode = 'NOT_FOUND';
            break;
          case 429:
            errorMessage = '请求过于频繁，请稍后重试';
            errorCode = 'RATE_LIMIT';
            break;
          case 500:
            errorMessage = '服务器内部错误，请稍后重试';
            errorCode = 'INTERNAL_ERROR';
            break;
        }

        try {
          const data = await response.json();
          if (typeof data.error === 'string' && data.error) {
            errorMessage = data.error;
          }
          if (data.code) {
            errorCode = data.code;
          }
        } catch (e) {
          // 无法解析JSON，使用默认错误信息
        }

        const error: ClientApiError = {
          message: errorMessage,
          code: errorCode,
        };
        throw error;
      }

      const text = await response.text()

      let data: ClientApiResponse<T>
      try {
        data = JSON.parse(text)
      } catch {
        const parseError: ClientApiError = {
          message: `服务器响应解析失败 (${response.status})`,
          code: 'PARSE_ERROR',
        }
        throw parseError
      }

      if (!data.success) {
        const errorMessage = typeof data.error === 'string' ? data.error : (data.message || '请求失败');
        const error: ClientApiError = {
          message: errorMessage,
          code: data.code,
        };
        throw error;
      }

      return data.data;
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof DOMException && error.name === 'AbortError') {
        const timeoutError: ClientApiError = {
          message: '请求超时，请稍后重试',
          code: 'TIMEOUT',
        };
        throw timeoutError;
      }

      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const networkError: ClientApiError = {
          message: '网络连接失败，请检查网络设置',
          code: 'NETWORK_ERROR',
        };
        logger.error(`网络连接失败: ${endpoint}`, error);
        throw networkError;
      }

      logger.error(`API请求失败: ${endpoint}`, error);
      throw error;
    } finally {
      this.requestCount--;
    }
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    // 过滤掉 undefined / null / 空字符串，避免出现 ?offset=undefined 这种无效参数
    const cleanParams: Record<string, string> = {}
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue
        cleanParams[key] = String(value)
      }
    }
    const queryString = Object.keys(cleanParams).length > 0
      ? '?' + new URLSearchParams(cleanParams).toString()
      : ''

    return this.request<T>(`${endpoint}${queryString}`, {
      method: 'GET',
    })
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data ?? {}),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    this.requestCount++;

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorMessage = '上传失败';
        let errorCode = 'UPLOAD_ERROR';
        
        switch (response.status) {
          case 400:
            errorMessage = '上传参数错误';
            errorCode = 'BAD_REQUEST';
            break;
          case 401:
            errorMessage = '未授权访问，请重新登录';
            errorCode = 'UNAUTHORIZED';
            break;
          case 403:
            errorMessage = '禁止访问，权限不足';
            errorCode = 'FORBIDDEN';
            break;
          case 413:
            errorMessage = '文件大小超过限制';
            errorCode = 'FILE_TOO_LARGE';
            break;
          case 500:
            errorMessage = '服务器内部错误，请稍后重试';
            errorCode = 'INTERNAL_ERROR';
            break;
        }

        try {
          const data = await response.json();
          if (typeof data.error === 'string' && data.error) {
            errorMessage = data.error;
          }
          if (data.code) {
            errorCode = data.code;
          }
        } catch (e) {
          // 无法解析JSON，使用默认错误信息
        }

        const error: ClientApiError = {
          message: errorMessage,
          code: errorCode,
        };
        throw error;
      }

      const text = await response.text()

      let data: ClientApiResponse<T>
      try {
        data = JSON.parse(text)
      } catch {
        const parseError: ClientApiError = {
          message: `服务器响应解析失败 (${response.status})`,
          code: 'PARSE_ERROR',
        }
        throw parseError
      }

      if (!data.success) {
        const errorMessage = typeof data.error === 'string' ? data.error : (data.message || '上传失败');
        const error: ClientApiError = {
          message: errorMessage,
          code: data.code,
        };
        throw error;
      }

      return data.data;
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof DOMException && error.name === 'AbortError') {
        const timeoutError: ClientApiError = {
          message: '上传超时，请稍后重试',
          code: 'TIMEOUT',
        };
        throw timeoutError;
      }

      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const networkError: ClientApiError = {
          message: '网络连接失败，请检查网络设置',
          code: 'NETWORK_ERROR',
        };
        logger.error(`网络连接失败: ${endpoint}`, error);
        throw networkError;
      }

      logger.error(`上传失败: ${endpoint}`, error);
      throw error;
    } finally {
      this.requestCount--;
    }
  }

  isLoading(): boolean {
    return this.requestCount > 0;
  }
}

export const apiClient = new ApiClient();

export async function fetchWithCookie(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  })
}

/**
 * @deprecated 请使用 fetchWithCookie 替代（cookie 模式不再需要 Authorization 头，命名更准确）
 */
export const fetchWithAuth = fetchWithCookie
