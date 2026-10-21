'use client'

import { useState, useCallback, useRef } from 'react'
import { useDeferredEffect } from '@/hooks/useDeferredEffect'
import { useForbiddenRedirect } from '@/hooks/useForbiddenRedirect'
import { fetchWithCookie } from '@/lib/api/base'
import type { User } from '../_utils'

export interface UserListPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/**
 * 用户列表的数据获取 hook。
 * 支持服务端分页（page/pageSize）与服务端过滤（search/role）。
 * 处理初始加载、错误提示（含 403 跳转）与手动刷新。
 */
export function useUserList() {
  const scheduleForbiddenRedirect = useForbiddenRedirect()
  const [users, setUsers] = useState<User[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [pagination, setPagination] = useState<UserListPagination>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  })
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')
  // 首次加载才整页骨架；后续翻页/筛选保留旧列表，避免输入框失焦与页面闪烁
  const loadedOnceRef = useRef(false)
  // 请求序号：丢弃晚到的旧响应，避免快速输入/翻页时覆盖新数据
  const fetchSeq = useRef(0)

  const fetchUsers = useCallback(async () => {
    const seq = ++fetchSeq.current
    try {
      if (loadedOnceRef.current) setRefreshing(true)
      else setInitialLoading(true)
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      })
      if (search.trim()) params.set('search', search.trim())
      if (role !== 'all') params.set('role', role)

      const response = await fetchWithCookie(`/api/admin/users?${params.toString()}`)
      if (seq !== fetchSeq.current) return

      if (response.status === 403) {
        setError('需要管理员权限')
        scheduleForbiddenRedirect()
        return
      }

      const data = await response.json()
      if (seq !== fetchSeq.current) return
      if (data.success) {
        const payload = data.data
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : []
        setUsers(list)
        if (payload?.pagination) {
          setPagination((prev) => ({
            ...prev,
            page: payload.pagination.page || 1,
            pageSize: payload.pagination.limit || prev.pageSize,
            total: payload.pagination.total || 0,
            totalPages: payload.pagination.totalPages || 0,
          }))
        }
      } else {
        setError(data.error || '获取用户列表失败')
        setUsers([])
      }
    } catch {
      if (seq === fetchSeq.current) setError('网络错误')
    } finally {
      if (seq === fetchSeq.current) {
        loadedOnceRef.current = true
        setInitialLoading(false)
        setRefreshing(false)
      }
    }
  }, [pagination.page, pagination.pageSize, search, role, scheduleForbiddenRedirect])

  useDeferredEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  /** 切换页码（列表数据由服务端分页，无需清空本地） */
  const goToPage = useCallback((nextPage: number) => {
    setPagination((prev) => ({ ...prev, page: Math.max(1, nextPage) }))
  }, [])

  /** 切换每页条数：回到第 1 页重新拉取 */
  const changePageSize = useCallback((nextSize: number) => {
    setPagination((prev) => ({ ...prev, pageSize: Math.max(1, nextSize), page: 1 }))
  }, [])

  /** 更新过滤条件：回到第 1 页 */
  const applyFilters = useCallback((nextSearch: string, nextRole: string) => {
    setSearch(nextSearch)
    setRole(nextRole)
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [])

  return {
    users,
    initialLoading,
    refreshing,
    error,
    pagination,
    fetchUsers,
    goToPage,
    changePageSize,
    applyFilters,
    search,
    role,
  }
}
