import type { Metadata } from 'next'
import { SITE_TITLE_SUFFIX } from '@/lib/document-title'

/** 生成与全站一致的页面 metadata.title */
export function pageMetadata(pageTitle: string): Metadata {
  const name = pageTitle.trim() || '页面'
  return {
    title: `${name} - ${SITE_TITLE_SUFFIX}`,
  }
}