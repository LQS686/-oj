'use client'

/**
 * useSearchParams 等需要的 Suspense 边界回退：布局稳定骨架，避免整页闪烁。
 */
export function RouteSuspenseFallback({ label = '加载中' }: { label?: string }) {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 space-y-6"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="h-9 w-44 rounded-lg bg-muted/80 animate-pulse" />
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-full max-w-sm rounded-lg bg-muted/60 animate-pulse" />
        <div className="h-10 w-24 rounded-lg bg-muted/60 animate-pulse" />
        <div className="h-10 w-20 rounded-lg bg-muted/50 animate-pulse" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-14 w-full rounded-xl bg-muted/45 animate-pulse"
            style={{ animationDelay: `${i * 45}ms` }}
          />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}
