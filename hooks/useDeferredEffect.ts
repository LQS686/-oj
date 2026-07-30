/**
 * useEffect 变体：将 effect 体推迟到 microtask，使 setState 落在
 * 「外部调度回调」中，满足 react-hooks/set-state-in-effect。
 *
 * 适用于：挂载拉数、URL/searchParams → 本地 state 同步等合理场景。
 */
'use client'

import { useEffect, type DependencyList, type EffectCallback } from 'react'

export function useDeferredEffect(effect: EffectCallback, deps: DependencyList): void {
  useEffect(() => {
    let alive = true
    let cleanup: void | (() => void)

    queueMicrotask(() => {
      if (!alive) return
      cleanup = effect()
    })

    return () => {
      alive = false
      if (typeof cleanup === 'function') cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 与 useEffect 同契约，由调用方声明 deps
  }, deps)
}
