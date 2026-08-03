'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 403 跳转统一封装：在组件顶层调用一次，返回 scheduleForbiddenRedirect。
 * 内部用 ref 保存跳转 timer，组件卸载时自动清理，避免卸载后跳转 / setState 泄漏。
 */
export function useForbiddenRedirect(delayMs = 2000) {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const scheduleForbiddenRedirect = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void router.push('/403')
    }, delayMs)
  }, [router, delayMs])

  return scheduleForbiddenRedirect
}