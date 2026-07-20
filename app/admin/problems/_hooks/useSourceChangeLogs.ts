'use client'

import { useState, useCallback } from 'react'
import { fetchWithCookie } from '@/lib/api/base'
import type { LogEntry } from '../_types'

/**
 * 来源变更日志 hook。
 *
 * 仅负责拉取 /api/admin/logs/source-changes；由调用方决定何时触发
 * （页面在切换到 logs tab 时调用 fetchLogs）。
 */
export function useSourceChangeLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res = await fetchWithCookie('/api/admin/logs/source-changes')
      const data = await res.json()
      if (data.success) {
        setLogs(Array.isArray(data.data) ? data.data : [])
      }
    } catch (err) {
      console.error('获取来源变更日志失败', err)
    } finally {
      setLogsLoading(false)
    }
  }, [])

  return { logs, logsLoading, fetchLogs }
}
