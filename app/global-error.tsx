'use client'

/**
 * app/global-error.tsx
 * 全局根级错误边界（layout.tsx 自身抛错时也会触发）
 */

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 全局错误：直接 console.error 即可（logger 在该上下文可能不可用）
    console.error('Global error caught', error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '32rem' }}>
            <AlertTriangle
              size={64}
              color="#ef4444"
              style={{ margin: '0 auto 1.5rem' }}
            />
            <h1 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '1rem' }}>
              严重错误
            </h1>
            <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
              应用遇到了无法恢复的错误。请刷新页面或联系管理员。
            </p>
            <button
              onClick={reset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              <RefreshCw size={20} /> 重试
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
