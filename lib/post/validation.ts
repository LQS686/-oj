/**
 * lib/post/validation.ts
 * 帖子参数校验
 */
import { required, optional, toInt } from '@/lib/api/validation'
import { validateObjectId } from '@/lib/api/validation'

export function parsePostListQuery(q: Record<string, string>) {
  return {
    keyword: optional(q.keyword),
    categoryId: q.categoryId ? validateObjectId(q.categoryId, 'categoryId') : undefined,
    page: toInt(q.page, 'page', 1),
    pageSize: toInt(q.pageSize, 'pageSize', 20),
  }
}

export function parsePostCreate(body: any) {
  return {
    title: required(body?.title, '标题'),
    content: required(body?.content, '内容'),
    categoryId: body?.categoryId ? validateObjectId(body.categoryId, 'categoryId') : undefined,
    tags: body?.tags || [],
  }
}

export function parseCommentCreate(body: any) {
  return {
    content: required(body?.content, '评论内容'),
    parentId: body?.parentId ? validateObjectId(body.parentId, 'parentId') : undefined,
  }
}
