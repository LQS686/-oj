/**
 * /healthcheck-static - 静态 liveness 页面
 *
 * 用途：docker-compose healthcheck 用作 liveness 探针。
 * 选择静态页面（而不是 API 路由）的理由：
 *   1) 静态页面编译到 .next/server/app 阶段即完成，无需运行时初始化
 *   2) 不依赖 DB / Redis / 任何外部依赖
 *   3) 不依赖 withApi / ok() / 任何 lib 工具
 *   4) 编译产物直接被 .next/standalone 追踪
 *   5) 容器编排层可高频探测（每秒）而不影响业务
 *
 * 注意：之前用 /api/health 失败的原因：
 *   - API route.ts 是事后添加，docker build 缓存命中可能未编译
 *   - 任何 import 失败都会让整个 route 不存在
 *   - 静态页面对应 .next/server/app/healthcheck-static.html，Next.js 强制编译
 */
export const dynamic = 'force-static'
export const revalidate = false

export default function HealthCheckStatic() {
  return (
    <div style={{ fontFamily: 'monospace', padding: '20px' }}>
      OK
    </div>
  )
}