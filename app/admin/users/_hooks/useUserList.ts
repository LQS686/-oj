'use client'

import { useState, useCallback } from 'react'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pagination, setPagination] = useState<UserListPagination>({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0,
  })
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('all')

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      })
      if (search.trim()) params.set('search', search.trim())
      if (role !== 'all') params.set('role', role)

      const response = await fetchWithCookie(`/api/admin/users?${params.toString()}`)

      if (response.status === 403) {
        setError('需要管理员权限')
        scheduleForbiddenRedirect()
        return
      }

      const data = await response.json()
      if (data.success) {
        const payload = data.data
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : []
        setUsers(list)
        if (payload?.pagination) {
          setPagination({
            page: payload.pagination.page || 1,
            pageSize: payload.pagination.limit || pagination.pageSize,
            total: payload.pagination.total || 0,
            totalPages: payload.pagination.totalPages || 0,
          })
        }
      } else {
        setError(data.error || '获取用户列表失败')
        setUsers([])
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
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
    loading,
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
