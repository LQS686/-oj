/**
 * 必须在 import 'next' 之前执行。
 * Next.js 依赖 globalThis.AsyncLocalStorage；经 tsx/自定义 server 启动时
 * 不会自动跑 node-environment-baseline，Node 24 上会直接崩：
 *   Invariant: AsyncLocalStorage accessed in runtime where it is not available
 */
import { AsyncLocalStorage } from 'node:async_hooks'

const g = globalThis as typeof globalThis & {
  AsyncLocalStorage?: typeof AsyncLocalStorage
}

if (typeof g.AsyncLocalStorage !== 'function') {
  g.AsyncLocalStorage = AsyncLocalStorage
}
