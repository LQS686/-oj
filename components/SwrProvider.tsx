'use client'

/**
 * components/SwrProvider.tsx
 * SWR 全局 Provider：配置 fetcher + 默认行为
 *
 * 用法：在 app/layout.tsx 中包裹整个应用。
 */

import { ReactNode } from 'react'
import { SWRConfig } from 'swr'
import { swrFetcher } from '@/lib/api/swr'

export function SwrProvider({ children }: { children: ReactNode }) {
 return (
 <SWRConfig
 value={{
 fetcher: swrFetcher,
 // 默认 30s 重新拉取（去重 + 聚焦时）
 dedupingInterval: 30_000,
 revalidateOnFocus: false,
 revalidateIfStale: true,
 // 网络错误最多重试 2 次
 errorRetryCount: 2,
 errorRetryInterval: 3_000,
 // 错误时静默，不弹 toast（业务自行处理）
 onError: (err, key) => {
 if (process.env.NODE_ENV === 'development') {
 console.warn('[SWR] fetch failed:', key, err)
 }
 },
 }}
 >
 {children}
 </SWRConfig>
 )
}
