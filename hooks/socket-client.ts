/**
 * 浏览器端 Socket.IO 单例：仅 WebSocket，禁止 HTTP long-polling。
 * 提交 / 通知 / 公告共用一条连接，避免多 hook 重复建连与 transport 降级。
 */
'use client'

import { io, type Socket } from 'socket.io-client'

let sharedSocket: Socket | null = null
let referenceCount = 0

export function acquireAppSocket(): Socket {
  if (typeof window === 'undefined') {
    throw new Error('acquireAppSocket 仅可在浏览器调用')
  }
  if (!sharedSocket) {
    const url = window.location.origin
    sharedSocket = io(url, {
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
  }
  referenceCount += 1
  return sharedSocket
}

export function releaseAppSocket(): void {
  referenceCount = Math.max(0, referenceCount - 1)
  if (referenceCount === 0 && sharedSocket) {
    sharedSocket.disconnect()
    sharedSocket = null
  }
}
