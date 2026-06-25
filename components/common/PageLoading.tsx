'use client'

export function PageLoading({ label = '加载中...' }: { label?: string }) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-center">
        <div className="relative w-12 h-12 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-border" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="text-muted-foreground text-sm">{label}</p>
      </div>
    </div>
  )
}