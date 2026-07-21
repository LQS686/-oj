'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithCookie } from '@/lib/api/base'
import type { Problem } from '../_types'

/**
 * 题目列表的数据获取 hook。
 *
 * - fetchProblems: 拉取列表；首次加载走 initialLoading，后续刷新走 loading
 * - toggleVisibility: 行内切换可见性，乐观更新本地 state（public → private → contest → public 循环）
 * - allTags / allSources: 从已加载题目数据聚合的标签集合与来源集合，供筛选下拉使用
 *
 * 403 时设置错误并跳转 /403，与原实现保持一致。
 */
export function useProblemList() {
  const router = useRouter()
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchProblems = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) {
        setInitialLoading(true)
      } else {
        setLoading(true)
      }
      const response = await fetchWithCookie('/api/admin/problems')

      if (response.status === 403) {
        setError('需要管理员权限')
        setTimeout(() => router.push('/403'), 2000)
        return
      }

      const data = await response.json()
      if (data.success) {
        const payload = data.data
        setProblems(Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [])
      } else {
        setError(data.error || '获取题目列表失败')
        setProblems([])
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [router])

  const toggleVisibility = useCallback(async (problemId: string, currentVisibility: string) => {
    const nextVisibility =
      currentVisibility === 'public' ? 'private' :
      currentVisibility === 'private' ? 'contest' : 'public'

    try {
      const response = await fetchWithCookie(`/api/admin/problems/${problemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: nextVisibility })
      })

      const data = await response.json()
      if (data.success) {
        setProblems(prev => prev.map(p =>
          p.id === problemId
            ? { ...p, visibility: nextVisibility, isPublic: nextVisibility === 'public' }
            : p
        ))
      } else {
        alert(data.error || '操作失败')
      }
    } catch {
      alert('网络错误')
    }
  }, [])

  // 聚合所有标签（去重 + 按拼音/字母排序），供筛选下拉使用
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const p of problems) {
      if (Array.isArray(p.tags)) {
        for (const t of p.tags) {
          if (t) tagSet.add(t)
        }
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }, [problems])

  // 聚合所有来源（去重 + 过滤空值 + 排序），供筛选下拉使用
  const allSources = useMemo(() => {
    const sourceSet = new Set<string>()
    for (const p of problems) {
      if (p.source && p.source.trim()) {
        sourceSet.add(p.source.trim())
      }
    }
    return Array.from(sourceSet).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }, [problems])

  useEffect(() => {
    fetchProblems(true)
  }, [fetchProblems])

  return {
    problems,
    loading,
    initialLoading,
    error,
    fetchProblems,
    toggleVisibility,
    allTags,
    allSources,
  }
}
