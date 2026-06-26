'use client'

import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** 在客户端根据动态数据设置标签标题 */
export default function SetDocumentTitle({
  title,
}: {
  title: string | null | undefined
}) {
  useDocumentTitle(title)
  return null
}