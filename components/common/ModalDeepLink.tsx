'use client'

import { useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PageLoading } from './PageLoading'

/**
 * 「模态窗动作」的深链垫片。
 *
 * 本项目约定：创建 / 编辑一律在弹窗里完成，不做独立页面。
 * 但为了让这些动作仍可被直接访问与收藏（例如 /admin/contests/create），
 * 保留对应路由：访问时跳到承载弹窗的页面，并带上开启弹窗的查询参数。
 *
 * 每个垫片页面因此只需要一行声明，不要再各写一遍 useEffect + replace：
 *
 *   export default function Page() {
 *     return <ModalDeepLink to="/classes/:id?createAssignment=1" label="跳转中..." />
 *   }
 *
 * `to` 里的 :param 会用当前路由参数替换并做 URL 编码（支持多个参数）。
 */
export interface ModalDeepLinkProps {
  /** 目标地址，可含 :id / :solutionId 等占位符 */
  to: string
  /** 跳转期间的提示文案 */
  label?: string
}

export function ModalDeepLink({ to, label = '跳转中...' }: ModalDeepLinkProps) {
  const params = useParams()
  const router = useRouter()

  const target = useMemo(
    () =>
      to.replace(/:([A-Za-z0-9_]+)/g, (placeholder, key: string) => {
        const value = (params as Record<string, string | string[] | undefined> | null)?.[key]
        if (value === undefined) return placeholder
        return encodeURIComponent(Array.isArray(value) ? value[0] : value)
      }),
    [to, params]
  )

  useEffect(() => {
    router.replace(target)
  }, [target, router])

  return <PageLoading label={label} />
}

export default ModalDeepLink
