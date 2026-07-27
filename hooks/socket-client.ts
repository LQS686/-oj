/**
 * 浏览器端 Socket.IO 单例：仅 WebSocket，禁止 HTTP long-polling。
 * 提交 / 通知 / 公告共用一条连接。
 *
 * - 挂到 globalThis，避免 HMR / 多份模块副本各建一条连接
 * - release 时延迟断开，避免 React Strict Mode「挂载→卸载→再挂载」把连接打爆
 */
'use client'

import { io, type Socket } from 'socket.io-client'

const DISCONNECT_GRACE_MS = 1500

type AppSocketStore = {
  socket: Socket | null
  referenceCount: number
  disconnectTimer: ReturnType<typeof setTimeout> | null
  /** 当前连接已确认进入的 user 房间 */
  joinedUserId: string | null
}

const g = globalThis as typeof globalThis & { __dsojAppSocket?: AppSocketStore }

function getStore(): AppSocketStore {
  if (!g.__dsojAppSocket) {
    g.__dsojAppSocket = {
      socket: null,
      referenceCount: 0,
      disconnectTimer: null,
      joinedUserId: null,
    }
  }
  return g.__dsojAppSocket
}

export function acquireAppSocket(): Socket {
  if (typeof window === 'undefined') {
    throw new Error('acquireAppSocket 仅可在浏览器调用')
  }

  const store = getStore()
  if (store.disconnectTimer) {
    clearTimeout(store.disconnectTimer)
    store.disconnectTimer = null
  }

  if (!store.socket) {
    const url = window.location.origin
    store.socket = io(url, {
      path: '/socket.io/',
      transports: ['websocket'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      withCredentials: true,
    })
    store.socket.on('disconnect', () => {
      store.joinedUserId = null
    })
  }

  store.referenceCount += 1
  return store.socket
}

export function releaseAppSocket(): void {
  const store = getStore()
  store.referenceCount = Math.max(0, store.referenceCount - 1)
  if (store.referenceCount > 0 || !store.socket) return

  if (store.disconnectTimer) {
    clearTimeout(store.disconnectTimer)
  }
  store.disconnectTimer = setTimeout(() => {
    store.disconnectTimer = null
    if (store.referenceCount === 0 && store.socket) {
      store.socket.disconnect()
      store.socket = null
      store.joinedUserId = null
    }
  }, DISCONNECT_GRACE_MS)
}

export function getAppSocketJoinedUserId(): string | null {
  return getStore().joinedUserId
}

export function setAppSocketJoinedUserId(userId: string | null): void {
  getStore().joinedUserId = userId
}
