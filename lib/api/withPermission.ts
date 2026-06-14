/**
 * lib/api/withPermission.ts
 * 细粒度权限校验包装器（与 withApi.auth 配合使用）
 *
 * 用法：
 *   export const POST = withApi.auth(
 *     withPermission('problem.create')(async (req, ctx, { user }) => {
 *       // 业务逻辑
 *     })
 *   )
 *
 * 行为：
 *   - opts.user 不存在：返回 401 UNAUTHORIZED
 *   - hasPermission(user, code) === false：返回 403 FORBIDDEN
 *   - 通过：透传到原 handler
 */

import { withApi, fail } from './withApi'
import { hasPermission } from '@/lib/permissions'
import type { PermissionCode } from '@/lib/permissions/types'

/**
 * 包装需要权限校验的 API handler
 * 适配 withApi.auth 的 handler 签名：
 *   (req: NextRequest, ctx: ApiContext, context: { user: AuthUser }) => Promise<Response | unknown>
 */
export function withPermission(code: PermissionCode) {
  return function <H extends (req: any, ctx: any, opts: any) => Promise<any>>(
    handler: H
  ) {
    return async (req: any, ctx: any, opts: any) => {
      if (!opts?.user) {
        return fail('UNAUTHORIZED', '未登录', 401)
      }
      const ok = await hasPermission(opts.user, code)
      if (!ok) {
        return fail('FORBIDDEN', `无权限：${code}`, 403)
      }
      return handler(req, ctx, opts)
    }
  }
}

// 显式 re-export 供调用方 import
export { withApi }
